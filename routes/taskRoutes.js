const express = require("express");
const router = express.Router();

const {
  createTask,
  getCampaignStatus,
} = require("../controllers/taskController");

router.post("/", createTask);

// NEW ROUTE
router.get("/campaign/:id", getCampaignStatus);

module.exports = router;
