# 📬 Bulk Email Campaign Dispatcher

A scalable backend system for dispatching bulk email campaigns asynchronously. Users submit a campaign via a REST API — the system splits each recipient into an individual job, queues them through **BullMQ + Redis**, and **worker services** process and deliver emails in parallel via **Nodemailer** — without ever blocking the API.

---

## 🏗️ Architecture

```
Client
  │
  │  POST /task  { recipients: [...], subject, body }
  ▼
Express.js API
  │  splits into individual jobs
  │  pushes each into BullMQ queue
  │  returns { campaign_id, status: "queued" }
  │
  ▼
BullMQ Queue (Redis)
  │
  ├──▶ Worker → sends email → updates sent/pending count
  ├──▶ Worker → sends email → updates sent/pending count
  └──▶ Worker → sends email → updates failed/pending count

Client polls GET /campaign/:id
  ◀── { sent: 340, failed: 12, pending: 148 }
```

---

## ✨ Features

- **Async email dispatch** — API returns instantly, emails are sent in the background
- **BullMQ + Redis queue** — each recipient is an independent job processed in parallel
- **Real-time campaign tracking** — track sent, failed, and pending counts per campaign
- **Nodemailer integration** — sends emails via Gmail SMTP
- **MongoDB integration** — stores campaign and task metadata
- **Horizontal scaling** — spin up multiple workers against the same queue with zero code changes

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| API Server | Node.js, Express.js |
| Queue | BullMQ, Redis (ioredis) |
| Email Delivery | Nodemailer (Gmail SMTP) |
| Database | MongoDB, Mongoose |
| Dev Tools | Nodemon, dotenv |

---

## 📁 Project Structure

```
Bulk-Email-Dispatcher/
├── config/
│   └── db.js              # MongoDB connection
├── controllers/
│   └── taskController.js  # Campaign submission logic
├── models/
│   └── task.js            # Mongoose task/campaign schema
├── queue/
│   └── taskQueue.js       # BullMQ queue setup
├── routes/
│   └── taskRoutes.js      # API route definitions
├── app.js                 # Express server entry point
├── worker.js              # BullMQ worker — email dispatch
├── .gitignore
└── package.json
```

---

## ⚙️ Getting Started

### Prerequisites

- Node.js v18+
- Redis instance (local or cloud — e.g. Upstash)
- MongoDB instance (local or Atlas)
- Gmail account with App Password enabled

### 1. Clone the repo

```bash
git clone https://github.com/AdityaNarayan632/Bulk-Email-Dispatcher.git
cd Bulk-Email-Dispatcher
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the root:

```env
# Redis
REDIS_HOST=your_redis_host
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# MongoDB
MONGO_URI=your_mongodb_connection_string

# Email (Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
```

> ⚠️ For Gmail, use an **App Password** not your account password. Enable it at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

### 4. Start the API server

```bash
npm run dev
```

### 5. Start the worker (in a separate terminal)

```bash
node worker.js
```

---

## 📮 API Reference

### Submit a Campaign

```http
POST /task
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

### Check Campaign Status

```http
GET /campaign/:id
```

**Response:**

```json
{
  "campaign_id": "abc123",
  "sent": 1,
  "failed": 0,
  "pending": 1
}
```

---

## 🔄 How It Works

1. Client sends a `POST /task` with a list of recipients
2. API creates a campaign record in MongoDB and pushes one BullMQ job per recipient into Redis
3. Worker picks up jobs from the queue and sends emails via Nodemailer
4. After each send, worker increments `sent` or `failed` and decrements `pending` counters in Redis
5. Client polls `GET /campaign/:id` to track progress in real time

---

## 🚧 Roadmap

- [ ] Dead Letter Queue (DLQ) for permanently failed jobs
- [ ] Retry with exponential backoff
- [ ] JWT authentication on API routes
- [ ] Rate limiting per user
- [ ] Docker + docker-compose setup
- [ ] Prometheus + Grafana metrics dashboard

---

## 👨‍💻 Author

**Aditya Narayan**
[LinkedIn](https://linkedin.com/in/aditya-narayan-a68236326) · [GitHub](https://github.com/AdityaNarayan632)
