# 🧠 System Design — Bulk Email Campaign Dispatcher

This document explains the problem this system solves, the architectural decisions made, the trade-offs considered, and how each feature was implemented. It exists to make the reasoning behind every decision transparent.

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
- No visibility into delivery progress

**The core problem:** How do you accept a campaign of 500+ recipients via an API, respond instantly, deliver all emails reliably in the background, handle failures gracefully, and prevent abuse — without overloading the server?

---

## 💡 The Approach

The solution is to **decouple ingestion from delivery** using an async queue-based architecture with multiple layers of resilience.

1. The API accepts the campaign, validates the user, checks rate limits, splits into individual jobs, and pushes each into a **Redis-backed BullMQ queue**
2. The API immediately responds with a `campaign_id` — the client is never made to wait
3. **Worker services** running as a separate process consume jobs independently and deliver emails via Nodemailer
4. Failed jobs are **automatically retried** with exponential backoff before being moved to a Dead Letter Queue
5. The client polls a status endpoint for real-time delivery progress

This pattern is called the **Producer-Consumer model** and is the foundation of how every large-scale notification system works in production.

---

## 🏗️ Architecture

```
Client
  │
  │  POST /task + JWT token
  ▼
┌─────────────────────────┐
│     Express.js API      │  ← Producer
│                         │
│  1. Verify JWT token    │
│  2. Check rate limit    │
│  3. Save to MongoDB     │
│  4. Init Redis counters │
│  5. Fan-out to queue    │
│  6. Return campaign_id  │
└──────────┬──────────────┘
           │ enqueue jobs
           ▼
┌─────────────────────────┐
│    BullMQ Queue         │  ← Buffer
│    (Redis)              │
│                         │
│  [ job ] [ job ] [ job ]│
│  attempts: 3            │
│  backoff: exponential   │
└──────────┬──────────────┘
           │ consume jobs
           ▼
┌─────────────────────────┐
│    Worker Service       │  ← Consumer
│                         │
│  For each job:          │
│  → Send via Nodemailer  │
│  → Success: incr sent   │
│  → Fail: retry (3x)    │
│  → All retries fail:    │
│    → Dead Letter Queue  │
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│    Redis Counters       │
│                         │
│  campaign:id:total      │
│  campaign:id:sent       │
│  campaign:id:failed     │
│  campaign:id:pending    │
└─────────────────────────┘
           ▲
           │ reads counters
┌──────────┴──────────────┐
│  GET /campaign/:id      │
│  Status Endpoint        │
└─────────────────────────┘
```

---

## 🔧 Key Technical Decisions

### 1. Why BullMQ over a plain Redis List?

A plain Redis `LPUSH`/`RPOP` list could technically work as a queue, but BullMQ gives:

- **Job state management** — jobs move through `waiting → active → completed/failed` automatically
- **Built-in retry with backoff** — configurable attempts and delay strategies out of the box
- **Dead Letter Queue** — failed jobs accessible via `getFailed()` for inspection and requeue
- **Concurrency control** — control how many jobs a worker processes simultaneously
- **Job visibility** — inspect queued, active, and failed jobs at any time

BullMQ is built on top of Redis — so we get Redis's speed with a proper job queue abstraction on top.

---

### 2. Why split into one job per recipient instead of one job per campaign?

The alternative would be to push the entire campaign as a single job and loop through recipients inside the worker. The problem:

- If the worker crashes halfway, the entire campaign restarts from zero
- No per-recipient delivery tracking
- Only one worker handles the entire campaign — no parallelism
- A single bad recipient fails the entire campaign

By splitting into one job per recipient:

- Each email is an independent atomic unit of work
- Multiple workers process different recipients simultaneously
- If one email fails, only that job retries — the rest continue
- Redis counters give real-time per-campaign visibility

---

### 3. Why Redis for status counters instead of MongoDB?

Campaign progress is updated after **every single email send** — potentially hundreds of writes per second. MongoDB is great for persistence but slower for high-frequency atomic operations.

Redis `INCR` and `DECR` are:

- **Atomic** — no race conditions when multiple workers update simultaneously
- **In-memory** — microsecond latency, perfect for high-frequency writes
- **Simple** — a counter is the right data structure, not a document

MongoDB stores campaign metadata permanently. Redis handles live counters. Both are used for what they're best at. When Redis counters expire, the status endpoint falls back to MongoDB.

---

### 4. Why a separate worker process?

Running workers inside `app.js` would mean:

- Restarting the API kills all in-flight email jobs
- CPU-intensive email processing competes with API request handling
- Workers can't scale independently of the API

A separate `worker.js` process means:

- API and workers restart independently
- Workers scale horizontally (`docker-compose up --scale worker=3`) without touching the API
- Clear separation of concerns

---

### 5. Why JWT over API Keys?

API Keys are simpler but JWT provides:

- **Stateless authentication** — no DB lookup per request, token is self-contained
- **Expiry built-in** — tokens expire automatically (7 days)
- **User identity in token** — `req.user.id` available in middleware without a DB call
- **Standard** — industry standard for REST API auth

---

### 6. Why Redis for rate limiting?

Rate limiting needs to be:

- **Fast** — checked on every request before any business logic
- **Shared across workers** — if you scale the API to multiple instances, rate limits must be shared
- **Atomic** — `INCR` + `EXPIRE` in Redis gives a thread-safe sliding window counter

Using Redis means rate limits work correctly even when the API is scaled horizontally.

---

## ⚖️ Trade-offs & Decisions

| Decision                       | Trade-off                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------- |
| One job per recipient          | More jobs in queue, but better fault isolation and parallelism               |
| Redis counters for status      | Fast writes but volatile — mitigated by MongoDB fallback                     |
| Exponential backoff (2s→4s→8s) | Delays retry but prevents hammering a failing SMTP server                    |
| JWT with 7-day expiry          | Convenient but tokens can't be invalidated before expiry without a blocklist |
| Fail-open rate limiter         | If Redis is down, requests pass through — availability over strict limiting  |

---

## 🔐 Security Decisions

- Passwords hashed with **bcrypt** (10 salt rounds) before storing in MongoDB
- JWT signed with a secret key stored in environment variables — never hardcoded
- `.env` excluded from Docker image via `.dockerignore`
- Rate limiting prevents queue flooding from a single user
- Input validation on all endpoints before any DB or queue operations

---

## 📊 Concepts This Project Demonstrates

| Concept                   | Where it appears                                |
| ------------------------- | ----------------------------------------------- |
| Producer-Consumer pattern | API enqueues, worker consumes                   |
| Async task processing     | Jobs processed independently of HTTP lifecycle  |
| Horizontal scaling        | Multiple workers, same queue                    |
| Atomic operations         | Redis INCR/DECR for concurrent counter updates  |
| Fault tolerance           | Retry with backoff + Dead Letter Queue          |
| Separation of concerns    | API, queue, worker, database all decoupled      |
| Stateless authentication  | JWT middleware                                  |
| Abuse prevention          | Redis rate limiting per user                    |
| Containerization          | Docker + docker-compose for portable deployment |

---

## 🚀 Potential Future Improvements

- **Prometheus + Grafana** — expose `/metrics` endpoint for queue depth, delivery rate, and worker performance dashboards
- **Webhook notifications** — notify a URL when a campaign completes instead of requiring polling
- **Email templates** — support HTML email bodies with variable substitution
- **Campaign scheduling** — submit a campaign to be sent at a future time
- **Unsubscribe handling** — track and respect unsubscribe requests per recipient

---

## 👨‍💻 Author

**Aditya Narayan**
[LinkedIn](https://linkedin.com/in/aditya-narayan-a68236326) · [GitHub](https://github.com/AdityaNarayan632)
