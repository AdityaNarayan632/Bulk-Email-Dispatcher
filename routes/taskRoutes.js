const express = require("express");
const router = express.Router();
const { createTask } = require("../controllers/taskController");
const auth = require("../middleware/auth");
const rateLimit = require("../middleware/rateLimit");

router.post("/", auth, rateLimit, createTask);

module.exports = router;
