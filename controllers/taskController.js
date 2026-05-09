const mongoose = require("mongoose");
const taskQueue = require("../queue/taskQueue");
const redis = require("../config/redis");
const Campaign = require("../models/campaign");

// POST /task
exports.createTask = async (req, res) => {
  try {
    const { recipients, subject, body } = req.body;

    // Input validation
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res
        .status(400)
        .json({ error: "recipients must be a non-empty array" });
    }
    if (!subject || !body) {
      return res.status(400).json({ error: "subject and body are required" });
    }

    // 1. Generate campaign ID
    const campaignId = new mongoose.Types.ObjectId().toString();
    const total = recipients.length;

    // 2. Save campaign to MongoDB
    await Campaign.create({
      _id: campaignId,
      recipients,
      subject,
      body,
      total,
    });

    // 3. Initialize Redis counters
    await redis.set(`campaign:${campaignId}:total`, total);
    await redis.set(`campaign:${campaignId}:sent`, 0);
    await redis.set(`campaign:${campaignId}:failed`, 0);
    await redis.set(`campaign:${campaignId}:pending`, total);

    // 4. Push one job per recipient into the queue (fan-out)
    for (let email of recipients) {
      await taskQueue.add("email", {
        campaignId,
        to: email,
        subject,
        body,
      });
    }

    // 5. Respond immediately — don't wait for emails to send
    res.status(201).json({
      campaign_id: campaignId,
      status: "queued",
      total,
    });
  } catch (err) {
    console.error("createTask error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /campaign/:id
exports.getCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const total = await redis.get(`campaign:${id}:total`);
    const sent = await redis.get(`campaign:${id}:sent`);
    const failed = await redis.get(`campaign:${id}:failed`);
    const pending = await redis.get(`campaign:${id}:pending`);

    // If not in Redis, try MongoDB as fallback
    if (total === null) {
      const campaign = await Campaign.findById(id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      return res.json({
        campaign_id: id,
        status: campaign.status,
        total: campaign.total,
        sent: 0,
        failed: 0,
        pending: campaign.total,
        note: "Live counters expired, showing stored data",
      });
    }

    const parsedPending = parseInt(pending);
    const status = parsedPending === 0 ? "completed" : "processing";

    // If completed, update MongoDB status too
    if (status === "completed") {
      await Campaign.findByIdAndUpdate(id, { status: "completed" });
    }

    res.json({
      campaign_id: id,
      status,
      total: parseInt(total),
      sent: parseInt(sent),
      failed: parseInt(failed),
      pending: parsedPending,
    });
  } catch (err) {
    console.error("getCampaignStatus error:", err);
    res.status(500).json({ error: err.message });
  }
};
