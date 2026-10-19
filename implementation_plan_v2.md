# WarrantyStorage: Implementation Plan v2 (7 Features + Hardening)

> Status: plan only. No code has been changed yet.
> Researched and cross-checked against the current codebase (commit `56dd4fa`) on 2026-10-18.
> Replaces `implementation_plan_Warranty_Storage.md`. Section 14 lists the faults found in that older draft.

---

## 0. TL;DR

| # | Feature | Technology chosen | Why this one | Free to deploy? |
|---|---|---|---|---|
| 0 | **Security foundation (required first)** | Server-side bcrypt, JWT roles, Redis OTP | Without it, features 1 and 7 can be exploited (section 2) | Yes |
| 1 | Warranty transfer | Mongo transactions + emailed token | Atomic owner change; inbox proof | Yes |
| 2 | QR code | `qrcode` (server PNG) + public verify page | No storage cost. QR works in emails. | Yes |
| 3 | Docker + CI/CD | Dockerfiles, Compose, GitHub Actions, Render deploy hook | Render free supports Docker web services | Yes |
| 4 | Message queue | **RabbitMQ** (CloudAMQP free "Little Lemur") via `amqplib` | Push-based, so it costs nothing while idle. No free managed Kafka exists. | Yes (1M msgs/month) |
| 5 | Caching | **Redis** (Upstash free) via `ioredis`, versioned keys | Cache-aside, also holds OTPs and rate limits | Yes (500K cmds/month) |
| 6 | Vector DB | **MongoDB Atlas Vector Search** + local `all-MiniLM-L6-v2` embeddings | Works on the M0 free tier, adds no second datastore, filters per user | Yes |
| 7 | Warranty extension | Merchant plans, client request, merchant approval, **Razorpay** payment | Merchant sets a fixed price per duration. Payment is verified server-side. | Test mode free; live mode needs KYC |

**One blocker that is already affecting you:** SendGrid retired its free plan in May 2025. New accounts get a 60-day trial only. The app sends every email through SendGrid, so free deployment needs a provider swap. Recommended swap: **Brevo** (300 emails/day free, HTTP API). Render free blocks SMTP ports 25/465/587, so the provider must offer an HTTP API. The swap is one file (`notifications/mailer.js`, section 7.3).

---

## 1. Current Architecture (as found)

| Layer | Stack | Hosting |
|---|---|---|
| Frontend | React 18 (CRA), MUI 6, Bootstrap 5, glassmorphism CSS | Vercel |
| Backend | Express 4, Mongoose 8, SendGrid HTTP API, Groq `llama-3.1-8b-instant` | Render (`warrantystoragebackend.onrender.com`) |
| DB | MongoDB Atlas (M0) | Atlas |
| Auth | bcrypt + JWT (1h), token in `localStorage` | n/a |

**Code style to match:**
- CommonJS (`require`/`module.exports`).
- Controllers are `const name = async (req, res) => { try {...} catch (error) { res.status(500).json(...) } }`, sometimes wrapped in `asyncWrapper`.
- Mongoose schemas use `mongoose.Schema({...})` with multi-line field objects.
- Backend uses 4-space indent. Frontend uses 2-space indent and semicolons.
- Frontend uses MUI `Dialog`/`Table` with classes `dashboard-glass-table`, `dashboard-btn-add`, `dashboard-dialog-glass`, and the `#f064c5` accent.
- Comments are sparse. This plan keeps them that way.

---

## 2. Bugs and Security Holes Found in the Current Code (fixed in Phase 0)

Features 1 and 7 move ownership and money. Each item below would let someone bypass them.

| # | Where | Problem | Impact |
|---|---|---|---|
| S1 | `functions.js:45` `fetchingdetails` | Server returns a **valid JWT and the bcrypt hash** for any email *before* checking the password. The client compares the password itself (`user-login.js:375`). | **Critical.** Anyone can log in as anyone with just an email. |
| S2 | `routes.js` | `getwarranty`, `createwarranty`, `merchantverifications`, `PATCH merchantverifications/:id`, `rejectwarranty`, `chatbot` have **no auth**. They trust `email` / `store_name` from the body. | Anyone can read, verify, or reject anyone's warranties. |
| S3 | `functions.js:303` + `otp.js:19` | The client **generates the OTP** and sends it as `num`. The server stores whatever it receives. | Anyone can reset any user's password. |
| S4 | `chatbotController.js:440` | Chatbot fetches warranties for the `email` in the body. | Leaks any user's data through the chatbot. |
| S5 | `chatbotController.js:585` | Writes `process.env.Api_key` to `/tmp/chatbot_err.log`. | Secret leak. |
| S6 | `chatbotController.js:129` | `res.flushHea` is a truncated `res.flushHeaders()` and does nothing. | SSE headers are not flushed early. |
| B1 | `schema.js:85` | Status enum is `Verified/Cancelled`, but the code writes `validated/rejected`. `findByIdAndUpdate` skips validators, so it works by accident. | Breaks the moment validators run (`save()`, transactions). |
| B2 | `functions.js:353` `UpdateExpiry` | Queries the `UserLogin` model, which has no `expiry_date`. | Dead or broken. Replaced by feature 7. |
| B3 | `functions.js:143` / `230` | List endpoints return the **invoice Buffer** for every row (`limit: 10000`). | Huge payloads. Cannot be cached. |
| B4 | `functions.js:274` | `setMonth` overflow: Jan 31 + 1 month gives Mar 3. | Wrong expiry dates. |
| B5 | `schema.js:7` | `UserLogin.email` is not unique and not lowercased. | Transfer to an email can be ambiguous. |
| B6 | `app.js:13` | Error handler is commented out, so `asyncWrapper`'s `next(err)` returns Express's HTML 500. | Inconsistent errors. |
| B7 | `functions.js:192` | Rejection email puts the merchant's raw text into HTML. | HTML injection in email. |
| B8 | `app.js:16` | Port is hardcoded to `5000`. | Docker and Render prefer `PORT`. |
| B9 | frontend (13 places) | Backend URL is hardcoded. | Cannot point Docker or local builds at another backend. |
| B10 | `app.js:7` | `cors()` allows every origin. | Should be limited to `FRONTEND_URL`. |
| B11 | `README.md` | Env section lists `EMAIL/PASSWORD` (old Nodemailer). The code uses `Email`/`SENDGRID_API_KEY`. | Setup confusion. |

---

## 3. Setup Checklist and Free-Deployment Verdict

### 3.1 Accounts and services

| Service | Used for | Free tier (verified Oct 2026) | Action |
|---|---|---|---|
| **MongoDB Atlas M0** | DB, transactions, **Vector Search** | 512 MB storage. Max **3** search/vector indexes on M0 (this plan uses 1). | Already have. In Atlas > *Atlas Search* > create the vector index (section 10.3) or run the script. |
| **Upstash Redis** | Cache, OTP, rate limiting | 256 MB, **500K commands/month** | Create a DB in the region closest to Render. Copy the `rediss://` URL into `REDIS_URL`. |
| **CloudAMQP** (Little Lemur) | RabbitMQ | **1M messages/month**, 20 connections, 100 queues, 10K queued messages. Queues idle 28 days are removed (the code re-declares them on connect). | Create an instance. Copy the AMQPS URL into `AMQP_URL`. |
| **Razorpay** | Extension payments | Test mode is free and needs no KYC. Live mode needs business KYC plus a per-transaction fee. | Dashboard > Test mode > API keys. Webhooks > add `https://<backend>/warranty/setup/payments/razorpay/webhook` with events `payment.captured` and `order.paid`, and set a secret. Settings > Payment capture = **automatic**. |
| **Brevo** (replaces SendGrid) | Email | 300 emails/day | Create an API key and verify the sender address. (Or keep SendGrid if you pay for it.) |
| **Render** | Backend (Docker) | Free web service: spins down after 15 min idle, ~1 min cold start, 750 instance-hours/month, no persistent disk, **no free background workers**, SMTP ports blocked | Switch the service to **Docker** runtime (root dir `backend`). Turn auto-deploy **off**. Copy the **Deploy Hook URL**. |
| **Vercel** | Frontend | Hobby is free (personal/non-commercial use) | Add env `REACT_APP_API_URL`. |
| **GitHub Actions + GHCR** | CI/CD, image registry, daily cron | Free for public repos (2,000 min/month if private) | Add repo secrets: `RENDER_DEPLOY_HOOK_URL`, `BACKEND_URL`, `CRON_SECRET`. |
| **Docker** (local) | Compose dev stack | Free | Install Docker Engine plus the Compose plugin. |
| Groq | LLM | Free tier (unchanged) | Already have. |

### 3.2 Can it still be deployed for free? **Yes.** Caveats:

1. **Email:** SendGrid has no free plan for new accounts any more. Use Brevo (or Resend or Mailgun) through the HTTP API.
2. **Render free has no background workers.** RabbitMQ consumers run **inside the web process**. While the service sleeps, messages wait safely in CloudAMQP and are consumed on wake. Daily jobs come from a **GitHub Actions cron** that calls a secret-protected endpoint, which also wakes the service.
3. **Atlas 512 MB:** invoices are stored as Buffers inside Mongo. With a 5 MB upload cap, a few hundred invoices fill the free tier. Moving invoices to object storage (Cloudinary or Cloudflare R2 free) is the first suggested addition (section 16).
4. **Upstash quota:** 500K commands/month is about 16K/day. A cached read costs 2–3 commands. That is fine for demo traffic. Section 8.4 explains why **BullMQ was rejected**: it polls Redis and would use up this quota while idle.
5. **Razorpay live payouts to merchants** need *Razorpay Route* (linked accounts, KYC). In test mode the platform account collects all payments.
6. **Render free RAM is 512 MB.** The quantized embedding model uses about 120–200 MB at runtime. That fits, but if you hit OOM, switch embeddings to the Voyage AI API (section 10.6).

### 3.3 New npm packages

**Backend**

```bash
npm i ioredis amqplib qrcode razorpay @huggingface/transformers express-rate-limit rate-limit-redis
npm i -D jest supertest mongodb-memory-server
```

**Frontend**

```bash
npm i jwt-decode   # already present
npm uninstall bcryptjs jsonwebtoken   # no longer used client-side
```

### 3.4 Environment variables

`backend/.env` (commit a `backend/.env.example` with blank values):

```env
# existing
URI=
Email=
SENDGRID_API_KEY=
JWT_SECRET=
Api_key=

# new
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://warranty-storage-wh5d.vercel.app
BACKEND_PUBLIC_URL=https://warrantystoragebackend.onrender.com
REDIS_URL=
AMQP_URL=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
PAYMENT_PROVIDER=razorpay
CRON_SECRET=
TRANSFER_TTL_HOURS=72
EXTENSION_PAY_WINDOW_HOURS=72
EXTENSION_REVIEW_DAYS=7
VECTOR_SEARCH_ENABLED=true
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
CHAT_FULL_CONTEXT_LIMIT=25
BREVO_API_KEY=
```

Each optional service degrades gracefully when its variable is blank:
- `REDIS_URL` blank: no cache, in-memory OTP and rate limits.
- `AMQP_URL` blank: jobs run in-process right after the response.
- `PAYMENT_PROVIDER=mock`: no Razorpay. This mode is refused when `NODE_ENV=production`.
- `VECTOR_SEARCH_ENABLED=false`: the chatbot uses the old full-context mode.

`frontend` (Vercel env and Docker build arg):

```env
REACT_APP_API_URL=https://warrantystoragebackend.onrender.com/warranty/setup
```

---

## 4. Target Architecture

```
                 ┌──────────────┐        ┌──────────────────────────────────────────┐
  Browser ──────▶│ Vercel (CRA) │──API──▶│ Render: Express (Docker)                 │
  QR scan ──────▶│ /verify/:pid │        │  ├─ routes + auth/role middleware        │
                 └──────────────┘        │  ├─ cache (ioredis) ──────────▶ Upstash  │
  Razorpay ──webhook (raw body)─────────▶│  ├─ publisher (confirm ch.) ──▶ CloudAMQP│
                                         │  ├─ consumers (in-process) ◀── CloudAMQP │
  GH Actions cron ──x-cron-secret───────▶│  │    notifications ─▶ Brevo HTTP API    │
                                         │  │    vector-sync  ─▶ embed ─▶ Atlas     │
                                         │  └─ Mongo (txns, $vectorSearch) ─▶ Atlas │
                                         └──────────────────────────────────────────┘
```

**Event flow example (extension paid):**
1. Razorpay sends the webhook.
2. `finalizeExtension` runs a transaction that extends the expiry.
3. It invalidates the cache synchronously.
4. It publishes `extension.completed`.
5. The `notifications` queue emails the client and merchant. The `vector-sync` queue re-embeds the warranty text.

---

## 5. Phase 0: Security Foundation (do first, required)

### 5.1 New and changed backend files

#### [NEW] `backend/errors/ForbiddenError.js`

```js
class ForbiddenError extends Error {
    constructor(message) {
      super(message);
      this.statusCode = 403;
    }
  }

  module.exports = ForbiddenError;
```

#### [NEW] `backend/middleware/role.js`

```js
const ForbiddenError = require('../errors/ForbiddenError')

const requireRole = (role) => (req, res, next) => {
    if (!req.user || req.user.role !== role) {
        return next(new ForbiddenError('Not allowed'))
    }
    next()
}

module.exports = requireRole
```

#### [NEW] `backend/middleware/optionalAuth.js`

Used by the chatbot and the public verify page.

```js
const jwt = require('jsonwebtoken');

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  req.user = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    } catch (error) {
      req.user = null;
    }
  }
  next();
};

module.exports = optionalAuth;
```

#### [MODIFY] `backend/errors/ErrorHandler.js`

Map Multer, Mongoose cast, and duplicate-key errors to proper status codes.

```js
const errorHandlerMiddleware = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    if (err.code === 'LIMIT_FILE_SIZE') statusCode = 413;
    if (err.name === 'CastError') statusCode = 400;
    if (err.code === 11000) statusCode = 409;
    const message = statusCode === 500 ? 'Something went wrong' : err.message;
    if (statusCode === 500) console.error(err);
    res.status(statusCode).json({ message });
  };

  module.exports = errorHandlerMiddleware;
```

#### [NEW] `backend/utils/dates.js`

All expiry math goes through this file. It fixes B4 and is UTC-safe. Dates stay `YYYY-MM-DD` strings, which matches existing data.

```js
const pad = (n) => String(n).padStart(2, '0')

const toDateStr = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

const todayStr = () => toDateStr(new Date())

const parseDateStr = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null
    const d = new Date(`${s}T00:00:00Z`)
    if (isNaN(d) || toDateStr(d) !== s) return null
    return d
}

const addMonths = (s, months) => {
    const d = parseDateStr(s)
    if (!d) return null
    const day = d.getUTCDate()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() + Number(months))
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, last))
    return toDateStr(d)
}

const addDays = (s, days) => {
    const d = parseDateStr(s)
    if (!d) return null
    d.setUTCDate(d.getUTCDate() + Number(days))
    return toDateStr(d)
}

const isExpired = (s) => !parseDateStr(s) || s < todayStr()

const hoursFromNow = (h) => new Date(Date.now() + Number(h) * 3600 * 1000)

module.exports = { todayStr, parseDateStr, addMonths, addDays, isExpired, hoursFromNow }
```

> `toDateStr(d) !== s` rejects `2026-02-30`. V8 rolls that date over to Mar 2 instead of failing (verified locally).

#### [MODIFY] `backend/models/schema.js`

Changes:
- Lowercase and unique emails.
- Status enum matches real data (B1).
- New warranty fields.
- New models. The feature models are shown in their feature sections. All live in this file to match the existing single-schema-file pattern.

```js
const userSchema=mongoose.Schema({
    username:{
        type:String,
        required:true,
    },
    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
        trim:true,
    },
    password:{
        type:String,
        required:true,
    }
})
```

In `merchantSchema`, add `lowercase:true, trim:true` to `work_email`, and add:

```js
    allow_transfers:{
        type:Boolean,
        default:true,
    },
```

In `warrantySchema`, replace the `status` block and add fields. Do **not** give `public_id` a Mongoose `default`. Mongoose applies defaults when it *loads* old documents that lack the field. A legacy warranty would then show a different random `public_id` on every read, and its QR code would never resolve. The ID is generated explicitly on create and backfilled for old docs (section 13).

```js
    status: {
      type: String,
      enum: ['Pending Verification', 'validated', 'rejected', 'Verified', 'Expired' ,'Cancelled'],
      default: 'Pending Verification',
    },
    invoice_type: {
      type: String,
      default: '',
    },
    merchant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      index: true,
    },
    public_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    ownership_history: [{
      email: String,
      transferred_at: Date,
      transfer_id: mongoose.Schema.Types.ObjectId,
    }],
    extensions: [{
      request_id: mongoose.Schema.Types.ObjectId,
      months: Number,
      price: Number,
      currency: String,
      old_expiry: String,
      new_expiry: String,
      extended_at: Date,
    }],
  }, { timestamps: true });
warrantySchema.index({ email: 1 });
warrantySchema.index({ store_name: 1, store_location: 1, status: 1 });
```

Also lowercase the warranty `email` (`lowercase: true`).

#### [MODIFY] `backend/controllers/functions.js`: imports after all phases

Replace the `sgMail` lines and add the new imports:

```js
const crypto = require('crypto')
const { sendMail } = require('../notifications/mailer')
const templates = require('../notifications/templates')
const cache = require('../cache/redis')
const otpStore = require('../cache/otpStore')
const { invalidateWarranty } = require('../cache/invalidate')
const { publish } = require('../queue/rabbit')
const { getMerchant } = require('../utils/merchant')
const { todayStr, parseDateStr, addMonths, addDays } = require('../utils/dates')
const { expireStaleTransfers } = require('./transferController')
const { expireStaleExtensions } = require('./extensionController')
```

`Contact` changes from `sgMail.send(mailData)` to `await publish('contact.received', { email: req.body.email })`.

#### [MODIFY] `backend/controllers/functions.js`: login (fixes S1)

```js
const fetchingdetails = async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')
    try {
        if (req.body.isMerchant) {
            const merchant = await Merchant.findOne({ work_email: email })
            if (!merchant || !(await bcrypt.compare(password, merchant.password))) {
                return res.status(401).json({ success: false, "msg": "Invalid credentials" })
            }
            const token = jwt.sign({ id: merchant._id, email, role: 'merchant' }, process.env.JWT_SECRET, { expiresIn: "1h" });
            return res.status(200).json({
                "token": token,
                "StoreLocation": merchant.business_add,
                "StoreName": merchant.business_name,
                "WorkNumber": merchant.work_phone,
            })
        }
        const user = await UserLogin.findOne({ email })
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ success: false, "msg": "Invalid credentials" })
        }
        const token = jwt.sign({ id: user._id, email, role: 'client' }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.status(200).json({ "token": token })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}
```

`addingnewuser` / `addingnewmerchantuser`:
- Lowercase the email.
- Return `409` if the email already exists.
- Fix the leaked globals: `salt =` becomes `const salt =`, and `hashed =` becomes `const hashed =`.
- Stop returning `userinfo` (it contains the hash). Return `{ success: true }` instead.

#### [MODIFY] `functions.js`: OTP (fixes S3)

```js
const OTP = asyncWrapper(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase()
    const user = await UserLogin.findOne({ email }).select('_id')
    if (user) {
        const code = String(crypto.randomInt(100000, 1000000))
        await otpStore.save(email, code)
        await sendMail({ to: email, ...templates.otp(code) })
    }
    res.status(201).json({ success: true, message: "OTP Sent" });
});

const verifyOTP = asyncWrapper(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase()
    if (!(await otpStore.verify(email, req.body.otp))) {
        return res.status(401).json({ msg: "Invalid or expired OTP" })
    }
    const resetToken = jwt.sign({ email }, process.env.JWT_SECRET + ':reset', { expiresIn: '10m' })
    res.status(200).json({ resetToken })
});

const UpdatePassword = async (req, res) => {
    const { resetToken, password } = req.body;
    let email
    try {
        email = jwt.verify(resetToken, process.env.JWT_SECRET + ':reset').email
    } catch (error) {
        return res.status(401).json({ msg: "Reset link expired" });
    }
    if (!password || String(password).length < 6) {
        return res.status(400).json({ msg: "Password too short" });
    }
    const hashed = await bcrypt.hash(String(password), 10);
    try {
        await UserLogin.findOneAndUpdate({ email }, { password: hashed });
        res.status(201).json({ success: true });
    } catch (error) {
        res.status(500).json(error);
    }
};
```

- The response is the same whether or not the user exists, so the endpoint does not reveal which emails are registered.
- The reset token uses a **derived secret** (`JWT_SECRET + ':reset'`). The normal `auth` middleware therefore rejects it, so a reset token cannot be used as a login token.
- The OTP is sent **directly**, not through the queue. It is latency-sensitive, and a secret should not sit in a broker.

#### [NEW] `backend/cache/otpStore.js`

```js
const crypto = require('crypto')
const cache = require('./redis')

const memory = new Map()
const TTL = 600
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex')

const read = async (email) => cache.ready() ? cache.get(`otp:${email}`) : memory.get(email)

const write = async (email, record) => {
    const ttl = Math.ceil((record.exp - Date.now()) / 1000)
    if (ttl <= 0) return
    if (cache.ready()) return cache.set(`otp:${email}`, record, ttl)
    memory.set(email, record)
}

const remove = async (email) => cache.ready() ? cache.del(`otp:${email}`) : memory.delete(email)

const save = (email, code) => write(email, { hash: hash(code), tries: 0, exp: Date.now() + TTL * 1000 })

const verify = async (email, code) => {
    const record = await read(email)
    if (!record || record.exp < Date.now() || record.tries >= 5) return false
    if (record.hash === hash(code)) {
        await remove(email)
        return true
    }
    record.tries += 1
    await write(email, record)
    return false
}

module.exports = { save, verify }
```

#### [MODIFY] `backend/controllers/chatbotController.js` (S4, S5, S6)

- Route uses `optionalAuth`. Read `email`/role from `req.user` and **ignore** `email`, `isMerchant`, `storeName`, `storeLocation` in the body. For a merchant, load the store from `Merchant.findById(req.user.id)`.
- Delete both `appendFileSync('/tmp/chatbot_err.log', ...)` lines. The second one logs the API key.
- Replace `res.flushHea` with `res.flushHeaders()`.
- Cap `history` to the last 10 messages and 2,000 characters each.
- Context building moves to Feature 6 (section 10.5).

#### [MODIFY] `backend/app.js`

```js
const express=require('express')
const cors =require('cors')
const app=express()
require('dotenv').config()
const route=require('./routes/routes')
const connectDB=require('./database/connectdb')
const errorHandlerMiddleware=require('./errors/ErrorHandler')
const queue=require('./queue/rabbit')
const { razorpayWebhook }=require('./controllers/extensionController')
const notificationHandler=require('./notifications/handler')
const vectorHandler=require('./vector/handler')

app.set('trust proxy', 1)
app.use(cors({ origin: (process.env.FRONTEND_URL || 'http://localhost:3000').split(',') }))
app.post('/warranty/setup/payments/razorpay/webhook', express.raw({ type: 'application/json' }), razorpayWebhook)
app.use(express.json({ limit: '1mb' }));
app.get('/',(req,res)=>{
    res.send("Something is there2")
})
app.get('/health',(req,res)=>res.status(200).json({ ok: true }))

app.use('/warranty/setup',route)
app.use(errorHandlerMiddleware)

const port=process.env.PORT || 5000
const start =async () => {
    try {
        await connectDB(process.env.URI)
        queue.register('notifications', notificationHandler)
        queue.register('vector-sync', vectorHandler)
        await queue.connect()
        const server = app.listen(port,console.log('Server is on'))
        const shutdown = async () => {
            server.close()
            await queue.close()
            await require('mongoose').disconnect()
            process.exit(0)
        }
        process.on('SIGTERM', shutdown)
        process.on('SIGINT', shutdown)
    } catch (error) {
        console.log(error)
        process.exit(1)
    }
}
if (require.main === module) start();
module.exports = app
```

> **Critical ordering:** the Razorpay webhook route is registered **before** `express.json()`. The HMAC is computed over the *raw bytes*. If `express.json()` parses the body first, verification always fails.
>
> `require.main === module` lets tests import `app` without opening a port. Render still runs `node app.js`.

#### [MODIFY] `backend/routes/routes.js` (full target)

```js
const express = require('express')
const multer = require('multer');
const upload = multer({
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /^(image\/|application\/pdf$)/.test(file.mimetype)),
});
const router = express.Router()
const { addingnewuser, fetchingdetails, addingnewmerchantuser, uploadwarranty, getWarranty, getInvoice, Contact, fetchvalidations, updatewarrantystatus, OTP, verifyOTP, UpdatePassword, dailyCron } = require('../controllers/functions')
const { chatHandler } = require('../controllers/chatbotController')
const { createTransfer, listTransfers, acceptTransfer, declineTransfer, cancelTransfer, getTransfer } = require('../controllers/transferController')
const { getQr, verifyPublic } = require('../controllers/qrController')
const { listPlans, createPlan, updatePlan, deletePlan, plansForWarranty, requestExtension, myExtensions, cancelExtension, merchantExtensions, reviewExtension, createExtensionOrder, verifyExtensionPayment } = require('../controllers/extensionController')
const { authLimiter, otpLimiter, actionLimiter, publicLimiter } = require('../middleware/rateLimit')

const authHeader = require('../middleware/auth')
const optionalAuth = require('../middleware/optionalAuth')
const requireRole = require('../middleware/role')
const client = [authHeader, requireRole('client')]
const merchant = [authHeader, requireRole('merchant')]

router.route('/').post(authLimiter, addingnewuser)
router.route('/addmerchant').post(authLimiter, addingnewmerchantuser)
router.route('/id').post(authLimiter, fetchingdetails).get(authHeader, (req, res) => res.send({ email: req.user.email, role: req.user.role }));

router.route('/getwarranty').post(client, getWarranty)
router.post('/createwarranty', client, upload.single('invoice'), uploadwarranty)
router.get('/invoice/:id', authHeader, getInvoice)

router.route('/merchantverifications').post(merchant, fetchvalidations);
router.route('/merchantverifications/:id').patch(merchant, updatewarrantystatus);

router.route('/contactus').post(actionLimiter, Contact);
router.route('/OTP').post(otpLimiter, OTP)
router.route('/OTP/verify').post(otpLimiter, verifyOTP)
router.route('/UpdatePassword').post(otpLimiter, UpdatePassword)

router.route('/chatbot').post(actionLimiter, optionalAuth, chatHandler)

router.route('/transfers').get(client, listTransfers).post(client, actionLimiter, createTransfer)
router.route('/transfers/:id').get(client, getTransfer)
router.route('/transfers/:id/accept').post(client, actionLimiter, acceptTransfer)
router.route('/transfers/:id/decline').post(client, declineTransfer)
router.route('/transfers/:id/cancel').post(client, cancelTransfer)

router.route('/verify/:publicId').get(publicLimiter, optionalAuth, verifyPublic)
router.route('/verify/:publicId/qr').get(publicLimiter, getQr)

router.route('/merchant/plans').get(merchant, listPlans).post(merchant, createPlan)
router.route('/merchant/plans/:id').patch(merchant, updatePlan).delete(merchant, deletePlan)
router.route('/merchant/extensions').get(merchant, merchantExtensions)
router.route('/merchant/extensions/:id').patch(merchant, reviewExtension)

router.route('/warranties/:id/extension-plans').get(client, plansForWarranty)
router.route('/extensions').get(client, myExtensions).post(client, actionLimiter, requestExtension)
router.route('/extensions/:id/cancel').post(client, cancelExtension)
router.route('/extensions/:id/order').post(client, actionLimiter, createExtensionOrder)
router.route('/extensions/:id/verify').post(client, verifyExtensionPayment)

router.route('/internal/cron/daily').post(dailyCron)

module.exports = router
```

Removed routes:
- `/rejectwarranty`: the rejection reason now goes in the same PATCH (section 5.2).
- `/UpdateExpiry`: broken (B2) and replaced by Feature 7.

#### [MODIFY] `functions.js`: protected reads and writes (fixes S2, B3)

```js
const getWarranty = async (req, res) => {
    try {
        const email = req.user.email
        const page = parseInt(req.body.page) || 1;
        const limit = Math.min(parseInt(req.body.limit) || 10, 10000);
        const skip = (page - 1) * limit;
        const key = `wl:user:${email}:v${await cache.version(`user:${email}`)}:${page}:${limit}`
        const cached = await cache.get(key)
        if (cached) return res.status(200).json(cached)

        const warranty = await UserWarranty.find({ email }).select('-invoice').sort({ _id: -1 }).skip(skip).limit(limit).lean();
        const total = await UserWarranty.countDocuments({ email });
        const payload = { data: warranty, total, page, limit }
        await cache.set(key, payload, 120)
        res.status(200).json(payload);
    } catch (error) {
        res.status(500).send(error);
    }
};

const uploadwarranty = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'File is required.' });
    }
    try {
        const { product_name, store_name, store_location, purchase_date } = req.body;
        if (!parseDateStr(purchase_date) || purchase_date > todayStr()) {
            return res.status(400).json({ message: 'Invalid purchase date.' });
        }
        const merchant = await Merchant.findOne({ business_name: store_name, business_add: store_location }).select('_id')
        const newWarranty = {
            "email": req.user.email,
            "product_name": product_name,
            "store_name": store_name,
            "purchase_date": purchase_date,
            "expiry_date": "",
            "store_location": store_location,
            "invoice": req.file.buffer,
            "invoice_type": req.file.mimetype,
            "status": 'Pending Verification',
            "merchant_id": merchant ? merchant._id : undefined,
            "public_id": crypto.randomBytes(12).toString('base64url'),
        };
        const task = await UserWarranty.create(newWarranty);
        await invalidateWarranty(task)
        await publish('warranty.created', { warranty_id: task._id })
        res.status(200).send({ message: 'Warranty uploaded and awaiting verification.' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error', error: error.message });
    }
};

const getInvoice = async (req, res) => {
    try {
        const filter = { _id: req.params.id }
        if (req.user.role === 'merchant') {
            const merchant = await getMerchant(req.user.id)
            filter.store_name = merchant.business_name
            filter.store_location = merchant.business_add
        } else {
            filter.email = req.user.email
        }
        const w = await UserWarranty.findOne(filter).select('invoice invoice_type')
        if (!w || !w.invoice) return res.status(404).json({ message: 'Invoice not found' })
        res.set('Content-Type', w.invoice_type || 'application/octet-stream')
        res.set('Content-Disposition', 'attachment; filename="invoice"')
        res.send(w.invoice)
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}
```

`fetchvalidations`:
- Derive `store_name`/`store_location` from `getMerchant(req.user.id)`, not the body.
- Use `.select('-invoice').lean()`.
- Cache under `wl:merchant:${id}:v${ver}:${status}:${page}:${limit}` for 60s.

### 5.2 Merchant verification (fixes B1 and B4, ownership check, rejection merged)

```js
const updatewarrantystatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, message } = req.body;
        if (!['validated', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' })
        }
        const merchant = await getMerchant(req.user.id)
        const warranty = await UserWarranty.findOne({ _id: id, store_name: merchant.business_name, store_location: merchant.business_add, status: 'Pending Verification' }).select('-invoice')
        if (!warranty) return res.status(404).json({ success: false, message: 'Warranty not found' })
        let date = 'NA'
        if (status === 'validated') {
            const months = Number(req.body.year || 0) * 12 + Number(req.body.month || 0)
            if (!Number.isInteger(months) || months <= 0 || months > 1200) {
                return res.status(400).json({ success: false, message: 'Invalid warranty duration' })
            }
            date = addMonths(warranty.purchase_date, months)
            if (!date) return res.status(400).json({ success: false, message: 'Invalid purchase date' })
        }
        const updated = await UserWarranty.findOneAndUpdate(
            { _id: id, status: 'Pending Verification' },
            { expiry_date: date, status, merchant_id: merchant._id },
            { new: true }
        ).select('-invoice')
        if (!updated) return res.status(409).json({ success: false, message: 'Already reviewed' })
        await invalidateWarranty(updated)
        await publish(status === 'validated' ? 'warranty.verified' : 'warranty.rejected', { warranty_id: id, message: message || '' })
        res.status(200).json({ success: true, expiry_date: date });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error updating warranty status', error: error.message });
    }
};
```

- The server uses the stored `purchase_date` and ignores the client's `currdate`.
- The rejection email now comes from the `warranty.rejected` event and carries `message`. `MerchantValidation.js` opens the reason form **before** sending the PATCH (section 5.3).

#### [NEW] `backend/utils/merchant.js`

```js
const { Merchant } = require('../models/schema')
const cache = require('../cache/redis')

const getMerchant = async (id) => {
    const key = `merchant:${id}`
    const cached = await cache.get(key)
    if (cached) return cached
    const merchant = await Merchant.findById(id).select('-password').lean()
    if (merchant) await cache.set(key, merchant, 3600)
    return merchant
}

module.exports = { getMerchant }
```

A cached merchant `_id` is a string, so wrap it with `new mongoose.Types.ObjectId(...)` where it is used in `$vectorSearch` filters. Normal Mongoose queries cast it automatically.

#### [NEW] `backend/middleware/rateLimit.js`

```js
const Redis = require('ioredis')
const { rateLimit } = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 }) : null
if (redis) redis.on('error', (err) => console.error('Rate-limit Redis error:', err.message))

const make = (prefix, windowMs, limit) => rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true,
    store: redis ? new RedisStore({ prefix: `rl:${prefix}:`, sendCommand: (...args) => redis.call(...args) }) : undefined,
})

module.exports = {
    authLimiter: make('auth', 15 * 60 * 1000, 20),
    otpLimiter: make('otp', 15 * 60 * 1000, 8),
    actionLimiter: make('action', 60 * 1000, 30),
    publicLimiter: make('public', 60 * 1000, 60),
}
```

> The rate limiter uses its **own** ioredis client with the offline queue enabled (the default). `RedisStore` loads its Lua script as soon as it is constructed, which happens before Redis has connected. On the cache client (`enableOfflineQueue: false`) that load would reject, and an unhandled rejection crashes Node 15+.

### 5.3 Frontend Phase 0

#### [NEW] `frontend/src/api.js`

Replaces all 13 hardcoded URLs (B9).

```js
import axios from "axios";

export const API_URL = process.env.REACT_APP_API_URL || "https://warrantystoragebackend.onrender.com/warranty/setup";

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("jwt_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
```

In every file, replace `axios.post("https://warrantystoragebackend.onrender.com/warranty/setup/X", ...)` with `api.post("/X", ...)`. `Chatbot.js` uses `fetch`: change it to `` `${API_URL}/chatbot` `` and add an `Authorization` header when a token exists.

Per-file changes:

| File | Change |
|---|---|
| `user-login.js` | Remove the `bcryptjs` import and `compareSync`. On success, `task.data.token` is present. Also store `localStorage.setItem("role", formData.isMerchant ? "merchant" : "client")`. After login, if `sessionStorage.getItem("pendingTransfer")` is set, navigate there instead of `/UserEdit`. |
| `jwt_auth.js` | Take an optional `role` argument: `CheckAuthAndRedirect(role)`. Decode with `jwtDecode(token)`. If it is expired or `decoded.role !== role`, clear storage and redirect to `/Login`. |
| `MerchantValidation.js` | Call `CheckAuthAndRedirect("merchant")`. Invoice download: `api.get(`/invoice/${row._id}`, { responseType: "blob" })`, then `URL.createObjectURL`, click an `<a download>`, and revoke. Delete the `JVBER` prefix sniffing. Reject flow: `handleValidation(false)` opens the reason form first. Submitting it sends `PATCH { status: "rejected", message }`. Remove the `/rejectwarranty` call. |
| `warranty-edit.js` | Call `CheckAuthAndRedirect("client")`. Drop `email` from `newWarranty` (the server takes it from the token). Allow `accept="image/*,application/pdf"`. Remove the unused `location`/`response` vars (CRA treats warnings as errors when `CI=true`). |
| `otp.js` | Delete the local OTP generation. On mount, `api.post("/OTP", { email })`. On submit, `api.post("/OTP/verify", { email, otp })`, then `sessionStorage.setItem("resetToken", data.resetToken)`, then navigate. |
| `changePassword.js` | Send `{ resetToken: sessionStorage.getItem("resetToken"), password }`. |
| `package.json` | Remove `bcryptjs` and `jsonwebtoken`. |

---

## 6. Feature 1: Warranty Transfer Ecosystem

### 6.1 How it works

```
Owner A                         Server                           Recipient B
  │ POST /transfers {id,email,note}│                                  │
  │──────────────────────────────▶│ checks: owner, validated,         │
  │                                │ not expired, merchant allows,    │
  │                                │ no open extension, B ≠ A          │
  │                                │ token = randomBytes(32)           │
  │                                │ store sha256(token), +72h         │
  │                                │ publish transfer.requested ──────▶│ email with
  │                                │                                   │ /transfer/:id?token=…
  │                                │◀── POST /transfers/:id/accept ────│ (must be logged in
  │                                │    {token}                        │  as B's email)
  │                                │ TRANSACTION:                      │
  │                                │  transfer pending→accepted        │
  │                                │  warranty.email A→B (if still A)  │
  │                                │  push ownership_history           │
  │                                │ invalidate cache A, B, verify     │
  │◀── email "transferred" ────────│ publish transfer.accepted ───────▶│ email "you own it"
```

**Security model:** accepting needs **both** a login as `to_email` *and* the token from the email.
- The login check stops a forwarded email from being used by someone else.
- The token proves control of the inbox. Registration has no email verification, so anyone could register B's address first. The token closes that gap.

Only the SHA-256 of the token is stored, so a database leak does not expose working tokens.

### 6.2 Schema

#### [MODIFY] `schema.js`: add the `TransferRequest` model

```js
const transferSchema = mongoose.Schema({
    warranty_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserWarranty',
        required: true,
    },
    from_email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    to_email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    token_hash: {
        type: String,
        required: true,
    },
    note: {
        type: String,
        maxlength: 300,
        default: '',
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'cancelled', 'expired'],
        default: 'pending',
    },
    expires_at: {
        type: Date,
        required: true,
    },
    responded_at: Date,
}, { timestamps: true });
transferSchema.index({ warranty_id: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
transferSchema.index({ from_email: 1, status: 1 });
```

The partial unique index allows **at most one pending transfer per warranty**, enforced by the DB. This makes the "check then create" race safe.

Export it as `TransferRequest: mongoose.model('TransferRequest', transferSchema)`.

### 6.3 Controller

#### [NEW] `backend/controllers/transferController.js`

```js
const crypto = require('crypto')
const mongoose = require('mongoose')
const { UserWarranty, UserLogin, Merchant, TransferRequest, ExtensionRequest } = require('../models/schema')
const { isExpired, hoursFromNow } = require('../utils/dates')
const { invalidateWarranty } = require('../cache/invalidate')
const { publish } = require('../queue/rabbit')
const { expireStaleExtensions } = require('./extensionController')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex')

const expireStaleTransfers = (filter = {}) => TransferRequest.updateMany(
    { ...filter, status: 'pending', expires_at: { $lt: new Date() } },
    { status: 'expired', responded_at: new Date() }
)

const createTransfer = async (req, res) => {
    try {
        const { warranty_id, note } = req.body
        const to_email = String(req.body.to_email || '').trim().toLowerCase()
        const from_email = req.user.email
        if (!mongoose.isValidObjectId(warranty_id) || !EMAIL_RE.test(to_email)) {
            return res.status(400).json({ msg: 'Invalid request' })
        }
        if (to_email === from_email) return res.status(400).json({ msg: 'You already own this warranty' })

        const warranty = await UserWarranty.findOne({ _id: warranty_id, email: from_email }).select('-invoice')
        if (!warranty) return res.status(404).json({ msg: 'Warranty not found' })
        if (warranty.status !== 'validated' || isExpired(warranty.expiry_date)) {
            return res.status(400).json({ msg: 'Only active, verified warranties can be transferred' })
        }
        if (warranty.merchant_id) {
            const merchant = await Merchant.findById(warranty.merchant_id).select('allow_transfers')
            if (merchant && merchant.allow_transfers === false) {
                return res.status(400).json({ msg: 'This store does not allow warranty transfers' })
            }
        }
        await expireStaleTransfers({ warranty_id })
        await expireStaleExtensions({ warranty_id })
        if (await ExtensionRequest.exists({ warranty_id, open: true })) {
            return res.status(409).json({ msg: 'Finish or cancel the pending extension first' })
        }

        const token = crypto.randomBytes(32).toString('hex')
        const transfer = await TransferRequest.create({
            warranty_id,
            from_email,
            to_email,
            token_hash: hash(token),
            note: String(note || '').slice(0, 300),
            expires_at: hoursFromNow(process.env.TRANSFER_TTL_HOURS || 72),
        })
        const recipientExists = await UserLogin.exists({ email: to_email })
        await publish('transfer.requested', { transfer_id: transfer._id, token, recipient_exists: !!recipientExists })
        res.status(201).json({ success: true, transfer_id: transfer._id })
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ msg: 'A transfer is already pending for this warranty' })
        res.status(500).json({ msg: error.message })
    }
}

const listTransfers = async (req, res) => {
    try {
        const email = req.user.email
        await expireStaleTransfers({ $or: [{ from_email: email }, { to_email: email }] })
        const [incoming, outgoing] = await Promise.all([
            TransferRequest.find({ to_email: email, status: 'pending' }).select('-token_hash').populate('warranty_id', 'product_name store_name expiry_date').lean(),
            TransferRequest.find({ from_email: email }).select('-token_hash').sort({ createdAt: -1 }).limit(50).populate('warranty_id', 'product_name store_name').lean(),
        ])
        res.status(200).json({ incoming, outgoing })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const getTransfer = async (req, res) => {
    try {
        const transfer = await TransferRequest.findOne({ _id: req.params.id, to_email: req.user.email })
            .select('-token_hash').populate('warranty_id', 'product_name store_name store_location purchase_date expiry_date').lean()
        if (!transfer) return res.status(404).json({ msg: 'Transfer not found' })
        res.status(200).json(transfer)
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const acceptTransfer = async (req, res) => {
    try {
        const transfer = await TransferRequest.findById(req.params.id)
        if (!transfer || transfer.status !== 'pending') return res.status(404).json({ msg: 'Transfer not available' })
        if (transfer.to_email !== req.user.email) return res.status(403).json({ msg: 'This transfer is addressed to another account' })
        const given = Buffer.from(hash(req.body.token || ''))
        if (!crypto.timingSafeEqual(given, Buffer.from(transfer.token_hash))) {
            return res.status(403).json({ msg: 'Invalid transfer link' })
        }
        if (transfer.expires_at < new Date()) {
            await TransferRequest.updateOne({ _id: transfer._id, status: 'pending' }, { status: 'expired', responded_at: new Date() })
            return res.status(410).json({ msg: 'Transfer link expired' })
        }

        let warranty = null
        await mongoose.connection.transaction(async (session) => {
            const t = await TransferRequest.findOneAndUpdate(
                { _id: transfer._id, status: 'pending' },
                { status: 'accepted', responded_at: new Date() },
                { new: true, session }
            )
            if (!t) throw Object.assign(new Error('Transfer already handled'), { statusCode: 409 })
            warranty = await UserWarranty.findOneAndUpdate(
                { _id: t.warranty_id, email: t.from_email, status: 'validated' },
                {
                    $set: { email: t.to_email },
                    $push: { ownership_history: { email: t.from_email, transferred_at: new Date(), transfer_id: t._id } },
                },
                { new: true, session }
            ).select('-invoice')
            if (!warranty) throw Object.assign(new Error('Warranty is no longer transferable'), { statusCode: 409 })
        })

        await invalidateWarranty(warranty, transfer.from_email)
        await publish('transfer.accepted', { transfer_id: transfer._id, warranty_id: warranty._id })
        res.status(200).json({ success: true, warranty_id: warranty._id })
    } catch (error) {
        res.status(error.statusCode || 500).json({ msg: error.message })
    }
}

const respond = (field, status, event) => async (req, res) => {
    try {
        const transfer = await TransferRequest.findOneAndUpdate(
            { _id: req.params.id, [field]: req.user.email, status: 'pending' },
            { status, responded_at: new Date() },
            { new: true }
        )
        if (!transfer) return res.status(404).json({ msg: 'Transfer not available' })
        await publish(event, { transfer_id: transfer._id })
        res.status(200).json({ success: true })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const declineTransfer = respond('to_email', 'declined', 'transfer.declined')
const cancelTransfer = respond('from_email', 'cancelled', 'transfer.cancelled')

module.exports = { createTransfer, listTransfers, getTransfer, acceptTransfer, declineTransfer, cancelTransfer, expireStaleTransfers }
```

**Design notes:**
- `timingSafeEqual` throws on unequal lengths. Both sides are 64-char hex digests, so the lengths always match.
- The transaction uses `mongoose.connection.transaction()` rather than raw `withTransaction`, because it also resets Mongoose document state when it retries. Atlas M0 is a replica set, so transactions work there. Local Compose uses `mongodb-atlas-local`, which is also a single-node replica set. Tests use `MongoMemoryReplSet`.
- The warranty update is conditional on `email: t.from_email`. If A somehow lost the warranty in between, the transaction aborts and the transfer stays `pending`, not falsely `accepted`.
- Stale pending transfers are expired **before** creating a new one. Otherwise the partial unique index would block a new transfer forever after a link expires unused.
- **Circular require:** `transferController` imports `expireStaleExtensions` from `extensionController`, and `extensionController` imports `TransferRequest` from the schema only. There is no cycle.

### 6.4 Frontend

#### [NEW] `frontend/src/TransferDialog.js`

A MUI `Dialog` in the existing glass style with:
- **recipient email** (TextField, `type="email"`)
- **note** (multiline, max 300)
- **Send** calls `api.post("/transfers", { warranty_id, to_email, note })`. On 409 or 400, show `error.response.data.msg` in an `Alert`.

#### [NEW] `frontend/src/TransferAccept.js`, route `/transfer/:id`

1. Read `token` from `useSearchParams()`.
2. If there is no `jwt_token`, call `sessionStorage.setItem("pendingTransfer", location.pathname + location.search)` and navigate to `/Login`.
3. Otherwise, `api.get(`/transfers/${id}`)` shows the product, store, expiry, and sender note.
4. **Accept** calls `api.post(`/transfers/${id}/accept`, { token })`, then `sessionStorage.removeItem("pendingTransfer")` and navigates to `/UserEdit`.
5. **Decline** calls `api.post(`/transfers/${id}/decline`)`.
6. A 403 "addressed to another account" shows "Log in as <to_email>". The email is shown masked and comes from the error message only.

#### [MODIFY] `warranty-edit.js`

- Add an **Actions** column. When `status === 'validated' && expiry_date >= today`, show the icon buttons `SwapHoriz` (Transfer), `QrCode2` (QR), and `MoreTime` (Extend).
- Add an "Incoming transfers" `Paper` above the table, shown when `incoming.length > 0`. Each row shows product, sender, and expiry, plus **Decline** and "Open the email we sent to accept". Accept stays email-only because it needs the token.
- Update `colSpan={7}` to `colSpan={8}`.

#### [MODIFY] `App.js`

```js
<Route path="/transfer/:id" element={<TransferAccept/>}></Route>
```

---

## 7. Feature 2: QR Code Integration

### 7.1 How it works

- Every warranty has an unguessable `public_id`: 12 random bytes, base64url, 96 bits.
- The QR encodes `${FRONTEND_URL}/verify/${public_id}`. It does **not** use the Mongo `_id`, which embeds a timestamp and is enumerable.
- **Anyone** who scans it (a shop counter, a buyer of a second-hand item, a service centre) sees the product, store, purchase and expiry dates, live status, and the extension count. They do **not** see the owner email or the invoice.
- If the scanner is logged in as **the owning merchant** (phone camera opens the URL, and the merchant's token is in `localStorage`), the page also shows the owner email and the warranty `_id`. This lets the merchant serve a claim at the counter with no scanner app.
- The QR is generated **on request** as a PNG with `qrcode` and never stored. Generation is deterministic and takes milliseconds. The public PNG endpoint means `<img src>` works in the dashboard (no auth header needed) and in **emails**, with no provider-specific inline-attachment handling.
- Transfers and extensions do **not** change the QR. The verify page always shows the live state.

### 7.2 Controller

#### [NEW] `backend/controllers/qrController.js`

```js
const QRCode = require('qrcode')
const { UserWarranty } = require('../models/schema')
const cache = require('../cache/redis')
const { isExpired } = require('../utils/dates')

const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{16}$/
const verifyUrl = (publicId) => `${process.env.FRONTEND_URL}/verify/${publicId}`

const getQr = async (req, res) => {
    try {
        const { publicId } = req.params
        if (!PUBLIC_ID_RE.test(publicId) || !(await UserWarranty.exists({ public_id: publicId }))) {
            return res.status(404).json({ msg: 'Not found' })
        }
        const png = await QRCode.toBuffer(verifyUrl(publicId), { type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M' })
        res.set('Content-Type', 'image/png')
        res.set('Cache-Control', 'public, max-age=86400, immutable')
        if (req.query.download) res.set('Content-Disposition', `attachment; filename="warranty-${publicId}.png"`)
        res.send(png)
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const verifyPublic = async (req, res) => {
    try {
        const { publicId } = req.params
        if (!PUBLIC_ID_RE.test(publicId)) return res.status(404).json({ msg: 'Not found' })
        const key = `verify:${publicId}`
        let data = await cache.get(key)
        if (!data) {
            const w = await UserWarranty.findOne({ public_id: publicId }).select('-invoice -ownership_history').lean()
            if (!w) return res.status(404).json({ msg: 'Not found' })
            data = {
                product_name: w.product_name,
                store_name: w.store_name,
                store_location: w.store_location,
                purchase_date: w.purchase_date,
                expiry_date: w.expiry_date,
                status: w.status,
                extensions: (w.extensions || []).length,
                merchant_id: w.merchant_id ? String(w.merchant_id) : null,
                _owner: w.email,
                _id: String(w._id),
            }
            await cache.set(key, data, 300)
        }
        const isOwnerMerchant = req.user && req.user.role === 'merchant' && data.merchant_id && String(req.user.id) === data.merchant_id
        const { _owner, _id, merchant_id, ...publicData } = data
        res.status(200).json({
            ...publicData,
            active: data.status === 'validated' && !isExpired(data.expiry_date),
            ...(isOwnerMerchant ? { owner_email: _owner, warranty_id: _id } : {}),
        })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

module.exports = { getQr, verifyPublic, verifyUrl }
```

`active` is computed per request, not cached, so a cached entry never shows "active" past midnight on the expiry day.

### 7.3 Email: notifications module (shared by features 1, 2, 4, 7)

#### [NEW] `backend/notifications/mailer.js`

Swap the provider here. Shown with Brevo. A SendGrid version is the same 5 lines.

```js
const https = require('https')

const sendMail = ({ to, subject, html }) => new Promise((resolve, reject) => {
    const body = JSON.stringify({
        sender: { email: process.env.Email, name: 'Warranty Storage' },
        to: [{ email: to }],
        subject,
        htmlContent: html,
    })
    const req = https.request({
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
        res.resume()
        res.statusCode < 300 ? resolve() : reject(new Error(`Mail API ${res.statusCode}`))
    })
    req.on('error', reject)
    req.end(body)
})

module.exports = { sendMail }
```

It **throws** on failure, so the queue consumer retries. Existing `Contact`/`OTP` code that called `sgMail.send` directly switches to `sendMail`.

#### [NEW] `backend/notifications/templates.js`

Each entry is a function returning `{ subject, html }`. All user-supplied text goes through `escapeHtml` (fixes B7).

```js
const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const app = () => process.env.FRONTEND_URL
const api = () => `${process.env.BACKEND_PUBLIC_URL}/warranty/setup`

module.exports = {
    escapeHtml,
    otp: (code) => ({ subject: 'Your Warranty Storage OTP', html: `<b>Hey there!</b><br>Your OTP is <b>${code}</b>. It expires in 10 minutes.` }),
    verified: (w) => ({
        subject: `Warranty verified: ${escapeHtml(w.product_name)}`,
        html: `<b>Good news!</b><br>${escapeHtml(w.product_name)} from ${escapeHtml(w.store_name)} is verified until <b>${w.expiry_date}</b>.<br><img src="${api()}/verify/${w.public_id}/qr" width="180" alt="Warranty QR"><br><a href="${app()}/verify/${w.public_id}">View warranty</a>`,
    }),
    rejected: (w, message, phone) => ({ /* same text as current rejectionmail, escaped */ }),
    transferRequested: (t, w, token, recipientExists) => ({ /* link ${app()}/transfer/${t._id}?token=${token}; if !recipientExists add "Register with this email first" */ }),
    transferAccepted: (t, w) => ({ /* to both sides */ }),
    expiring: (w, days) => ({ /* "expires in N days" + link ${app()}/UserEdit to extend */ }),
    extensionRequested: (e, w) => ({ /* to merchant */ }),
    extensionApproved: (e, w) => ({ /* to client, pay before e.pay_by */ }),
    extensionRejected: (e, w) => ({ /* to client with escaped note */ }),
    extensionCompleted: (e, w) => ({ /* to client + merchant, new expiry */ }),
    contact: () => ({ subject: 'Confirmation of the Query', html: 'Your Query Has been Received, We will process it shortly.' }),
}
```

### 7.4 Frontend

#### [NEW] `frontend/src/QRDialog.js`

```jsx
import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from "@mui/material";
import { API_URL } from "./api";

const QRDialog = ({ open, onClose, warranty }) => {
  if (!warranty) return null;
  const src = `${API_URL}/verify/${warranty.public_id}/qr`;
  return (
    <Dialog open={open} onClose={onClose} PaperProps={{ className: "dashboard-dialog-glass", style: { borderRadius: '24px', padding: '16px' } }}>
      <DialogTitle className="dashboard-dialog-title" sx={{ textAlign: 'center' }}>{warranty.product_name}</DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        <img src={src} alt="Warranty QR" width={240} height={240} style={{ background: 'white', borderRadius: 12, padding: 8 }} />
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 2 }}>
          Scan to verify this warranty. No personal details are shown.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center' }}>
        <Button href={`${src}?download=1`} className="dashboard-btn-add" variant="contained">Download</Button>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.6)' }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default QRDialog;
```

#### [NEW] `frontend/src/VerifyWarranty.js`, route `/verify/:publicId` (public)

- Calls `api.get(`/verify/${publicId}`)`.
- Shows a large status chip: green **Active**, red **Expired**, orange **Pending**, grey **Rejected**. Below it, the product, store, location, purchase date, expiry date, and "Extended N times".
- If the response has `owner_email` (the owning merchant is logged in), it shows an extra glass card with the owner email and warranty ID.
- A 404 shows "This warranty could not be found."

#### [MODIFY] `App.js`

```js
<Route path="/verify/:publicId" element={<VerifyWarranty/>}></Route>
```

> `vercel.json` already rewrites every path to `/`, so deep links like `/verify/...` and `/transfer/...` work on Vercel. The nginx config in section 12 does the same for Docker.

---

## 8. Feature 4: Message Queue (RabbitMQ)

### 8.1 Why RabbitMQ, not Kafka

- **Kafka** is a distributed log built for very high throughput, replay, and stream processing. There is no permanent free managed Kafka: Upstash discontinued its Kafka product, and Confluent only offers trial credit. A self-hosted Kafka needs about 1 GB RAM or more, which does not fit Render free.
- This app needs **task queues with retries**: emails, embeddings, reminders. RabbitMQ is built for exactly that.
- CloudAMQP's free plan is push-based. An idle consumer uses no messages from the 1M/month quota.

### 8.2 Topology

```
publish(type, payload)
   │  routing key = event type, e.g. "transfer.accepted"
   ▼
[ws.events] topic exchange (durable)
   ├── binding warranty.# transfer.# extension.# contact.#   ─▶ [notifications]   ─▶ email handler
   └── binding warranty.created|verified|rejected,
               transfer.accepted, extension.completed       ─▶ [vector-sync]     ─▶ embed + upsert
on failure (attempt < 5):  sendToQueue("<queue>.retry")  ─TTL 30s─▶ DLX "" → routing key "<queue>"
on failure (attempt = 5):  sendToQueue("ws.dead")  (parking lot, inspect in CloudAMQP UI)
```

**Why each queue has its own retry queue that dead-letters to the default exchange with `routing key = queue name`:**
- A retried message goes back to **only the queue that failed**. If it went back through the topic exchange, a failed email would re-trigger a successful vector sync.
- The retry queue uses a fixed **queue-level** `x-message-ttl`. Per-message TTLs in a shared queue only expire at the head of the queue, which blocks messages behind it.

### 8.3 Code

#### [NEW] `backend/queue/rabbit.js`

```js
const amqp = require('amqplib')
const crypto = require('crypto')

const EXCHANGE = 'ws.events'
const DEAD_QUEUE = 'ws.dead'
const MAX_ATTEMPTS = 5
const RETRY_DELAY_MS = 30000
const BINDINGS = {
    notifications: ['warranty.#', 'transfer.#', 'extension.#', 'contact.#'],
    'vector-sync': ['warranty.created', 'warranty.verified', 'warranty.rejected', 'transfer.accepted', 'extension.completed'],
}

const handlers = {}
let connection = null
let pubChannel = null
let subChannel = null
let timer = null
let closing = false

const matches = (pattern, key) => new RegExp('^' + pattern.split('.').map((p) => p === '#' ? '.*' : p === '*' ? '[^.]+' : p.replace(/[-/\\^$+?()|[\]{}]/g, '\\$&')).join('\\.') + '$').test(key)

const register = (queue, handler) => {
    handlers[queue] = handler
}

const runInline = (type, payload) => {
    for (const [queue, keys] of Object.entries(BINDINGS)) {
        if (!handlers[queue] || !keys.some((k) => matches(k, type))) continue
        setImmediate(() => handlers[queue](type, payload).catch((err) => console.error(`Inline ${queue} ${type} failed:`, err.message)))
    }
}

const scheduleReconnect = () => {
    if (closing || timer) return
    timer = setTimeout(() => {
        timer = null
        connect()
    }, 5000)
}

const setupTopology = async (ch) => {
    await ch.assertExchange(EXCHANGE, 'topic', { durable: true })
    await ch.assertQueue(DEAD_QUEUE, { durable: true })
    for (const [queue, keys] of Object.entries(BINDINGS)) {
        await ch.assertQueue(queue, { durable: true })
        for (const key of keys) await ch.bindQueue(queue, EXCHANGE, key)
        await ch.assertQueue(`${queue}.retry`, {
            durable: true,
            arguments: { 'x-message-ttl': RETRY_DELAY_MS, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': queue },
        })
    }
}

const consume = async (queue, handler) => {
    await subChannel.consume(queue, async (msg) => {
        if (!msg) return
        const headers = msg.properties.headers || {}
        const attempts = Number(headers['x-attempts'] || 0)
        try {
            await handler(msg.properties.type, JSON.parse(msg.content.toString()), msg.properties.messageId)
            subChannel.ack(msg)
        } catch (error) {
            console.error(`Job ${queue}/${msg.properties.type} failed (attempt ${attempts + 1}):`, error.message)
            const target = attempts + 1 >= MAX_ATTEMPTS ? DEAD_QUEUE : `${queue}.retry`
            subChannel.sendToQueue(target, msg.content, {
                ...msg.properties,
                headers: { ...headers, 'x-attempts': attempts + 1, 'x-error': String(error.message).slice(0, 200) },
            })
            subChannel.ack(msg)
        }
    })
}

const connect = async () => {
    if (!process.env.AMQP_URL || closing) return
    try {
        connection = await amqp.connect(process.env.AMQP_URL, { heartbeat: 30 })
        connection.on('error', (err) => console.error('AMQP error:', err.message))
        connection.on('close', () => {
            pubChannel = null
            subChannel = null
            scheduleReconnect()
        })
        pubChannel = await connection.createConfirmChannel()
        await setupTopology(pubChannel)
        subChannel = await connection.createChannel()
        await subChannel.prefetch(5)
        for (const [queue, handler] of Object.entries(handlers)) await consume(queue, handler)
        console.log('RabbitMQ connected')
    } catch (error) {
        console.error('RabbitMQ connect failed:', error.message)
        pubChannel = null
        subChannel = null
        if (connection) connection.close().catch(() => {})
        scheduleReconnect()
    }
}

const publish = async (type, payload) => {
    if (pubChannel) {
        try {
            const body = Buffer.from(JSON.stringify(payload))
            await new Promise((resolve, reject) => pubChannel.publish(EXCHANGE, type, body, {
                persistent: true,
                type,
                messageId: crypto.randomUUID(),
                contentType: 'application/json',
            }, (err) => err ? reject(err) : resolve()))
            return
        } catch (error) {
            console.error('Publish failed, running inline:', error.message)
        }
    }
    runInline(type, payload)
}

const close = async () => {
    closing = true
    if (timer) clearTimeout(timer)
    try {
        if (connection) await connection.close()
    } catch (error) { }
}

module.exports = { register, connect, publish, close, matches }
```

**Guarantees and limits:**
- `publish` **never throws** to the caller. If the broker is down or not configured, the same handler runs in-process after the response. The app therefore keeps working with no RabbitMQ (local dev, CI, CloudAMQP outage).
- Publisher confirms mean "published" really means the broker persisted the message.
- Delivery is **at-least-once**. A crash between handling and `ack` redelivers the message. The handlers are idempotent (next section).
- `messageId` is preserved across retries because `...msg.properties` is copied.

#### [NEW] `backend/notifications/handler.js`

```js
const { UserWarranty, Merchant, TransferRequest, ExtensionRequest } = require('../models/schema')
const { sendMail } = require('./mailer')
const templates = require('./templates')
const cache = require('../cache/redis')

const once = async (messageId, fn) => {
    if (messageId && !(await cache.setNx(`sent:${messageId}`, 86400))) return
    try {
        await fn()
    } catch (error) {
        if (messageId) await cache.del(`sent:${messageId}`)
        throw error
    }
}

const loadWarranty = (id) => UserWarranty.findById(id).select('-invoice').lean()
const merchantEmail = async (id) => id ? (await Merchant.findById(id).select('work_email').lean())?.work_email : null

const routes = {
    'warranty.verified': async ({ warranty_id }) => {
        const w = await loadWarranty(warranty_id)
        if (w) await sendMail({ to: w.email, ...templates.verified(w) })
    },
    'warranty.rejected': async ({ warranty_id, message }) => {
        const w = await loadWarranty(warranty_id)
        const m = w && w.merchant_id ? await Merchant.findById(w.merchant_id).select('work_phone').lean() : null
        if (w) await sendMail({ to: w.email, ...templates.rejected(w, message, m && m.work_phone) })
    },
    'warranty.expiring': async ({ warranty_id, days }) => {
        const w = await loadWarranty(warranty_id)
        if (w) await sendMail({ to: w.email, ...templates.expiring(w, days) })
    },
    'transfer.requested': async ({ transfer_id, token, recipient_exists }) => {
        const t = await TransferRequest.findById(transfer_id).lean()
        if (!t || t.status !== 'pending') return
        const w = await loadWarranty(t.warranty_id)
        await sendMail({ to: t.to_email, ...templates.transferRequested(t, w, token, recipient_exists) })
    },
    'transfer.accepted': async ({ transfer_id }) => { /* mail from_email + to_email */ },
    'transfer.declined': async ({ transfer_id }) => { /* mail from_email */ },
    'extension.requested': async ({ extension_id }) => { /* mail merchantEmail(e.merchant_id) */ },
    'extension.approved': async ({ extension_id }) => { /* mail e.client_email */ },
    'extension.rejected': async ({ extension_id }) => { /* mail e.client_email */ },
    'extension.completed': async ({ extension_id }) => { /* mail client + merchant */ },
    'contact.received': async ({ email }) => sendMail({ to: email, ...templates.contact() }),
}

module.exports = async (type, payload, messageId) => {
    const fn = routes[type]
    if (fn) await once(messageId, () => fn(payload))
}
```

- `once` uses Redis `SET NX` so a redelivered message does not send a duplicate email. It deletes the key on failure so the retry can still send.
- When `messageId` is missing (inline mode), it just runs.

Add to `cache/redis.js`:

```js
const setNx = async (key, ttl) => {
    if (!ready()) return true
    try {
        return (await client.set(key, '1', 'EX', ttl, 'NX')) === 'OK'
    } catch (error) {
        return true
    }
}
```

#### Daily cron (expiry reminders + cleanup)

`functions.js`:

```js
const dailyCron = async (req, res) => {
    const secret = Buffer.from(String(req.headers['x-cron-secret'] || ''))
    const expected = Buffer.from(String(process.env.CRON_SECRET || ''))
    if (!expected.length || secret.length !== expected.length || !crypto.timingSafeEqual(secret, expected)) {
        return res.status(401).json({ msg: 'Unauthorized' })
    }
    try {
        await expireStaleTransfers()
        await expireStaleExtensions()
        let queued = 0
        for (const days of [30, 7, 1]) {
            const target = addDays(todayStr(), days)
            const list = await UserWarranty.find({ status: 'validated', expiry_date: target }).select('_id').lean()
            for (const w of list) {
                await publish('warranty.expiring', { warranty_id: w._id, days })
                queued += 1
            }
        }
        res.status(200).json({ success: true, queued })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}
```

Triggered by `.github/workflows/cron.yml` (section 12). An exact-date match plus one run per day means each reminder goes out once. If a day's run is missed, that day's reminder is skipped rather than duplicated.

### 8.4 Why not BullMQ on Upstash

BullMQ workers keep issuing blocking and polling Redis commands even when idle, roughly one command every few seconds per worker. On Upstash's 500K/month free quota that alone uses about 15–20K commands/day, so the cache would hit the quota within the month. RabbitMQ pushes messages to consumers, so it uses nothing while idle.

---

## 9. Feature 5: Caching Layer (Redis)

### 9.1 Strategy

| Data | Key | TTL | Invalidated when |
|---|---|---|---|
| Client warranty list | `wl:user:{email}:v{N}:{page}:{limit}` | 120s | any write to that user's warranties (`INCR v:user:{email}`) |
| Merchant list | `wl:merchant:{id}:v{N}:{status}:{page}:{limit}` | 60s | any write to a warranty for that merchant (`INCR v:merchant:{id}`) |
| Merchant profile | `merchant:{id}` | 3600s | merchant profile edit (`DEL`) |
| Public verify | `verify:{public_id}` | 300s | status, transfer, or extension change (`DEL`) |
| Extension plans | `plans:{merchantId}` | 3600s | plan create, update, delete (`DEL`) |
| Query embeddings | `emb:{sha1(text)}` | 86400s | never (deterministic) |
| OTP | `otp:{email}` | 600s | verified, or 5 tries |
| Rate limits | `rl:*` | window | n/a |
| Email dedupe | `sent:{messageId}` | 86400s | n/a |

**Versioned keys instead of `KEYS`/`SCAN` + `DEL`:** a write does one `INCR`. Old entries become unreachable and expire on their own TTL. That is O(1) and cheap on the command quota.

**Read-your-writes:** invalidation is **synchronous** (awaited before the response), never queued. A user who adds a warranty sees it on the very next fetch.

**Failure mode:** every cache call is wrapped. If Redis is down, slow, or unconfigured, reads go straight to Mongo. `enableOfflineQueue: false` makes commands fail fast instead of piling up. The one weakness: if Redis is down *during* a write's `INCR`, readers can see stale data for at most one TTL (≤120s). That is acceptable.

### 9.2 Code

#### [NEW] `backend/cache/redis.js`

```js
const Redis = require('ioredis')

let client = null
if (process.env.REDIS_URL) {
    client = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
    client.on('error', (err) => console.error('Redis error:', err.message))
}

const ready = () => !!client && client.status === 'ready'

const get = async (key) => {
    if (!ready()) return null
    try {
        const val = await client.get(key)
        return val ? JSON.parse(val) : null
    } catch (error) {
        return null
    }
}

const set = async (key, value, ttl) => {
    if (!ready()) return
    try {
        await client.set(key, JSON.stringify(value), 'EX', ttl)
    } catch (error) { }
}

const del = async (...keys) => {
    if (!ready() || !keys.length) return
    try {
        await client.del(...keys)
    } catch (error) { }
}

const version = async (ns) => {
    if (!ready()) return 0
    try {
        return Number(await client.get(`v:${ns}`)) || 0
    } catch (error) {
        return 0
    }
}

const bump = async (ns) => {
    if (!ready()) return
    try {
        await client.incr(`v:${ns}`)
    } catch (error) { }
}

module.exports = { client, ready, get, set, del, version, bump, setNx }
```

(`setNx` from section 8.3 also goes in this file.)

> Upstash requires TLS. Use the `rediss://` URL and ioredis enables TLS automatically.
> Values are JSON. Always cache `.lean()` results so Mongoose documents and Buffers are never serialized.

#### [NEW] `backend/cache/invalidate.js`

```js
const cache = require('./redis')

const invalidateWarranty = async (w, ...extraEmails) => {
    const jobs = [cache.bump(`user:${w.email}`)]
    for (const email of extraEmails) jobs.push(cache.bump(`user:${email}`))
    if (w.merchant_id) jobs.push(cache.bump(`merchant:${w.merchant_id}`))
    if (w.public_id) jobs.push(cache.del(`verify:${w.public_id}`))
    await Promise.all(jobs)
}

module.exports = { invalidateWarranty }
```

**Every write path calls it:** upload, verify/reject, transfer accept (old and new owner), and extension complete.

---

## 10. Feature 6: Vector Database Migration (Atlas Vector Search)

### 10.1 What changes and why

**Today:** the chatbot puts **every** warranty of the user (or store) as JSON into the system prompt. That works for 10 records. For a merchant with 2,000 it overflows the 8B model's context, costs tokens, and slows every answer.

**After:**
- Warranty text is embedded into 384-dim vectors and stored in a `warrantyvectors` collection with an **Atlas Vector Search** index.
- The chatbot retrieves only the top-K relevant records, **pre-filtered by the caller's email (or merchant_id) taken from the JWT**. One user can never retrieve another user's vectors.

**Why Atlas Vector Search and not Chroma/Pinecone/Qdrant:**
1. It works on the existing M0 free cluster. There is no extra service, account, or bill.
2. It needs no dual-write consistency with another database. Vectors live next to the data, are updated through the same queue, and are included in Atlas backups.
3. Filtering (`email`, `merchant_id`) is native.
4. A self-hosted Chroma needs a persistent disk and an always-on private service. Render free has neither, so the vectors would vanish on every spin-down.

**Why embed locally (`Xenova/all-MiniLM-L6-v2`, quantized, via `@huggingface/transformers`):**
- No API key, rate limit, or cost.
- About 23 MB of weights, baked into the Docker image at build time, so there is no runtime download.
- Groq has no embedding endpoint, so a separate provider would otherwise be needed.

### 10.2 The trap this design avoids

Pure top-K retrieval breaks **aggregate questions**. "How many warranties expire this month?" retrieves 8 semantically similar records and the LLM confidently miscounts. So the chatbot is **hybrid**:

| Context block | Source | Always? |
|---|---|---|
| Rules + platform knowledge (now including transfer, QR, extension) | static `WEBSITE_KNOWLEDGE` | yes |
| **Structured summary:** totals by status, expiring within 30 days (list), extension and transfer counts | Mongo aggregation | yes |
| All records | Mongo | only if total ≤ `CHAT_FULL_CONTEXT_LIMIT` (25). This is today's behavior, and it is exact. |
| Top-8 relevant records | `$vectorSearch` | only if total > 25 |
| Fallback: latest 25 records | Mongo | if vector search errors (index missing, local dev without Atlas) |

### 10.3 Schema

#### [MODIFY] `schema.js`

```js
const warrantyVectorSchema = mongoose.Schema({
    warranty_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserWarranty',
        required: true,
        unique: true,
    },
    email: {
        type: String,
        required: true,
    },
    merchant_id: {
        type: mongoose.Schema.Types.ObjectId,
    },
    text: {
        type: String,
        required: true,
    },
    embedding: {
        type: [Number],
        required: true,
    },
}, { timestamps: true });
```

Export it as `WarrantyVector: mongoose.model('WarrantyVector', warrantyVectorSchema)`. The collection name is `warrantyvectors`.

**Atlas vector index** (Atlas UI > Atlas Search > Create Index > *JSON editor* > Vector Search, on `warrantyvectors`, named `warranty_vector_index`):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 384, "similarity": "cosine" },
    { "type": "filter", "path": "email" },
    { "type": "filter", "path": "merchant_id" }
  ]
}
```

Or run `node scripts/createVectorIndex.js`, which calls `WarrantyVector.collection.createSearchIndex({ name, type: 'vectorSearch', definition })`. If the driver call is refused on M0, use the UI. This uses **1 of the 3** M0 search indexes.

### 10.4 Code

#### [NEW] `backend/vector/embedder.js`

```js
const crypto = require('crypto')
const cache = require('../cache/redis')

let extractor = null

const getExtractor = () => {
    if (!extractor) {
        extractor = import('@huggingface/transformers').then(({ pipeline, env }) => {
            env.cacheDir = process.env.MODEL_CACHE_DIR || './.models'
            return pipeline('feature-extraction', process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' })
        }).catch((error) => {
            extractor = null
            throw error
        })
    }
    return extractor
}

const embed = async (text) => {
    const run = await getExtractor()
    const output = await run(text, { pooling: 'mean', normalize: true })
    return Array.from(output.data)
}

const embedQuery = async (text) => {
    const key = `emb:${crypto.createHash('sha1').update(text).digest('hex')}`
    const cached = await cache.get(key)
    if (cached) return cached
    const vector = await embed(text)
    await cache.set(key, vector, 86400)
    return vector
}

module.exports = { embed, embedQuery, getExtractor }
```

- The pipeline **promise** is memoized, so concurrent first calls load the model once.
- A failed load clears the memo so the next call retries.
- Dynamic `import()` lets CommonJS load the ESM package.

#### [NEW] `backend/vector/sync.js`

```js
const { UserWarranty, WarrantyVector } = require('../models/schema')
const { embed } = require('./embedder')

const toText = (w) => [
    `Product: ${w.product_name}.`,
    `Store: ${w.store_name}, ${w.store_location}.`,
    `Purchased: ${w.purchase_date}.`,
    `Expires: ${w.expiry_date || 'not set'}.`,
    `Status: ${w.status}.`,
    (w.extensions || []).length ? `Extended ${w.extensions.length} time(s).` : '',
    (w.ownership_history || []).length ? 'Received by transfer.' : '',
].filter(Boolean).join(' ')

const syncWarranty = async (warrantyId) => {
    const w = await UserWarranty.findById(warrantyId).select('-invoice').lean()
    if (!w) return WarrantyVector.deleteOne({ warranty_id: warrantyId })
    const text = toText(w)
    const existing = await WarrantyVector.findOne({ warranty_id: w._id }).select('text').lean()
    const update = { email: w.email, merchant_id: w.merchant_id, text }
    if (!existing || existing.text !== text) update.embedding = await embed(text)
    await WarrantyVector.updateOne({ warranty_id: w._id }, { $set: update }, { upsert: true })
}

module.exports = { toText, syncWarranty }
```

- The text **excludes the email**. A transfer only changes the `email` filter field, so it costs no re-embed.
- The handler is idempotent, so it is safe on redelivery.

#### [NEW] `backend/vector/handler.js`

```js
const { syncWarranty } = require('./sync')

module.exports = async (type, payload) => {
    if (process.env.VECTOR_SEARCH_ENABLED === 'false' || !payload.warranty_id) return
    await syncWarranty(payload.warranty_id)
}
```

`extension.completed` and `transfer.accepted` payloads include `warranty_id`.

#### [NEW] `backend/vector/search.js`

```js
const { WarrantyVector } = require('../models/schema')
const { embedQuery } = require('./embedder')

const searchWarranties = async (filter, query, limit = 8) => {
    const queryVector = await embedQuery(query)
    return WarrantyVector.aggregate([
        { $vectorSearch: { index: 'warranty_vector_index', path: 'embedding', queryVector, numCandidates: limit * 20, limit, filter } },
        { $project: { _id: 0, warranty_id: 1, text: 1, score: { $meta: 'vectorSearchScore' } } },
    ])
}

module.exports = { searchWarranties }
```

`$vectorSearch` must be the **first** stage. Mongoose does not cast inside aggregates, so pass `merchant_id` as `new mongoose.Types.ObjectId(id)`.

### 10.5 Chatbot context (replaces lines 434–483)

```js
const FULL_LIMIT = Number(process.env.CHAT_FULL_CONTEXT_LIMIT || 25)

const summarize = async (match) => {
    const today = todayStr()
    const soon = addDays(today, 30)
    const [byStatus, expiring] = await Promise.all([
        UserWarranty.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
        UserWarranty.find({ ...match, status: 'validated', expiry_date: { $gte: today, $lte: soon } }).select('product_name expiry_date').lean(),
    ])
    return { byStatus, expiringIn30Days: expiring.map((w) => ({ product: w.product_name, expires: w.expiry_date })) }
}

const recordsFor = async (match, vectorFilter, message, total) => {
    const fields = 'product_name store_name store_location purchase_date expiry_date status email extensions'
    if (total <= FULL_LIMIT || process.env.VECTOR_SEARCH_ENABLED === 'false') {
        return UserWarranty.find(match).select(fields).lean()
    }
    try {
        const hits = await searchWarranties(vectorFilter, message, 8)
        return UserWarranty.find({ _id: { $in: hits.map((h) => h.warranty_id) } }).select(fields).lean()
    } catch (error) {
        console.error('Vector search failed, falling back:', error.message)
        return UserWarranty.find(match).select(fields).sort({ _id: -1 }).limit(FULL_LIMIT).lean()
    }
}
```

For a client: `match = { email: req.user.email }` and `vectorFilter = { email: req.user.email }`.

For a merchant: `match = { store_name, store_location }` (taken from `getMerchant`) and `vectorFilter = { merchant_id: new ObjectId(req.user.id) }`.

The prompt then states the record set honestly: "Showing all N records" or "Showing the 8 most relevant of N records; use the SUMMARY for totals."

> The merchant filter uses `merchant_id`, which `uploadwarranty` now sets **at creation** when the store matches a registered merchant. Pending warranties are therefore searchable by their merchant too. Legacy rows get it from the migration (section 13).

### 10.6 Alternatives (only if needed)

- **Out of memory on Render's 512 MB:** set `EMBEDDING_PROVIDER=voyage`, add a 15-line `embed()` branch calling Voyage AI `voyage-3.5-lite` (free token allowance; set `output_dimension` and update `numDimensions`), and remove the model warm-up from the Dockerfile. Re-run the backfill, because vectors from different models are not comparable.
- **Wanting a dedicated vector DB for learning:** Qdrant Cloud has a free 1 GB cluster, and the `vector/search.js` interface stays the same. You give up the single-database benefit.

---

## 11. Feature 7: Warranty Extension Mechanism

### 11.1 How it works

```
MERCHANT                        CLIENT                           SERVER / RAZORPAY
 defines plans:                                                   
  "6 months  – ₹499"                                               
  "12 months – ₹899"  ──────▶  opens Extend on an active, verified warranty
  "24 months – ₹1,499"          sees ONLY that merchant's active plans
  (requires_approval: yes/no)   picks one ──▶ POST /extensions
                                                                  price/duration SNAPSHOT saved
                                                                  status = requested (or approved
                                                                  if plan.requires_approval=false)
 sees request ◀─────────────────────────────────────────────────── email + dashboard
 approve / reject(note)  ─────────────────────────────────────────▶ approved (pay_by = +72h)
                                Pay ──▶ POST /extensions/:id/order ─▶ Razorpay order (amount = snapshot)
                                Razorpay Checkout (UPI/card)        
                                handler ─▶ POST /extensions/:id/verify  HMAC(order|payment) ✔
                                                                  ┐
                                       Razorpay webhook (backup) ─┤ finalizeExtension() — idempotent
                                                                  ┘ TRANSACTION:
                                                                     request approved→completed
                                                                     expiry = addMonths(max(expiry,today), months)
                                                                     push warranty.extensions[]
 email "extension sold" ◀──────────── email "new expiry X" ◀────── publish extension.completed
```

**Key rules:**
1. **Prices come only from the merchant's plans.** The client sends `plan_id`, never an amount. The amount is snapshotted at request time, so a later price change does not affect an open request.
2. **One price per duration per merchant.** A partial unique index on `{merchant_id, duration_months}` where `active: true` enforces it.
3. **Pay only after approval** (when the plan requires approval). A rejection never involves money, so no refund flow is needed. Plans with `requires_approval: false` skip straight to payment.
4. **The new expiry stacks:**
   - not yet expired: `old_expiry + N months`
   - expired: refused at request time
   - expired during the payment window: extends from today, so the customer never loses paid time
   - month-end is clamped (Jan 31 + 1 month = Feb 28/29)
5. **Payment is trusted only from the server:**
   - signature HMAC-SHA256(`order_id|payment_id`, key_secret) on `/verify`
   - webhook HMAC over the raw body as a **backup** for when the user closes the tab after paying
   - both paths call the same **idempotent** `finalizeExtension`, so the warranty is extended **exactly once**
6. **At most one open extension per warranty.** It is enforced with an `open: true` flag and a partial unique index. A boolean was chosen because partial-index support for `$in` depends on the server version.
7. **Mutual exclusion with transfers.** A transfer cannot start while an extension is open, and an extension cannot start while a transfer is pending.
8. **Abandoned requests expire:**
   - `requested` older than `EXTENSION_REVIEW_DAYS` (7)
   - `approved` past `pay_by` with no order created
   - `approved` with an order created, past `pay_by` + 24h

   This frees the open slot. **A real payment that arrives late for an `expired` request is still honored**, because money was taken. A client cannot cancel once an order exists, which closes the "cancel, then pay in the still-open checkout" hole.

### 11.2 Schemas

#### [MODIFY] `schema.js`

```js
const extensionPlanSchema = mongoose.Schema({
    merchant_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Merchant',
        required: true,
    },
    label: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60,
    },
    duration_months: {
        type: Number,
        required: true,
        min: 1,
        max: 120,
        validate: Number.isInteger,
    },
    price: {
        type: Number,
        required: true,
        min: 100,
        validate: Number.isInteger,
    },
    currency: {
        type: String,
        default: 'INR',
    },
    requires_approval: {
        type: Boolean,
        default: true,
    },
    active: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });
extensionPlanSchema.index({ merchant_id: 1, duration_months: 1 }, { unique: true, partialFilterExpression: { active: true } });

const extensionRequestSchema = mongoose.Schema({
    warranty_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserWarranty',
        required: true,
    },
    merchant_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Merchant',
        required: true,
        index: true,
    },
    client_email: {
        type: String,
        required: true,
        index: true,
    },
    plan_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExtensionPlan',
    },
    plan_snapshot: {
        label: String,
        duration_months: Number,
        price: Number,
        currency: String,
    },
    status: {
        type: String,
        enum: ['requested', 'approved', 'rejected', 'completed', 'cancelled', 'expired'],
        default: 'requested',
    },
    open: {
        type: Boolean,
        default: true,
    },
    merchant_note: {
        type: String,
        maxlength: 300,
        default: '',
    },
    pay_by: Date,
    approved_at: Date,
    completed_at: Date,
    old_expiry: String,
    new_expiry: String,
    payment: {
        provider: String,
        order_id: String,
        payment_id: String,
        paid_at: Date,
    },
}, { timestamps: true });
extensionRequestSchema.index({ warranty_id: 1 }, { unique: true, partialFilterExpression: { open: true } });
extensionRequestSchema.index({ 'payment.order_id': 1 }, { unique: true, sparse: true });
```

**Prices are stored in paise** (integers). Razorpay requires the smallest currency unit, and integers avoid float errors. The minimum is ₹1 (100 paise). The UI converts rupees with `Math.round(rupees * 100)`.

### 11.3 Payment adapter

#### [NEW] `backend/payments/razorpay.js`

```js
const crypto = require('crypto')
const Razorpay = require('razorpay')

const mock = process.env.PAYMENT_PROVIDER === 'mock' && process.env.NODE_ENV !== 'production'
const client = !mock && process.env.RAZORPAY_KEY_ID
    ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
    : null

const safeEqual = (a, b) => {
    const x = Buffer.from(String(a))
    const y = Buffer.from(String(b))
    return x.length === y.length && crypto.timingSafeEqual(x, y)
}

const createOrder = async ({ amount, currency, receipt, notes }) => {
    if (mock) return { id: `order_mock_${crypto.randomBytes(8).toString('hex')}`, amount, currency }
    if (!client) throw Object.assign(new Error('Payments are not configured'), { statusCode: 503 })
    return client.orders.create({ amount, currency, receipt, notes })
}

const verifyPayment = ({ order_id, payment_id, signature }) => {
    if (mock) return true
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${order_id}|${payment_id}`).digest('hex')
    return safeEqual(expected, signature)
}

const verifyWebhook = (rawBody, signature) => {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET || !signature) return false
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex')
    return safeEqual(expected, signature)
}

module.exports = { mock, createOrder, verifyPayment, verifyWebhook }
```

### 11.4 Controller

#### [NEW] `backend/controllers/extensionController.js`

```js
const mongoose = require('mongoose')
const { UserWarranty, ExtensionPlan, ExtensionRequest, TransferRequest } = require('../models/schema')
const { todayStr, addMonths, isExpired, hoursFromNow } = require('../utils/dates')
const { invalidateWarranty } = require('../cache/invalidate')
const cache = require('../cache/redis')
const { publish } = require('../queue/rabbit')
const payments = require('../payments/razorpay')

const PAY_WINDOW = () => process.env.EXTENSION_PAY_WINDOW_HOURS || 72
const REVIEW_DAYS = () => Number(process.env.EXTENSION_REVIEW_DAYS || 7)

const expireStaleExtensions = (filter = {}) => {
    const now = new Date()
    return ExtensionRequest.updateMany({
        ...filter,
        open: true,
        $or: [
            { status: 'requested', createdAt: { $lt: new Date(now - REVIEW_DAYS() * 86400000) } },
            { status: 'approved', 'payment.order_id': { $exists: false }, pay_by: { $lt: now } },
            { status: 'approved', 'payment.order_id': { $exists: true }, pay_by: { $lt: new Date(now - 86400000) } },
        ],
    }, { status: 'expired', open: false })
}

const activePlans = async (merchantId) => {
    const key = `plans:${merchantId}`
    const cached = await cache.get(key)
    if (cached) return cached
    const plans = await ExtensionPlan.find({ merchant_id: merchantId, active: true }).sort({ duration_months: 1 }).lean()
    await cache.set(key, plans, 3600)
    return plans
}

const listPlans = async (req, res) => {
    try {
        res.status(200).json({ data: await ExtensionPlan.find({ merchant_id: req.user.id }).sort({ active: -1, duration_months: 1 }).lean() })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const planFields = (body) => {
    const fields = {}
    if (body.label !== undefined) fields.label = String(body.label).trim()
    if (body.duration_months !== undefined) fields.duration_months = Number(body.duration_months)
    if (body.price !== undefined) fields.price = Number(body.price)
    if (body.requires_approval !== undefined) fields.requires_approval = !!body.requires_approval
    if (body.active !== undefined) fields.active = !!body.active
    return fields
}

const createPlan = async (req, res) => {
    try {
        const plan = await ExtensionPlan.create({ ...planFields(req.body), merchant_id: req.user.id })
        await cache.del(`plans:${req.user.id}`)
        res.status(201).json({ data: plan })
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ msg: 'You already have an active plan for this duration' })
        if (error.name === 'ValidationError') return res.status(400).json({ msg: error.message })
        res.status(500).json({ msg: error.message })
    }
}

const updatePlan = async (req, res) => {
    try {
        const plan = await ExtensionPlan.findOneAndUpdate({ _id: req.params.id, merchant_id: req.user.id }, planFields(req.body), { new: true, runValidators: true })
        if (!plan) return res.status(404).json({ msg: 'Plan not found' })
        await cache.del(`plans:${req.user.id}`)
        res.status(200).json({ data: plan })
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ msg: 'You already have an active plan for this duration' })
        if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ msg: error.message })
        res.status(500).json({ msg: error.message })
    }
}

const deletePlan = async (req, res) => {
    try {
        const plan = await ExtensionPlan.findOneAndUpdate({ _id: req.params.id, merchant_id: req.user.id }, { active: false }, { new: true })
        if (!plan) return res.status(404).json({ msg: 'Plan not found' })
        await cache.del(`plans:${req.user.id}`)
        res.status(200).json({ success: true })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const eligibleWarranty = async (id, email) => {
    if (!mongoose.isValidObjectId(id)) return null
    const w = await UserWarranty.findOne({ _id: id, email }).select('-invoice').lean()
    if (!w || w.status !== 'validated' || !w.merchant_id || isExpired(w.expiry_date)) return null
    return w
}

const plansForWarranty = async (req, res) => {
    try {
        const w = await eligibleWarranty(req.params.id, req.user.email)
        if (!w) return res.status(400).json({ msg: 'This warranty cannot be extended' })
        res.status(200).json({ data: await activePlans(w.merchant_id), expiry_date: w.expiry_date })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const requestExtension = async (req, res) => {
    try {
        const { warranty_id, plan_id } = req.body
        const w = await eligibleWarranty(warranty_id, req.user.email)
        if (!w) return res.status(400).json({ msg: 'This warranty cannot be extended' })
        if (!mongoose.isValidObjectId(plan_id)) return res.status(400).json({ msg: 'Invalid plan' })
        const plan = await ExtensionPlan.findOne({ _id: plan_id, merchant_id: w.merchant_id, active: true }).lean()
        if (!plan) return res.status(404).json({ msg: 'Plan not available' })
        if (await TransferRequest.exists({ warranty_id, status: 'pending', expires_at: { $gt: new Date() } })) {
            return res.status(409).json({ msg: 'Cancel the pending transfer first' })
        }
        await expireStaleExtensions({ warranty_id })
        const autoApproved = !plan.requires_approval
        const ext = await ExtensionRequest.create({
            warranty_id,
            merchant_id: w.merchant_id,
            client_email: req.user.email,
            plan_id: plan._id,
            plan_snapshot: { label: plan.label, duration_months: plan.duration_months, price: plan.price, currency: plan.currency },
            status: autoApproved ? 'approved' : 'requested',
            approved_at: autoApproved ? new Date() : undefined,
            pay_by: autoApproved ? hoursFromNow(PAY_WINDOW()) : undefined,
        })
        await publish(autoApproved ? 'extension.approved' : 'extension.requested', { extension_id: ext._id })
        res.status(201).json({ data: ext })
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ msg: 'An extension request is already open for this warranty' })
        res.status(500).json({ msg: error.message })
    }
}

const myExtensions = async (req, res) => {
    try {
        await expireStaleExtensions({ client_email: req.user.email })
        const data = await ExtensionRequest.find({ client_email: req.user.email }).sort({ createdAt: -1 }).limit(50)
            .populate('warranty_id', 'product_name store_name expiry_date').lean()
        res.status(200).json({ data })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const cancelExtension = async (req, res) => {
    try {
        const ext = await ExtensionRequest.findOneAndUpdate(
            { _id: req.params.id, client_email: req.user.email, open: true, 'payment.order_id': { $exists: false }, status: { $in: ['requested', 'approved'] } },
            { status: 'cancelled', open: false },
            { new: true }
        )
        if (!ext) return res.status(400).json({ msg: 'This request can no longer be cancelled' })
        res.status(200).json({ success: true })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const merchantExtensions = async (req, res) => {
    try {
        await expireStaleExtensions({ merchant_id: req.user.id })
        const filter = { merchant_id: req.user.id }
        if (req.query.status && req.query.status !== 'All') filter.status = req.query.status
        const data = await ExtensionRequest.find(filter).sort({ createdAt: -1 }).limit(200)
            .populate('warranty_id', 'product_name purchase_date expiry_date').lean()
        res.status(200).json({ data })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const reviewExtension = async (req, res) => {
    try {
        const { action } = req.body
        const note = String(req.body.note || '').slice(0, 300)
        if (!['approve', 'reject'].includes(action)) return res.status(400).json({ msg: 'Invalid action' })
        const update = action === 'approve'
            ? { status: 'approved', approved_at: new Date(), pay_by: hoursFromNow(PAY_WINDOW()), merchant_note: note }
            : { status: 'rejected', open: false, merchant_note: note }
        const ext = await ExtensionRequest.findOneAndUpdate({ _id: req.params.id, merchant_id: req.user.id, status: 'requested', open: true }, update, { new: true })
        if (!ext) return res.status(404).json({ msg: 'Request not found or already reviewed' })
        await publish(action === 'approve' ? 'extension.approved' : 'extension.rejected', { extension_id: ext._id })
        res.status(200).json({ data: ext })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const createExtensionOrder = async (req, res) => {
    try {
        let ext = await ExtensionRequest.findOne({ _id: req.params.id, client_email: req.user.email, status: 'approved', open: true })
        if (!ext) return res.status(404).json({ msg: 'Nothing to pay for' })
        if (ext.pay_by < new Date() && !ext.payment.order_id) {
            await ExtensionRequest.updateOne({ _id: ext._id, status: 'approved' }, { status: 'expired', open: false })
            return res.status(410).json({ msg: 'Payment window has expired. Please request again.' })
        }
        if (!ext.payment.order_id) {
            const order = await payments.createOrder({
                amount: ext.plan_snapshot.price,
                currency: ext.plan_snapshot.currency,
                receipt: String(ext._id),
                notes: { extension_id: String(ext._id) },
            })
            ext = await ExtensionRequest.findOneAndUpdate(
                { _id: ext._id, 'payment.order_id': { $exists: false } },
                { $set: { 'payment.provider': payments.mock ? 'mock' : 'razorpay', 'payment.order_id': order.id } },
                { new: true }
            ) || await ExtensionRequest.findById(ext._id)
        }
        res.status(200).json({
            order_id: ext.payment.order_id,
            amount: ext.plan_snapshot.price,
            currency: ext.plan_snapshot.currency,
            key_id: process.env.RAZORPAY_KEY_ID,
            mock: payments.mock,
        })
    } catch (error) {
        res.status(error.statusCode || 500).json({ msg: error.message })
    }
}

const finalizeExtension = async (orderId, paymentId) => {
    let done = null
    await mongoose.connection.transaction(async (session) => {
        done = null
        const ext = await ExtensionRequest.findOneAndUpdate(
            { 'payment.order_id': orderId, status: { $in: ['approved', 'expired'] } },
            { $set: { status: 'completed', open: false, completed_at: new Date(), 'payment.payment_id': paymentId, 'payment.paid_at': new Date() } },
            { new: true, session }
        )
        if (!ext) return
        const w = await UserWarranty.findById(ext.warranty_id).select('-invoice').session(session)
        const today = todayStr()
        const base = !isExpired(w.expiry_date) ? w.expiry_date : today
        const newExpiry = addMonths(base, ext.plan_snapshot.duration_months)
        const oldExpiry = w.expiry_date
        w.expiry_date = newExpiry
        w.extensions.push({
            request_id: ext._id,
            months: ext.plan_snapshot.duration_months,
            price: ext.plan_snapshot.price,
            currency: ext.plan_snapshot.currency,
            old_expiry: oldExpiry,
            new_expiry: newExpiry,
            extended_at: new Date(),
        })
        await w.save({ session })
        ext.old_expiry = oldExpiry
        ext.new_expiry = newExpiry
        await ext.save({ session })
        done = { ext, w }
    })
    if (done) {
        await invalidateWarranty(done.w)
        await publish('extension.completed', { extension_id: done.ext._id, warranty_id: done.w._id })
    }
    return done
}

const verifyExtensionPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body
        const ext = await ExtensionRequest.findOne({ _id: req.params.id, client_email: req.user.email, 'payment.order_id': razorpay_order_id })
        if (!ext) return res.status(404).json({ msg: 'Order not found' })
        if (!payments.verifyPayment({ order_id: razorpay_order_id, payment_id: razorpay_payment_id, signature: razorpay_signature })) {
            return res.status(400).json({ msg: 'Payment verification failed' })
        }
        await finalizeExtension(razorpay_order_id, razorpay_payment_id)
        const latest = await ExtensionRequest.findById(ext._id).lean()
        res.status(200).json({ success: latest.status === 'completed', new_expiry: latest.new_expiry })
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
}

const razorpayWebhook = async (req, res) => {
    try {
        if (!payments.verifyWebhook(req.body, req.headers['x-razorpay-signature'])) {
            return res.status(400).json({ success: false })
        }
        const event = JSON.parse(req.body.toString('utf8'))
        if (['payment.captured', 'order.paid'].includes(event.event)) {
            const payment = event.payload && event.payload.payment && event.payload.payment.entity
            if (payment && payment.order_id) await finalizeExtension(payment.order_id, payment.id)
        }
        res.status(200).json({ success: true })
    } catch (error) {
        console.error('Webhook error:', error)
        res.status(500).json({ success: false })
    }
}

module.exports = {
    listPlans, createPlan, updatePlan, deletePlan, plansForWarranty, requestExtension, myExtensions, cancelExtension,
    merchantExtensions, reviewExtension, createExtensionOrder, verifyExtensionPayment, razorpayWebhook, finalizeExtension, expireStaleExtensions,
}
```

**Why `finalizeExtension` cannot double-extend:**
- The verify and webhook paths both run the transaction. The first commits `approved → completed`.
- The second either sees `completed`, so `ext` is null and it does nothing, or hits a **WriteConflict**. Mongoose's `transaction()` then retries and sees `completed`.
- `done = null` at the top of the callback resets state on every retry.

**`isExpired(w.expiry_date)` base choice:**
- A warranty that is still valid extends from its current expiry.
- One that expired while the client was paying extends from today.
- A non-date `expiry_date` (`''`/`NA`) is impossible here, because eligibility requires `validated` with a valid date. If it still occurs, it falls back to today.

### 11.5 Frontend

#### [NEW] `frontend/src/razorpay.js`

```js
export const loadRazorpay = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const script = document.createElement("script");
  script.src = "https://checkout.razorpay.com/v1/checkout.js";
  script.onload = () => resolve(true);
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});
```

#### [NEW] `frontend/src/ExtensionDialog.js` (client)

1. On open, call `api.get(`/warranties/${warranty._id}/extension-plans`)`. Render each plan as a selectable glass card: label, `+N months`, `₹${(price / 100).toFixed(2)}`, and "new expiry ≈ X". Compute X client-side for display only; the server is authoritative.
2. Show "Needs store approval" when `requires_approval` is true.
3. **Request** calls `api.post("/extensions", { warranty_id, plan_id })`. Show the server message on 409 or 400.

#### Pay flow (in a `MyExtensions` panel on `warranty-edit.js`)

Lists `api.get("/extensions")` with status chips. `approved` rows show **Pay ₹X before {pay_by}**:

```js
const pay = async (ext) => {
  const { data } = await api.post(`/extensions/${ext._id}/order`);
  if (data.mock) {
    await api.post(`/extensions/${ext._id}/verify`, { razorpay_order_id: data.order_id, razorpay_payment_id: "pay_mock", razorpay_signature: "mock" });
    return refresh();
  }
  if (!(await loadRazorpay())) return setError("Could not load payment window");
  const rzp = new window.Razorpay({
    key: data.key_id,
    amount: data.amount,
    currency: data.currency,
    order_id: data.order_id,
    name: "Warranty Storage",
    description: ext.plan_snapshot.label,
    theme: { color: "#f064c5" },
    handler: async (response) => {
      await api.post(`/extensions/${ext._id}/verify`, response);
      refresh();
    },
    modal: { ondismiss: refresh },
  });
  rzp.on("payment.failed", (r) => setError(r.error.description));
  rzp.open();
};
```

The handler's `response` already has the exact keys `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`.

#### [NEW] `frontend/src/MerchantPlans.js` (merchant)

- Glass table of plans: label, months, price ₹, approval, active toggle, edit, deactivate.
- "Add plan" dialog with **Label**, **Duration (months)** (`type=number`, 1–120), **Price ₹** (sent as `Math.round(price * 100)`), and **Requires approval** (Switch).
- A 409 shows "You already have an active plan for this duration."

#### [MODIFY] `MerchantValidation.js`

- Add MUI `Tabs`: **Verifications** (existing) | **Extension requests** | **Plans** (`<MerchantPlans/>`).
- The Extension requests tab lists `api.get("/merchant/extensions?status=...")` and shows **Approve** / **Reject (note)** buttons for `requested` rows, calling `api.patch(`/merchant/extensions/${id}`, { action, note })`.

---

## 12. Feature 3: Docker Containerization and CI/CD

### 12.1 Files

#### [NEW] `backend/Dockerfile`

```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production MODEL_CACHE_DIR=/app/.models
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/warmModel.js && chown -R node:node /app
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "app.js"]
```

- **Debian slim, not Alpine.** `bcrypt` and `onnxruntime-node` ship glibc binaries. Build tools are installed **only in the deps stage** as a fallback if a prebuilt binary is missing, and they never reach the final image.
- **Node 22 LTS.** Node 20 reached end of life in April 2026.
- `scripts/warmModel.js` is `require('./vector/embedder').getExtractor().then(() => process.exit(0))`. It bakes the model into the image.
- Runs as the non-root `node` user.

#### [NEW] `backend/.dockerignore`

```
node_modules
.env
.models
npm-debug.log
tests
coverage
```

#### [NEW] `frontend/Dockerfile`

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
```

CRA bakes `REACT_APP_*` **at build time**, so the API URL is a build arg, not a runtime env.

#### [NEW] `frontend/nginx.conf`

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  location /static/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
  location / {
    try_files $uri /index.html;
  }
}
```

#### [NEW] `frontend/.dockerignore`

```
node_modules
build
```

#### [NEW] `docker-compose.yml` (root; local full stack)

```yaml
services:
  mongo:
    image: mongodb/mongodb-atlas-local:8.0
    ports: ["27017:27017"]
    volumes:
      - mongo_data:/data/db
      - mongo_config:/data/configdb
      - mongot_data:/data/mongot
  redis:
    image: redis:7.4-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
  rabbitmq:
    image: rabbitmq:4.1-management-alpine
    ports: ["5672:5672", "15672:15672"]
    environment:
      RABBITMQ_DEFAULT_USER: ws
      RABBITMQ_DEFAULT_PASS: ws
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
  backend:
    build: ./backend
    env_file: ./backend/.env
    environment:
      URI: mongodb://mongo:27017/warranty?directConnection=true
      REDIS_URL: redis://redis:6379
      AMQP_URL: amqp://ws:ws@rabbitmq:5672
      FRONTEND_URL: http://localhost:3000
      BACKEND_PUBLIC_URL: http://localhost:5000
      PAYMENT_PROVIDER: mock
      NODE_ENV: development
    ports: ["5000:5000"]
    depends_on:
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
  frontend:
    build:
      context: ./frontend
      args:
        REACT_APP_API_URL: http://localhost:5000/warranty/setup
    ports: ["3000:80"]
    depends_on: [backend]
volumes:
  mongo_data:
  mongo_config:
  mongot_data:
```

**Pitfalls this Compose file avoids:**
- `mongodb-atlas-local` gives a local **replica set (transactions) plus Vector Search**. You must mount `/data/mongot`, or vector indexes vanish on restart (a known issue). The image has its own healthcheck, which `service_healthy` uses. Pin the tag you pull.
- RabbitMQ's default `guest` user **cannot log in from another container** (it is restricted to localhost), so a real user is set.
- `directConnection=true` is required for a single-node replica set addressed by its service name.
- Run `node scripts/createVectorIndex.js` once after first `up`, inside `docker compose exec backend`.

#### [NEW] `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm test
        env:
          JWT_SECRET: test-secret
          PAYMENT_PROVIDER: mock
          NODE_ENV: test
          VECTOR_SEARCH_ENABLED: "false"
          RAZORPAY_WEBHOOK_SECRET: whsec_test

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run build
        env:
          REACT_APP_API_URL: https://warrantystoragebackend.onrender.com/warranty/setup

  docker:
    needs: [backend, frontend]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - if: github.event_name == 'push'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: backend
          push: ${{ github.event_name == 'push' }}
          tags: ghcr.io/${{ github.repository_owner }}/warrantystorage-backend:${{ github.sha }},ghcr.io/${{ github.repository_owner }}/warrantystorage-backend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: [docker]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"
```

- GHCR image tags must be **lowercase**. If your GitHub username has capitals (`KingAB2004`), hardcode the lowercase owner (`kingab2004`).
- `actions/setup-node` with `CI=true` makes **CRA fail the build on any ESLint warning**. Phase 0 removes the current unused-variable warnings. Do not hide the problem with `CI=false`.
- **CD:** Render has auto-deploy off and rebuilds from the Dockerfile when the hook fires, so only commits that passed CI deploy. Vercel keeps its own Git integration. Optionally enable "Require status checks" on `main`.

#### [NEW] `.github/workflows/cron.yml`

```yaml
name: Daily jobs
on:
  schedule:
    - cron: "30 3 * * *"
  workflow_dispatch:
jobs:
  daily:
    runs-on: ubuntu-latest
    steps:
      - run: >
          curl -fsS --retry 4 --retry-delay 30 --max-time 120 -X POST
          -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
          "${{ secrets.BACKEND_URL }}/warranty/setup/internal/cron/daily"
```

- 03:30 UTC is 09:00 IST.
- The retries cover Render's ~1 minute cold start.
- GitHub disables scheduled workflows after **60 days without repo activity** on public repos. Re-enable it from the Actions tab if that happens.

### 12.2 Tests (`backend/tests/`, Jest + Supertest + `MongoMemoryReplSet`)

`package.json` scripts: `"test": "jest --runInBand"`, `"start": "node app.js"`.

`tests/setup.js` starts `MongoMemoryReplSet` (needed for transactions), sets `process.env.URI`, and connects Mongoose. Redis and AMQP stay unset, so inline mode runs and no external services are needed.

| Test | Asserts |
|---|---|
| `auth.test.js` | Wrong password returns 401. A correct login response **has no `hashed` field**. A client token on a merchant route returns 403. A reset token on `/id` returns 401. |
| `otp.test.js` | `/OTP` ignores `num`. 6 wrong tries lock the OTP. A valid OTP gives a reset token, and the password changes. |
| `dates.test.js` | `addMonths('2024-01-31',1) === '2024-02-29'`, `addMonths('2025-01-31',1) === '2025-02-28'`, `parseDateStr('2026-02-30') === null`. |
| `transfer.test.js` | Happy path moves the email and adds a history entry. A wrong account returns 403. A wrong token returns 403. An expired transfer returns 410. A second pending transfer returns 409. **Two concurrent accepts: exactly one 200.** Old and new owners' lists reflect the change. |
| `qr.test.js` | `/verify/:pid` has no `email`/`invoice`. The owning merchant sees `owner_email`. Another merchant does not. The QR endpoint returns `image/png`. |
| `extension.test.js` | A duplicate active duration returns 409. The client cannot pass a price. An expired warranty returns 400. Approve then mock pay extends by N months. **verify plus webhook (with a valid HMAC on the raw body) extends exactly once.** A bad webhook signature returns 400. Cancel after an order exists returns 400. A late payment on an `expired` request is still honored. |
| `queue.test.js` | `matches('warranty.#','warranty.created')` is true. `matches('warranty.created','transfer.accepted')` is false. |

---

## 13. Data Migration and Rollout

#### [NEW] `backend/scripts/migrate_v2.js`

Run **before** deploying the new backend: `node scripts/migrate_v2.js --dry-run` first, then without the flag.

1. **Duplicate check.** Group `userlogins` by `toLower(email)` and `merchants` by `toLower(work_email)`. If any group has more than one document, **print them and abort**. You must merge them by hand, because the unique index cannot be built otherwise.
2. **Lowercase** `userlogins.email`, `merchants.work_email`, and `userwarranties.email` with `updateMany` and an aggregation pipeline (`[{ $set: { email: { $toLower: '$email' } } }]`).
3. **`public_id`:** for every warranty missing it, `crypto.randomBytes(12).toString('base64url')`, in a bulkWrite.
4. **`merchant_id`:** for each merchant, `updateMany({ store_name: business_name, store_location: business_add, merchant_id: { $exists: false } }, { merchant_id })`.
5. **`invoice_type`:** sniff the magic bytes. `%PDF` is `application/pdf`, `89 50 4E 47` is `image/png`, `FF D8 FF` is `image/jpeg`. Anything else is `application/octet-stream`.
6. `await Promise.all(Object.values(models).map((m) => m.syncIndexes()))` builds the new unique and partial indexes now, while you are watching. Otherwise autoIndex builds them silently at boot and swallows errors.

Then run:
- `node scripts/createVectorIndex.js` (or create the index in the Atlas UI)
- `node scripts/backfillVectors.js`, which loops through all warranties and calls `syncWarranty`, about 50–100 ms each on a laptop

**Rollout order** (the login API contract changes, so the old frontend's bcrypt check would fail):

1. Set up Upstash, CloudAMQP, Razorpay test mode, Brevo, and the Render/Vercel/GitHub env vars and secrets.
2. Run the migration and backfill against Atlas from your machine.
3. Merge to `main`. CI then deploys the backend through the hook, and Vercel deploys the frontend at the same time. Expect a few minutes where the old frontend cannot log in.
4. Smoke test (below). Existing sessions must log in again, because their old tokens have no `role`. Tokens expire within 1 hour anyway.

**Manual smoke test:**
1. Register a client and a merchant.
2. Upload a warranty and check that the merchant sees it.
3. Verify it. Check the email, then the QR, then the verify page.
4. Transfer it to a second account and accept from the email.
5. Merchant adds plans. The client requests, the merchant approves, the client pays with test card `4111 1111 1111 1111` or UPI `success@razorpay`. The expiry should move.
6. Fire `workflow_dispatch` on the cron workflow.
7. Ask the chatbot "which warranties expire soon?"

---

## 14. Review: Faults Found in the Older Draft (`implementation_plan_Warranty_Storage.md`)

| Old draft said | Problem | This plan |
|---|---|---|
| BullMQ on Upstash, "10K commands/day free" | The free quota is now 500K/**month**. BullMQ's idle polling alone uses about 15–20K/day, so the cache would hit the quota. | RabbitMQ (push-based) on CloudAMQP |
| ChromaDB sidecar on Render/HF Spaces | Render free has no persistent disk and no private services, so vectors are lost on spin-down. It is also a second datastore to keep in sync. The JS client needs a separate embedding package. `chromadb/chroma:latest` is unpinned. | Atlas Vector Search on the same cluster, local embeddings baked into the image |
| QR stored as base64 in Mongo | Wastes the 512 MB quota. Stale if the URL ever changes. | Generated on request from `public_id`, cacheable |
| Simulated payment only | Not what feature 7 needs | Razorpay order, signature, and webhook with an idempotent finalize. Mock mode is for dev/CI only. |
| No auth changes | With S1–S4 still open, anyone could transfer, extend, or verify anyone's warranty | Phase 0 |
| Did not mention | SendGrid free plan retired; Render blocks SMTP; webhook needs the raw body; RabbitMQ `guest` cannot log in remotely; CRA `CI=true` warnings fail the build; status enum mismatch; `setMonth` overflow; Mongoose `default` on `public_id` changes every load for legacy docs; aggregate questions break pure top-K RAG | Each is addressed in the relevant section |

---

## 15. Final Re-Verification Checklist (walked through for faults)

**Correctness**
- [x] Every warranty write path calls `invalidateWarranty`: upload, verify/reject, transfer accept (both emails), extension finalize.
- [x] Every event that changes vector text is bound to `vector-sync`: created, verified, rejected, transfer.accepted (email filter), extension.completed.
- [x] Every list or cached read excludes `invoice`.
- [x] All date math goes through `utils/dates.js`. Strings stay `YYYY-MM-DD`, compatible with existing rows and the frontend.
- [x] Status values are `'validated'`/`'rejected'` everywhere, matching the existing data and frontend chips.
- [x] Partial unique indexes allow one pending transfer and one open extension per warranty, plus one active plan per duration. Stale rows are expired before inserts so they never block.
- [x] Transfer accept and extension finalize run in transactions with conditional updates. Concurrent duplicates resolve to exactly one winner.
- [x] The extension price comes only from the server-side snapshot. The amount in the Razorpay order equals the snapshot. The client never sends an amount.
- [x] A late payment is honored on `expired`. Cancel is blocked once an order exists.
- [x] The webhook route is before `express.json()`. The HMAC is computed over raw bytes. `timingSafeEqual` is length-guarded.
- [x] Mock payments are impossible when `NODE_ENV=production`.
- [x] The queue retry goes back only to the failing queue. Five attempts, then the parking lot. Email dedupe on `messageId`.
- [x] Without Redis, RabbitMQ, or the vector index, every feature still works (degraded).

**Security**
- [x] JWT carries `id` + `role`. Ownership checks exist on every warranty, transfer, extension, invoice, and plan route.
- [x] Reset tokens use a derived secret and cannot pass as login tokens.
- [x] The public verify page has no email or invoice. `public_id` has 96 random bits.
- [x] Transfer tokens are stored hashed. Accepting needs both the login and the token.
- [x] Email HTML is escaped. The API key is no longer logged. CORS is restricted. Auth, OTP, and actions are rate-limited.

**Deployability**
- [x] `PORT` comes from env. `/health` exists. The container runs as non-root. The model is baked in.
- [x] The free tiers fit (section 3.2). No background worker is needed. The cron runs through GitHub Actions.
- [x] Section 13 orders the migration so unique indexes cannot fail silently.

**Known, accepted edges (documented, not bugs):**
- A transfer and an extension created in the same millisecond can both pass the mutual-exclusion check. The result is still consistent: the warranty is extended *and* transferred, with no corruption. Fully preventing it would need a lock field on the warranty with cleanup on 7 terminal paths. That costs more risk than it removes.
- If Redis fails exactly during an `INCR`, cache data can be stale for at most 120s.
- Expiry uses UTC dates. In IST the day boundary shifts by 5.5h.

---

## 16. Suggested Additions (beyond the 7)

Ordered by value for effort:

1. **Move invoices to object storage** (Cloudflare R2 has 10 GB free; Cloudinary also has a free tier). Store only the URL and key in Mongo and serve signed URLs. This is the real limit of Atlas M0's 512 MB.
2. **Email verification at signup.** It closes the "register someone else's email" gap at the root and makes transfers fully trustless.
3. **Merchant picker instead of free-text store name/location.** Today a typo means the merchant **never sees** the warranty, because matching is by exact string. Add `GET /merchants/search?q=` with an autocomplete in the Add Warranty dialog that sets `merchant_id` directly.
4. **Claims / service log.** The merchant scans the QR, then clicks "Log service claim" (date, issue, resolution). This builds on Feature 2 and gives resale buyers a trustworthy history.
5. **httpOnly refresh-token cookies** instead of a JWT in `localStorage`, which XSS can steal. Also add `helmet()`.
6. **Request validation** with `zod` or `express-validator` on every body, in one middleware.
7. **Audit log collection** for every state change (who, what, before/after). Cheap, and it helps with disputes about payments and transfers.
8. **Merchant analytics:** extension revenue per month, verification turnaround, expiring-soon pipeline. Use the dataviz guidelines when building the charts.
9. **Observability:** Sentry (free tier) for both apps, structured logs (`pino`), and a CloudAMQP dead-letter alert.
10. **Migrate CRA to Vite.** Create React App is deprecated. Vite builds are about 10x faster and `REACT_APP_*` becomes `VITE_*`.
11. **OpenAPI docs** (`swagger-ui-express`) for the now-larger API.
12. **Web Push** for expiry reminders. It is already on the README roadmap and reuses the `warranty.expiring` event.

---

## 17. Execution Order

| Step | Work | Depends on | Size |
|---|---|---|---|
| 1 | Phase 0 (security, `api.js`, date utils, schema fixes, error handler, mailer swap) | none | L |
| 2 | Feature 5 (Redis cache, OTP store, rate limits) | 1 | S |
| 3 | Feature 4 (RabbitMQ, notifications, cron) | 1 | M |
| 4 | Feature 2 (QR + verify page) | 1, 2 | S |
| 5 | Feature 1 (transfers) | 1–3 | M |
| 6 | Feature 7 (extension + Razorpay) | 1–3, 5 (mutual exclusion) | L |
| 7 | Feature 6 (vectors + hybrid chatbot) | 3 | M |
| 8 | Feature 3 (Docker, Compose, CI/CD, tests); start the test scaffold in step 1 and add tests per feature | all | M |
| 9 | Migration, rollout, smoke test | all | S |
