require("dotenv").config();
const { Worker } = require("bullmq");
const nodemailer = require("nodemailer");
const redis = require("./config/redis");

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

console.log("Worker started... ⚙️");

const worker = new Worker(
  "taskQueue",
  async (job) => {
    const { campaignId, to, subject, body } = job.data;
    console.log(`Processing email to: ${to}`);

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        text: body,
      });

      console.log(`✅ Email sent to: ${to}`);
      const incrResult = await redis.incr(`campaign:${campaignId}:sent`);
      console.log(`sent counter is now: ${incrResult}`);
      await redis.decr(`campaign:${campaignId}:pending`);
    } catch (err) {
      console.error(`❌ Failed to send email to: ${to}`, err.message);
      await redis.incr(`campaign:${campaignId}:failed`);
      await redis.decr(`campaign:${campaignId}:pending`);
    }
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      ...(process.env.REDIS_TLS === "true" ? { tls: {} } : {}),
    },
  },
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});
