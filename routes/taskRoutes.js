const express = require("express");
const router = express.Router();
const { createTask } = require("../controllers/taskController");
const auth = require("../middleware/auth");

router.post("/", auth, createTask);

module.exports = router;
