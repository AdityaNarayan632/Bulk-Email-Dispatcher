const express = require("express");
const router = express.Router();
const {
  getCampaignStatus,
  getFailedJobs,
  retryFailedJob,
} = require("../controllers/taskController");

router.get("/:id", getCampaignStatus);
router.get("/dlq/failed", getFailedJobs);
router.post("/dlq/retry/:jobId", retryFailedJob);

module.exports = router;
