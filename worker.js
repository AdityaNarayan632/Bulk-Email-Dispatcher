require("dotenv").config();
const { Worker } = require("bullmq");
const Redis = require("ioredis");
const nodemailer = require("nodemailer");

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  tls: {},
});

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

console.log(" Worker started...");

// Worker
const worker = new Worker(
  "taskQueue",
  async (job) => {
    const { campaignId, to, subject, body } = job.data;

    console.log(`Sending email to: ${to}`);

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        text: body,
      });

      console.log(`Email sent to: ${to}`);

      await redis.incr(`campaign:${campaignId}:sent`);
      await redis.decr(`campaign:${campaignId}:pending`);
    } catch (err) {
      console.log(`Failed to send email to: ${to}`);
      console.log("ERROR:", err);

      await redis.incr(`campaign:${campaignId}:failed`);
      await redis.decr(`campaign:${campaignId}:pending`);
    }
  },
  {
    connection: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      tls: {},
    },
  },
);
