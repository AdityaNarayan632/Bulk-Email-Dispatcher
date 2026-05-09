require("dotenv").config();
const { Queue } = require("bullmq");

const taskQueue = new Queue("taskQueue", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    ...(process.env.REDIS_TLS === "true" ? { tls: {} } : {}),
  },
});

module.exports = taskQueue;
