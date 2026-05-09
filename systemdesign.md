# 🧠 System Design — Bulk Email Campaign Dispatcher

This document explains the problem this system solves, the architectural decisions made, the trade-offs involved, and the planned improvements. It exists to make the reasoning behind every decision transparent.

---

## 📌 Problem Statement

Sending bulk emails is a fundamentally slow operation. A single email delivery involves:
- Establishing an SMTP connection
- Authenticating with the mail server
- Transmitting the message
- Waiting for an acknowledgement

Doing this **synchronously** inside an API request for hundreds or thousands of recipients would mean:

- The API is **blocked** for the entire duration of all email sends
- The client has to wait for all emails to finish before getting a response
- Under high traffic, the server runs out of threads/connections and **crashes**
- A single failed email can block or break the entire batch

**The core problem:** How do you accept a campaign of 500+ recipients via an API, respond instantly, and deliver all emails reliably in the background — without overloading the server?

---

## 💡 The Approach

The solution is to **decouple ingestion from delivery** using an asynchronous queue-based architecture.

Instead of sending emails inside the API handler:

1. The API accepts the campaign, splits it into individual recipient jobs, and pushes each into a **Redis-backed queue**
2. The API immediately responds with a `campaign_id` — the client is never made to wait
3. **Worker services** running as a separate process consume jobs from the queue independently and deliver emails one by one via Nodemailer
4. After each delivery attempt, the worker updates campaign progress counters in Redis
5. The client can poll a status endpoint at any time to see real-time delivery progress

This pattern is called the **Producer-Consumer model** and is the foundation of how every large-scale notification system works in production.

---

## 🏗️ Architecture

```
Client
  │
  │  POST /task  { recipients: [...], subject, body }
  ▼
┌─────────────────────┐
│   Express.js API    │  ← Producer
│  (app.js)           │
│                     │
│  1. Save campaign   │
│     to MongoDB      │
│  2. Split into      │
│     individual jobs │
│  3. Push to queue   │
│  4. Return          │
│     campaign_id     │
└────────┬────────────┘
         │ enqueue jobs
         ▼
┌─────────────────────┐
│   BullMQ Queue      │  ← Buffer
│   (Redis)           │
│                     │
│  [ job ] [ job ]    │
│  [ job ] [ job ]    │
│  [ job ] [ job ]    │
└────────┬────────────┘
         │ consume jobs
         ▼
┌─────────────────────┐
│   Worker Service    │  ← Consumer
│   (worker.js)       │
│                     │
│  For each job:      │
│  1. Send email via  │
│     Nodemailer      │
│  2. On success →    │
│     incr sent       │
│     decr pending    │
│  3. On failure →    │
│     incr failed     │
│     decr pending    │
└─────────────────────┘
         │ updates counters
         ▼
┌─────────────────────┐
│   Redis Counters    │
│                     │
│  campaign:id:sent   │
│  campaign:id:failed │
│  campaign:id:pending│
└─────────────────────┘
         ▲
         │ reads counters
┌────────┴────────────┐
│  GET /campaign/:id  │
│  Status Endpoint    │
└─────────────────────┘
         ▲
         │ polls
       Client
```

---

## 🔧 Key Technical Decisions

### 1. Why BullMQ over a plain Redis List?

A plain Redis `LPUSH`/`RPOP` list could technically work as a queue, but BullMQ gives:

- **Job state management** — jobs move through `waiting → active → completed/failed` states automatically
- **Concurrency control** — you can set how many jobs a worker processes simultaneously
- **Built-in retry logic** — failed jobs can be automatically retried (planned)
- **Job visibility** — you can inspect queued, active, and failed jobs easily

BullMQ is built on top of Redis — so we get Redis's speed with a proper job queue abstraction on top.

---

### 2. Why split into one job per recipient instead of one job per campaign?

The alternative would be to push the entire campaign as a single job and loop through all recipients inside the worker. The problem with that approach:

- If the worker crashes halfway through, the entire campaign has to restart from zero
- You can't track per-recipient delivery status
- Only one worker handles the entire campaign — no parallelism

By splitting into one job per recipient:
- Each email is an independent atomic unit of work
- Multiple workers can process different recipients simultaneously
- If one email fails, only that job fails — the rest continue
- Redis counters give real-time per-campaign visibility

---

### 3. Why Redis for status counters instead of MongoDB?

Campaign progress is updated after **every single email send** — potentially hundreds of writes per second during a large campaign. MongoDB is a great persistent store but is slower for this kind of high-frequency atomic increment operation.

Redis `INCR` and `DECR` operations are:
- **Atomic** — no race conditions when multiple workers update the same counter simultaneously
- **In-memory** — microsecond latency, perfect for high-frequency writes
- **Simple** — a counter is the right data structure for this, not a document

MongoDB stores the campaign metadata (recipients list, subject, body, timestamps). Redis handles the live counters. Both are used for what they're best at.

---

### 4. Why a separate worker process instead of running inside the API?

Running workers inside `app.js` would mean:
- Restarting the API also kills all in-flight email jobs
- CPU-intensive email processing competes with API request handling
- You can't scale workers independently of the API

A separate `worker.js` process means:
- API and workers can be restarted independently
- Workers can be scaled horizontally (`node worker.js` in multiple terminals or containers) without touching the API
- Clear separation of concerns — the API handles HTTP, the worker handles delivery

---

## ⚖️ Trade-offs & Current Limitations

| Limitation | Impact | Planned Fix |
|---|---|---|
| No retry logic | A failed email is permanently lost | Dead Letter Queue + exponential backoff |
| No authentication | Anyone can submit a campaign | JWT middleware on API routes |
| No rate limiting | API can be flooded with requests | Sliding window rate limiter using Redis |
| No Docker setup | Setup requires manual Redis/MongoDB config | docker-compose with all services |
| Redis counters are volatile | If Redis restarts, progress counters reset | Persist final counts to MongoDB on completion |
| No email validation | Invalid emails cause worker errors silently | Validate emails before enqueuing |

---

## 🚧 Planned Improvements

### Dead Letter Queue (DLQ) + Retry with Exponential Backoff
When an email fails to send, instead of dropping it, it should be retried with increasing wait times:
- Attempt 1 fails → retry after 2s
- Attempt 2 fails → retry after 4s
- Attempt 3 fails → retry after 8s
- After 3 failures → move to Dead Letter Queue for manual inspection

This ensures transient failures (SMTP timeout, network blip) don't result in undelivered emails.

### JWT Authentication
Currently the `POST /task` endpoint is open to anyone. Adding JWT middleware ensures only authenticated users can submit campaigns, protecting against abuse.

### Rate Limiting
Using Redis to implement a sliding window rate limiter — e.g. max 10 campaigns per user per hour. Prevents a single user from flooding the queue.

### Docker + docker-compose
A `docker-compose.yml` that spins up the API, worker, Redis, and MongoDB with a single `docker-compose up` command — making the system truly portable and cloud-ready.

### Prometheus + Grafana Metrics
Expose a `/metrics` endpoint tracking:
- `queue_depth` — how many jobs are waiting
- `emails_sent_total` — cumulative counter
- `emails_failed_total` — cumulative counter
- `worker_processing_duration` — how long each email takes

Visualised on a Grafana dashboard for real-time system observability.

---

## 📚 Concepts This Project Demonstrates

| Concept | Where it appears |
|---|---|
| Producer-Consumer pattern | API enqueues, worker consumes |
| Async task processing | Jobs processed independently of HTTP request lifecycle |
| Horizontal scaling | Multiple workers, same queue |
| Atomic operations | Redis INCR/DECR for concurrent counter updates |
| Separation of concerns | API, queue, worker, database all decoupled |
| Fault isolation | One failed job doesn't affect others |

---

## 👨‍💻 Author

**Aditya Narayan**
[LinkedIn](https://linkedin.com/in/aditya-narayan-a68236326) · [GitHub](https://github.com/AdityaNarayan632)
