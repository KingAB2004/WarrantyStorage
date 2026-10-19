# WarrantyStorage: Infra Plan (Redis, RabbitMQ, Docker, CI/CD)

Scope: only these four. No feature, UI or auth changes.
Goal: smallest possible diff to existing code. Almost everything is new files.

---

## 1. Architecture

```
                    ┌──────────────┐
  Browser ─────────▶│ Vercel (CRA) │  (unchanged)
                    └──────┬───────┘
                           │ HTTPS
                    ┌──────▼───────────────────────────────┐
                    │ Render: Express (app.js)             │
                    │  ├─ routes/controllers (unchanged)   │
                    │  ├─ cache/redis.js ──────────────────┼──▶ Redis (Upstash)
                    │  ├─ queue/rabbit.js  publish ────────┼──▶ RabbitMQ (CloudAMQP)
                    │  └─ queue/emailWorker.js  consume ◀──┼─── queue "email"
                    │        └─▶ SendGrid HTTP API         │
                    └──────┬───────────────────────────────┘
                           ▼
                    MongoDB Atlas (unchanged)

GitHub push ─▶ GitHub Actions: install ─▶ build check ─▶ docker build ─▶ Render deploy hook
```

Request flow after the change:
- `POST /getwarranty`: check Redis first. On a miss, read Mongo and store the result for 120s.
- `uploadwarranty` / `updatewarrantystatus`: write Mongo, then delete that user's cached list.
- Emails (`Contact`, `rejectionmail`, `OTP`): put a job on the `email` queue and respond at once. The worker sends it with retries.

**Why RabbitMQ, not BullMQ:**
- BullMQ runs on Redis and polls it even when idle. That alone uses up most of Upstash's free 500K commands/month.
- RabbitMQ pushes messages to the worker, so an idle worker costs nothing.

**Why the worker runs inside `app.js`:** Render's free plan has no background workers. Jobs wait in RabbitMQ while the service sleeps and run when it wakes.

**Fallback:**
- No `REDIS_URL`: caching is skipped.
- No `AMQP_URL`: emails are sent directly, as today.

So local dev keeps working with no new services.

---

## 2. What We Are Adding

### New files

| File | Purpose |
|---|---|
| `backend/cache/redis.js` | ioredis client plus `get` / `set` / `del` helpers. Every helper fails silently if Redis is down. |
| `backend/queue/rabbit.js` | Connects, declares the queues, `publish()`, reconnect loop. |
| `backend/queue/emailWorker.js` | Consumes `email`, calls `sgMail.send`. On failure it retries (5 tries, 30s apart), then moves the job to `email.dead`. |
| `backend/Dockerfile` | Node 22 slim image, runs `node app.js`. |
| `backend/.dockerignore` | `node_modules`, `.env` |
| `docker-compose.yml` | Local stack: `backend` + `redis` + `rabbitmq` (management UI on :15672). Mongo stays on Atlas through `.env`. |
| `.github/workflows/ci.yml` | Pipeline: backend check, frontend build, docker build, deploy. |
| `backend/.env.example` | Lists all env keys (empty values). |

### Changed files (small edits only)

| File | Change |
|---|---|
| `backend/package.json` | Add deps `ioredis`, `amqplib`. Add script `"start": "node app.js"`. |
| `backend/app.js` | `port = process.env.PORT \|\| 5000`, add `GET /health`, start the queue and worker in `start()`, close cleanly on `SIGTERM`. About 10 lines. |
| `backend/controllers/functions.js` | (a) `getWarranty`: cache read/write, plus `.select('-invoice')`. (b) `uploadwarranty`, `updatewarrantystatus`: one `cache.del(...)` line each. (c) 3 places: `await sgMail.send(mailData)` becomes `await publish('email', mailData)`. |

Not touched: frontend code, routes, schema, auth, chatbot.

---

## 3. Change Points in Existing Code

**`app.js`**

```js
const queue=require('./queue/rabbit')
const startEmailWorker=require('./queue/emailWorker')
app.get('/health',(req,res)=>res.json({ ok: true }))
const port=process.env.PORT || 5000
// inside start(), after connectDB:
await queue.connect()
startEmailWorker()
```

**`functions.js` → `getWarranty`**

```js
const key = `warranties:${req.body.email}:${page}:${limit}`
const cached = await cache.get(key)
if (cached) return res.status(200).json(cached)
const warranty = await UserWarranty.find({ email: req.body.email }).select('-invoice').skip(skip).limit(limit).lean();
...
await cache.set(key, { data: warranty, total, page, limit }, 120)
```

- `.select('-invoice')` is required. Without it, every cached entry holds the image buffers.
- The client dashboard never reads `invoice`, so nothing breaks.

**`functions.js` → invalidation** (in `uploadwarranty` and `updatewarrantystatus`)

```js
await cache.delPattern(`warranties:${email}:*`)
```

`delPattern` uses `SCAN`, not `KEYS`. Each user has only a few keys. In `updatewarrantystatus`, read `email` from the document `findByIdAndUpdate` returns.

**`functions.js` → emails** (in `Contact`, `rejectionmail`, `OTP`)

```js
await publish('email', mailData)
```

The existing `try/catch` around each call stays as it is.

**Merchant list (`fetchvalidations`) is not cached.** Its UI downloads the invoice from the list response, so caching it means caching the files. Leave it uncached for now.

---

## 4. Queue Layout (RabbitMQ)

```
publish('email', job)
      │
      ▼
 [email] ──worker ok──▶ ack
      │ fail (try < 5)
      ▼
 [email.retry]  TTL 30s ──dead-letters back──▶ [email]
      │ fail (try = 5)
      ▼
 [email.dead]   (inspect in CloudAMQP UI)
```

- All queues are durable and messages are persistent, so jobs survive a restart.
- Worker prefetch is 5.
- `publish` never throws. If RabbitMQ is down, it sends the email directly.

---

## 5. CI/CD Pipeline (`.github/workflows/ci.yml`)

Triggers: push to `main`, and every pull request.

| Job | Steps |
|---|---|
| `backend` | checkout, Node 22, `npm ci`, `node --check` on every `.js` file (no tests exist yet) |
| `frontend` | checkout, Node 22, `npm ci`, `npm run build` with `CI=false` (CRA otherwise fails on the current lint warnings) |
| `docker` | needs both, `docker build ./backend` (proves the image builds) |
| `deploy` | needs `docker`, only on `main`: `curl -X POST $RENDER_DEPLOY_HOOK_URL` |

- Render: turn auto-deploy **off**. Then only commits that pass CI get deployed.
- Vercel: no change. It keeps auto-deploying the frontend from Git.

---

## 6. Setup Needed

| Item | Free? | What to do |
|---|---|---|
| Upstash Redis | Yes: 256 MB, 500K commands/month | Create a DB. Copy the `rediss://...` URL into `REDIS_URL` on Render. |
| CloudAMQP (Little Lemur) | Yes: 1M messages/month, 20 connections | Create an instance. Copy the `amqps://...` URL into `AMQP_URL` on Render. |
| Render | Yes (free web service) | Add the two env vars above. Settings: auto-deploy off. Copy the Deploy Hook URL. |
| GitHub | Yes (public repo) | Repo secret `RENDER_DEPLOY_HOOK_URL`. |
| Docker (local) | Yes | Install Docker + Compose. Run `docker compose up --build`. |

New env keys: `REDIS_URL`, `AMQP_URL`, `PORT` (optional).

**Free deployment:** yes, everything above stays on free tiers. Render can keep its current Node runtime. The Dockerfile is used for local runs and CI. Switching Render to the Docker runtime later is optional.

---

## 7. Gotchas Already Handled

- Upstash needs TLS. Use the `rediss://` URL; ioredis turns on TLS automatically.
- The RabbitMQ `guest` user cannot connect from another container. Compose sets `RABBITMQ_DEFAULT_USER` / `RABBITMQ_DEFAULT_PASS`.
- Render sets `PORT`, which is why `app.js` reads it.
- Inside Compose, the backend uses the hostnames `redis://redis:6379` and `amqp://user:pass@rabbitmq:5672`, not `localhost`.
- Cache TTL is 120s, so a missed invalidation never leaves data stale for longer than that.

---

## 8. Order

1. Redis: `cache/redis.js` + `getWarranty` + invalidation.
2. RabbitMQ: `queue/*` + the 3 email call sites + `app.js`.
3. Docker: `Dockerfile` + `docker-compose.yml`, then run locally.
4. CI/CD: `ci.yml` + Render hook secret.
