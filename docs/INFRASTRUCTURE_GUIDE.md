# Infrastructure Guide: Redis, RabbitMQ, Docker, CI/CD

This guide explains the four infrastructure pieces added to Warranty Storage: what each one is, how it works in this codebase, and why it was chosen over the alternatives.

---

## 1. Big Picture

```
                    ┌──────────────┐
  Browser ─────────▶│ Vercel (CRA) │  (unchanged)
                    └──────┬───────┘
                           │ HTTPS
                    ┌──────▼───────────────────────────────┐
                    │ Render: Express (app.js)             │
                    │  ├─ routes / controllers             │
                    │  ├─ cache/redis.js ──────────────────┼──▶ Redis (Upstash)
                    │  ├─ queue/rabbit.js   publish ───────┼──▶ RabbitMQ (CloudAMQP)
                    │  └─ queue/emailWorker.js  consume ◀──┼─── "email" queue
                    │        └─▶ SendGrid HTTP API         │
                    └──────┬───────────────────────────────┘
                           ▼
                    MongoDB Atlas (unchanged)

GitHub push ─▶ GitHub Actions: check ─▶ build ─▶ docker build ─▶ Render deploy hook
```

### Files added

| File | Role |
|---|---|
| `backend/cache/redis.js` | Redis client plus `get`, `set`, `delPattern`, `escapeKey`, `close` |
| `backend/queue/rabbit.js` | RabbitMQ connection, queue setup, `publish`, `consume`, retry logic, reconnect |
| `backend/queue/emailWorker.js` | Consumes the `email` queue and sends through SendGrid |
| `backend/Dockerfile` | Recipe for the backend container image |
| `backend/.dockerignore` | Files kept out of the image |
| `backend/.env.example` | Template listing every environment variable |
| `.node-version`, `backend/.node-version` | Pin Node 22 on Render (`ioredis` 6 needs Node 20+) |
| `docker-compose.yml` | Local stack: backend + Redis + RabbitMQ |
| `.github/workflows/ci.yml` | The CI/CD pipeline |

### Files changed

| File | Change |
|---|---|
| `backend/app.js` | `PORT` comes from the environment. Adds `GET /health`. Starts the email worker and RabbitMQ connection. Shuts down cleanly on `SIGTERM`/`SIGINT`. |
| `backend/controllers/functions.js` | `getWarranty` reads from and writes to the cache. `uploadwarranty` and `updatewarrantystatus` clear the cache. The 3 email sends (`Contact`, `rejectionmail`, `OTP`) go through the queue. |
| `backend/package.json` | Adds `ioredis` and `amqplib`, a `start` script, and `"engines": { "node": ">=20 <23" }`. |

### The one rule behind every design choice

Every new service is **optional**:
- With no `REDIS_URL`, there is no cache and every read goes to MongoDB.
- With no `AMQP_URL`, emails are sent directly inside the request, exactly as before.
- If Redis or RabbitMQ goes down while the app is running, the app falls back the same way and keeps working.

So a teammate can still run `npm run dev` with only the old `.env`.

---

## 2. Redis: the Caching Layer

### 2.1 What it is

Redis is an in-memory key-value database. Reads and writes take well under a millisecond because the data lives in RAM. It is mostly used as a **cache**: a fast copy of data whose real home is a slower database (here, MongoDB Atlas).

Key ideas:

| Term | Meaning |
|---|---|
| **Cache hit / miss** | Hit: the value is in Redis, so it is returned immediately. Miss: it is not, so it is loaded from MongoDB. |
| **Cache-aside** | The app checks the cache itself. On a miss, it loads from the database and stores the result in the cache. This is the pattern used here. |
| **TTL** (time to live) | Redis deletes a key automatically after N seconds. |
| **Invalidation** | Deleting cached data when the real data changes, so users never see old values. |

### 2.2 How it works here

**Reading the client dashboard** (`POST /warranty/setup/getwarranty`):

```
request ─▶ key = "warranties:<email>:<page>:<limit>"
           │
           ├─ Redis has key? ──yes──▶ return cached JSON   (no MongoDB query)
           │
           └─ no ─▶ MongoDB find + count ─▶ store in Redis for 120s ─▶ return
```

The code in `functions.js`:

```js
const key = `warranties:${req.body.email}:${page}:${limit}`;
const cached = await cache.get(key);
if (cached) return res.status(200).json(cached);
// ...MongoDB query...
await cache.set(key, result, 120);
```

**Writing** (`uploadwarranty` and `updatewarrantystatus`): after MongoDB is updated, every cached page for that user is deleted:

```js
await cache.delPattern(`warranties:${cache.escapeKey(email)}:*`)
```

The next dashboard load is therefore a miss and shows fresh data. The delete is **awaited before the response is sent**, so a user who adds a warranty sees it on the very next refresh.

### 2.3 Details that matter

- **`.select('-invoice')` on the cached query.** Each warranty document stores the invoice image as a Buffer. Caching those would put megabytes of images into Redis for every user and use up a free plan within days. The client dashboard never displays `invoice`, so removing it changes nothing visible. `.lean()` returns plain objects, which serialize to the same JSON as before.
- **Why the merchant list is not cached.** The merchant page (`MerchantValidation.js`) downloads invoices straight from the list response. Caching that list would mean caching the images. It stays uncached until invoices get their own endpoint.
- **`SCAN`, not `KEYS`.** `KEYS pattern` blocks Redis while it walks every key. `SCAN` walks in small batches without blocking. `delPattern` loops `SCAN ... MATCH ... COUNT 100` until the cursor returns to `0`.
- **`escapeKey`.** Redis patterns treat `* ? [ ] \` as wildcards. An email containing one of those could otherwise match other users' keys. `escapeKey` escapes them.
- **The 120s TTL is a safety net.** Even if an invalidation is missed (for example, Redis blips during a write), stale data disappears within 2 minutes.
- **Failure behavior.** The client is created with `enableOfflineQueue: false` and `maxRetriesPerRequest: 1`. If Redis is unreachable, commands fail at once instead of queuing. Every helper catches errors and returns `null` or does nothing, so a Redis outage only means "no cache".

### 2.4 Why Redis, and why Upstash

| Option | Verdict |
|---|---|
| **In-process memory** (a JS object or `node-cache`) | Lost on every restart, and Render free restarts often (it sleeps after 15 min idle). Not shared if you ever run two instances. |
| **Memcached** | Fast, but has no `SCAN`-style pattern deletes, no persistence, and few free hosts. |
| **Redis** | Industry standard, rich data types, TTLs, pattern scans. Free managed hosting exists. Also ready for future uses such as rate limiting or an OTP store. |

**Upstash** hosts Redis with a permanent free plan: 256 MB and 500,000 commands per month. A cached read costs 1–2 commands and a write costs 2–3, so a demo-scale app stays far below the limit. Upstash requires TLS. Use the `rediss://` URL (two `s`) and ioredis enables TLS automatically.

---

## 3. RabbitMQ: the Message Queue

### 3.1 What it is

A message queue sits between the code that **asks** for work (the producer) and the code that **does** it (the consumer). The producer drops a message on a queue and moves on. A consumer picks it up and processes it, now or later.

RabbitMQ is a message broker that holds these queues.

| Term | Meaning |
|---|---|
| **Producer / publish** | Code that puts a message on a queue (`publish('email', mailData)`). |
| **Consumer / worker** | Code that receives messages and does the work (`emailWorker.js`). |
| **Ack** (acknowledge) | The consumer tells RabbitMQ "done, delete it". Without an ack, the message is redelivered if the consumer dies. |
| **Durable queue** | The queue survives a broker restart. |
| **Persistent message** | The message is written to disk, so it survives a broker restart. |
| **Prefetch** | The maximum number of un-acked messages a consumer holds at once (5 here). This stops one worker hoarding work. |
| **Publisher confirm** | The broker tells the producer "I have safely stored this message". |
| **TTL + dead-lettering** | A message that waits in a queue longer than its TTL is moved ("dead-lettered") to another queue. This is used here to build delayed retries. |

### 3.2 Why emails go through a queue

Before, every email was sent **inside** the HTTP request with `await sgMail.send(...)`. That caused three problems:
1. The user waited for SendGrid's round trip on every contact form, OTP, and rejection.
2. If SendGrid had a hiccup, the email was simply lost. The error was only logged.
3. There was no retry.

Now the request only drops the email on the queue, which takes milliseconds. The worker sends it and **retries on failure**.

### 3.3 How it works here

```
functions.js: publish('email', mailData)
      │
      ▼
 [email] ──worker: sgMail.send ok──▶ ack (done)
      │
      │ failed, attempts < 5
      ▼
 [email.retry]  waits 30s (queue TTL) ──dead-letters back──▶ [email]
      │
      │ failed 5 times
      ▼
 [email.dead]   parked for inspection in the RabbitMQ dashboard
```

Step by step:
1. `app.js` calls `startEmailWorker()`, which registers the handler for the `email` queue. It then calls `queue.connect()`.
2. `connect()` opens one connection and one **confirm channel**. It declares three durable queues: `email`, `email.retry`, and `email.dead`. Then it starts consuming `email` with prefetch 5.
3. `publish()` sends the message as persistent JSON and waits for the broker's confirm. Only then is the email "queued".
4. The worker runs `sgMail.send`:
   - **Success:** ack.
   - **Failure:** the message is copied to `email.retry` with an `x-attempts` header incremented, then the original is acked.
5. `email.retry` has `x-message-ttl: 30000`, `x-dead-letter-exchange: ''`, and `x-dead-letter-routing-key: 'email'`. After 30 seconds, RabbitMQ moves the message back to `email` for another try.
6. After 5 attempts the message goes to `email.dead` instead, so a permanently broken email cannot loop forever.

**Not retried:** SendGrid 4xx errors (invalid address, bad sender) other than 429 rate limits. Retrying cannot fix them, so the worker logs them and gives up.

**Fallback:** if `AMQP_URL` is empty, or the broker is down, or a publish fails, `publish()` calls the same `sendEmail` handler directly. That is the old behavior, and the existing `try/catch` around each call still logs any error.

**Reconnect:** if the connection drops, the module retries every 5 seconds. On reconnect it re-declares the queues and re-attaches the consumer. While it is disconnected, emails go out through the fallback.

**Delivery guarantee:** at-least-once. If the app crashes after sending but before acking, the email can be sent twice. For notification emails that is acceptable.

### 3.4 Why the worker runs inside the web server

Render's free plan offers web services only. Background workers start on paid plans. So the consumer runs inside the same Node process as Express.

While Render sleeps (after 15 minutes idle), messages wait safely in RabbitMQ and are processed when the service wakes. When you upgrade later, move `startEmailWorker()` into its own `worker.js` process. Nothing else changes.

### 3.5 Why RabbitMQ, not BullMQ or Kafka

| Option | What it is | Verdict for this project |
|---|---|---|
| **No queue** | The old way | No retries, slower responses, lost emails |
| **BullMQ** | Job queue library built on Redis | Workers keep polling Redis even when idle. On Upstash's free 500K commands/month, idle polling alone uses most of the quota and would starve the cache. |
| **Kafka** | Distributed event log for very high throughput and replay | Built for millions of events. Needs a cluster (about 1 GB+ RAM). No permanent free managed plan exists. Too heavy for a task queue. |
| **RabbitMQ** | Message broker designed for task queues | Push-based, so an idle consumer costs nothing. Has built-in acks, retries via TTL and dead-lettering, and durability. CloudAMQP offers a permanent free plan. |

**CloudAMQP "Little Lemur"** (free): 1M messages/month, 20 connections, 100 queues. This app uses 1 connection and 3 queues. Queues idle for 28 days may be removed by CloudAMQP; the app re-declares them on every connect, so that is harmless.

---

## 4. Docker: Containerization

### 4.1 What it is

Docker packages an app **together with its runtime** (OS libraries, Node version, `node_modules`) into an **image**. Running an image gives a **container**: an isolated process that behaves the same on your laptop, a teammate's laptop, CI, or a server. That removes "works on my machine" problems.

| Term | Meaning |
|---|---|
| **Image** | A read-only snapshot built from a `Dockerfile` |
| **Container** | A running instance of an image |
| **Dockerfile** | Step-by-step recipe for building the image. Each step is a cached **layer**. |
| **.dockerignore** | Files never copied into the image |
| **Docker Compose** | Runs several containers together from one `docker-compose.yml` |
| **Healthcheck** | A command Docker runs periodically to decide whether a container is healthy |
| **Volume** | Storage that survives a container being recreated |

### 4.2 The backend Dockerfile, line by line

```dockerfile
FROM node:22-bookworm-slim          # Node 22 LTS on slim Debian
WORKDIR /app
COPY package*.json ./                # copy only the dependency list first...
RUN npm ci --omit=dev                # ...so this layer stays cached until dependencies change
COPY . .                             # then the source code
ENV NODE_ENV=production
USER node                            # don't run as root
EXPOSE 5000
HEALTHCHECK ... fetch('/health')     # Docker marks the container unhealthy if /health fails
CMD ["node", "app.js"]
```

- **Why `bookworm-slim` and not `alpine`:** `bcrypt` is a native module. Its prebuilt binaries target glibc, which Debian has and Alpine (musl) lacks. On Alpine, the install would try to compile with tools that are not there.
- **Why Node 22:** Node 20 reached end of life in April 2026, and `ioredis` 6 needs Node 20 or newer. Node 22 is a supported LTS release.
- **Why copy `package*.json` before the source:** editing code does not invalidate the `npm ci` layer, so rebuilds take seconds.
- **`.env` is never baked into the image** (`.dockerignore`). Secrets are passed at runtime with `env_file` or the hosting platform's settings.

### 4.3 docker-compose.yml

Three services:

| Service | Image | Notes |
|---|---|---|
| `backend` | built from `./backend` | Reads `backend/.env`, then overrides `REDIS_URL` and `AMQP_URL` to point at the containers. Starts only after both are healthy (`depends_on: condition: service_healthy`). |
| `redis` | `redis:7.4-alpine` | Healthcheck `redis-cli ping` |
| `rabbitmq` | `rabbitmq:4.1-management-alpine` | Includes the web dashboard on port 15672. Healthcheck `rabbitmq-diagnostics -q ping`. Data is kept in the `rabbitmq_data` volume. |

Things to know:
- **Inside Compose, services reach each other by service name** (`redis://redis:6379`, `amqp://...@rabbitmq:5672`), not `localhost`.
- **RabbitMQ's default `guest` user can only log in from localhost**, so it cannot connect from another container. Compose creates the user `warranty` / `warranty` instead.
- **MongoDB is not in Compose.** The backend keeps using your Atlas `URI`, which keeps the local stack small and identical to production data access.
- **The frontend is not containerized.** It is hosted on Vercel, and its API URL is hardcoded to the Render backend, so a frontend container would still call production.

### 4.4 Why Docker

- One command reproduces the whole backend stack, including Redis and RabbitMQ, without installing either.
- CI builds the same image, so a broken build is caught before deploy.
- Render can run the same Dockerfile if you switch the service's runtime to Docker. That is optional; the current Node runtime keeps working.

---

## 5. CI/CD: GitHub Actions + Render Deploy Hook

### 5.1 What it is

- **CI (Continuous Integration):** every push or pull request is automatically installed, checked, and built, so mistakes are caught before they reach `main`.
- **CD (Continuous Deployment):** once CI passes on `main`, the app is deployed automatically.

**GitHub Actions** runs these steps on GitHub's machines (runners). A **workflow** (`.github/workflows/ci.yml`) contains **jobs**; jobs contain **steps**. `needs:` makes one job wait for others. **Secrets** are encrypted values (like the deploy URL) that never appear in the code.

### 5.2 The pipeline

```
push / pull request
   ├── backend   npm ci ─▶ node --check on every .js file
   ├── frontend  npm ci ─▶ npm run build
   │        (both must pass)
   ▼
 docker     docker build ./backend
   ▼  (only on push to main)
 deploy     curl -X POST $RENDER_DEPLOY_HOOK_URL
```

| Job | Why it exists |
|---|---|
| `backend` | `npm ci` proves `package-lock.json` installs cleanly. `node --check` catches syntax errors in every file. There are no unit tests yet; add `npm test` here when there are. |
| `frontend` | Proves the React app still compiles. `CI: false` is set because CRA treats ESLint warnings as errors when `CI=true`, and the current code has a few warnings (unused variables). |
| `docker` | Proves the image builds, so a broken Dockerfile never reaches Render. |
| `deploy` | Calls Render's deploy hook, only for pushes to `main` after everything passed. If the secret is missing, the step skips instead of failing. |

### 5.3 Why a deploy hook, with auto-deploy off

By default Render deploys **every** push to `main`, even one that fails to build. With auto-deploy off, Render deploys only when the hook is called, and the hook is called only after CI passes. So **only verified commits go live**.

Vercel keeps its own Git integration for the frontend, unchanged.

### 5.4 Why GitHub Actions

It is already where the code lives and needs no extra account. It is free for public repositories (2,000 minutes/month for private ones). Each run of this pipeline takes about 3–4 minutes.

---

## 6. Setup, Step by Step

### 6.1 Production (free)

1. **Upstash Redis**
   1. Sign up at upstash.com, then create a Redis database in the region closest to your Render service.
   2. Copy the `rediss://default:<password>@<host>:6379` URL.
2. **CloudAMQP**
   1. Sign up at cloudamqp.com, then create an instance on the **Little Lemur** (free) plan in a nearby region.
   2. Copy the `amqps://...` URL from the instance details.
3. **Render** (backend service)
   1. Under *Environment*, add `REDIS_URL` and `AMQP_URL` with the URLs above.
   2. Under *Settings*, set **Auto-Deploy** to **No**.
   3. Under *Settings*, copy the **Deploy Hook** URL.
   4. Make sure the start command is `node app.js` (or `npm start`).
   5. Check the Node version. Render reads `.node-version` (22) from the service's root directory. If an old `NODE_VERSION` env var is set on the service, delete it or set it to `22`, because it overrides the file.
4. **GitHub**
   1. Go to *Settings → Secrets and variables → Actions → New repository secret*.
   2. Name it `RENDER_DEPLOY_HOOK_URL` and paste the hook URL.
5. Push to `main`. Watch the *Actions* tab, then the Render logs.

### 6.2 Local with Docker

```bash
# one-time on Linux: allow your user to use Docker without sudo, then log out and back in
sudo usermod -aG docker $USER

cp backend/.env.example backend/.env   # fill in URI, Email, SENDGRID_API_KEY, JWT_SECRET, Api_key
docker compose up --build
```

- Backend: `http://localhost:5000/health`
- RabbitMQ dashboard: `http://localhost:15672` (`warranty` / `warranty`)

### 6.3 Local without Docker

Nothing changes: `cd backend && npm run dev`. Leave `REDIS_URL` and `AMQP_URL` empty.

---

## 7. How to Check It Works

| Check | Expected |
|---|---|
| Backend startup logs | `Redis connected`, `RabbitMQ connected`, `Server is on` |
| Submit the Contact form | Request logs `Email queued`, then the worker logs `Email sent via SendGrid` |
| RabbitMQ dashboard → *Queues* | `email`, `email.retry`, `email.dead` exist. Message rates move when emails are sent. |
| Load the client dashboard twice | The second load is served from Redis. In `redis-cli`, `SCAN 0 MATCH warranties:*` shows the key. |
| Add a warranty, then reload | The new warranty appears at once (the cache was cleared) |
| `GET /health` | `{"ok":true}` |
| A push to `main` | All 4 jobs are green in *Actions*, then a new deploy appears in Render |

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Redis error: connect ECONNREFUSED` repeating | Wrong `REDIS_URL`, or Redis is not running. The app still works without a cache. For Upstash, use `rediss://`, not `redis://`. |
| `RabbitMQ connect failed: ... ACCESS_REFUSED` | Wrong user or password in `AMQP_URL`. In Compose, don't use `guest`. |
| `RabbitMQ connect failed` on Render | Use the **AMQPS** URL from CloudAMQP. Check the instance is not paused. |
| Messages piling up in `email.dead` | SendGrid keeps failing (key revoked, sender not verified, quota). Read the `x-error` header in the dashboard. |
| `permission denied ... docker.sock` | Your user is not in the `docker` group (see 6.2), or use `sudo docker compose up`. |
| Frontend CI job fails | The build broke. Run `CI=false npm run build` in `frontend/` locally to see the error. |
| Deploy job says "skipping deploy" | The `RENDER_DEPLOY_HOOK_URL` secret is not set. |
| Old data shown for up to 2 minutes | An invalidation was missed during a Redis outage. The 120s TTL clears it automatically. |

---

## 9. Free-Tier Summary

| Service | Free allowance | This app's usage |
|---|---|---|
| Upstash Redis | 256 MB, 500K commands/month | A few KB per cached user. 1–3 commands per request. |
| CloudAMQP Little Lemur | 1M messages/month, 20 connections | 1 connection. 1 message per email, plus retries. |
| GitHub Actions | Free for public repos | About 3–4 minutes per push |
| Render web service | Free (sleeps after 15 min idle) | Unchanged |
| Vercel | Free Hobby plan | Unchanged |

**Note on email:** SendGrid retired its permanent free plan in 2025. New accounts get a 60-day trial. If your SendGrid account stops sending, swap the provider inside `queue/emailWorker.js` (for example Brevo, which offers 300 emails/day free). Nothing else needs to change, because every email already flows through that one function.
