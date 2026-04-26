require("dotenv").config();
const { Queue } = require("bullmq");

const taskQueue = new Queue("taskQueue", {
  connection: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    tls: {},
  },
});

module.exports = taskQueue;
