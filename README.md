# 📬 Bulk Email Campaign Dispatcher

A production-grade bulk email dispatch system built with Node.js, BullMQ, and Redis. Users submit email campaigns via a secured REST API — the system splits each recipient into an individual job, queues them through a Redis-backed BullMQ queue, and parallel worker services deliver emails asynchronously via Nodemailer. Real-time delivery tracking, fault-tolerant retry logic, JWT authentication, and rate limiting included.

---

## 🏗️ Architecture

```
Client
  │
  │  POST /task  { recipients: [...], subject, body }
  │  Authorization: Bearer <jwt_token>
  ▼
Express.js API
  │  validates JWT token
  │  checks rate limit (10 req/min per user)
  │  splits into individual jobs
  │  pushes each into BullMQ queue
  │  returns { campaign_id, status: "queued" }
  │
  ▼
BullMQ Queue (Redis)
  │
  ├──▶ Worker → sends email → updates sent/pending count
  ├──▶ Worker → sends email → updates sent/pending count
  └──▶ Worker → fails → retries (2s → 4s → 8s) → DLQ

Client polls GET /campaign/:id
  ◀── { sent: 340, failed: 12, pending: 148 }
```

---

## ✨ Features

- **Async bulk email dispatch** — API responds instantly, emails sent in background
- **BullMQ + Redis queue** — each recipient is an independent parallel job
- **Real-time campaign tracking** — live sent, failed, and pending counts per campaign
- **Fault-tolerant retry** — failed jobs retry 3 times with exponential backoff (2s → 4s → 8s)
- **Dead Letter Queue (DLQ)** — permanently failed jobs stored for inspection and manual requeue
- **JWT Authentication** — secure token-based auth on all campaign endpoints
- **Rate limiting** — Redis-based per-user rate limit (10 requests/minute)
- **MongoDB persistence** — campaign metadata stored permanently
- **Dockerized** — one command spins up the entire system
- **Horizontal scaling** — multiple workers consume the same queue with zero code changes

---

## 🛠️ Tech Stack

| Layer            | Technology                   |
| ---------------- | ---------------------------- |
| API Server       | Node.js, Express.js          |
| Queue            | BullMQ, Redis (ioredis)      |
| Email Delivery   | Nodemailer (Gmail SMTP)      |
| Database         | MongoDB, Mongoose            |
| Auth             | JWT (jsonwebtoken), bcryptjs |
| Rate Limiting    | Redis sliding window         |
| Containerization | Docker, docker-compose       |

---

## 📁 Project Structure

```
Bulk-Email-Dispatcher/
├── config/
│   ├── db.js               # MongoDB connection
│   └── redis.js            # Redis connection
├── controllers/
│   ├── authController.js   # Register + login logic
│   └── taskController.js   # Campaign + DLQ logic
├── middleware/
│   ├── auth.js             # JWT verification
│   └── rateLimit.js        # Redis rate limiter
├── models/
│   ├── campaign.js         # Campaign schema
│   └── user.js             # User schema
├── queue/
│   └── taskQueue.js        # BullMQ queue setup
├── routes/
│   ├── authRoutes.js       # Auth endpoints
│   ├── campaignRoutes.js   # Campaign + DLQ endpoints
│   └── taskRoutes.js       # Task submission endpoint
├── app.js                  # Express server
├── worker.js               # BullMQ worker
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
└── SYSTEM_DESIGN.md
```

---

## ⚙️ Getting Started

### Prerequisites

- Docker Desktop installed and running
- Gmail account with App Password enabled

### 1. Clone the repo

```bash
git clone https://github.com/AdityaNarayan632/Bulk-Email-Dispatcher.git
cd Bulk-Email-Dispatcher
```

### 2. Set up environment variables

Create a `.env` file in the root:

```env
# MongoDB
MONGO_URI=your_mongodb_connection_string

# Redis
REDIS_HOST=your_redis_host
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS=true

# Email (Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# JWT
JWT_SECRET=your_jwt_secret_key
```

> ⚠️ For Gmail, use an **App Password** not your account password. Enable it at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

> ⚠️ Generate a JWT secret by running: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 3. Start the entire system

```bash
docker-compose up --build
```

This starts Redis, MongoDB, the API server, and the worker — all in one command.

---

## 📮 API Reference

### Auth

#### Register

```http
POST /auth/register
Content-Type: application/json
```

```json
{
  "email": "user@gmail.com",
  "password": "yourpassword"
}
```

#### Login

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "email": "user@gmail.com",
  "password": "yourpassword"
}
```

**Response:**

```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

---

### Campaigns

#### Submit a Campaign

```http
POST /task
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "recipients": ["user1@gmail.com", "user2@gmail.com"],
  "subject": "Hello from Bulk Dispatcher!",
  "body": "This is a test campaign email."
}
```

**Response:**

```json
{
  "campaign_id": "abc123",
  "status": "queued",
  "total": 2
}
```

#### Check Campaign Status

```http
GET /campaign/:id
```

**Response:**

```json
{
  "campaign_id": "abc123",
  "status": "processing",
  "total": 2,
  "sent": 1,
  "failed": 0,
  "pending": 1
}
```

#### View Failed Jobs (DLQ)

```http
GET /campaign/dlq/failed
```

#### Requeue a Failed Job

```http
POST /campaign/dlq/retry/:jobId
```

---

## 🔄 How It Works

1. Client registers and logs in to receive a JWT token
2. Client sends `POST /task` with token — API validates JWT and checks rate limit
3. API creates a campaign in MongoDB, initializes Redis counters, and fans out one BullMQ job per recipient
4. Workers pick up jobs in parallel, send emails via Nodemailer, and update Redis counters
5. Failed jobs are automatically retried up to 3 times with exponential backoff
6. After 3 failures, jobs move to the Dead Letter Queue for manual inspection
7. Client polls `GET /campaign/:id` for real-time delivery progress

---

## 🐳 Docker Commands

```bash
# Start everything
docker-compose up --build

# Run in background
docker-compose up -d

# Stop everything
docker-compose down

# Scale to 3 workers
docker-compose up --scale worker=3

# View logs
docker logs api
docker logs worker
```

---

## 👨‍💻 Author

**Aditya Narayan**
[LinkedIn](https://linkedin.com/in/aditya-narayan-a68236326) · [GitHub](https://github.com/AdityaNarayan632)
