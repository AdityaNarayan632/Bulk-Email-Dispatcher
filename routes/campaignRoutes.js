const express = require("express");
const router = express.Router();
const { getCampaignStatus } = require("../controllers/taskController");

router.get("/:id", getCampaignStatus);

module.exports = router;
