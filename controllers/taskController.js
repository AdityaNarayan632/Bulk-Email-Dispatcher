const mongoose = require("mongoose");
const taskQueue = require("../queue/taskQueue");
const redis = require("../config/redis");

exports.getCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const total = await redis.get(`campaign:${id}:total`);
    const sent = await redis.get(`campaign:${id}:sent`);
    const failed = await redis.get(`campaign:${id}:failed`);
    const pending = await redis.get(`campaign:${id}:pending`);

    if (!total) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    let status = "processing";

    if (parseInt(pending) === 0) {
      status = "completed";
    }

    res.json({
      campaign_id: id,
      status,
      total: parseInt(total),
      sent: parseInt(sent),
      failed: parseInt(failed),
      pending: parseInt(pending),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createTask = async (req, res) => {
  try {
    const { type, recipients, subject, body } = req.body;

    // 1. Generate campaign ID
    const campaignId = new mongoose.Types.ObjectId().toString();

    const total = recipients.length;

    // 2. Initialize Redis counters
    await redis.set(`campaign:${campaignId}:total`, total);
    await redis.set(`campaign:${campaignId}:sent`, 0);
    await redis.set(`campaign:${campaignId}:failed`, 0);
    await redis.set(`campaign:${campaignId}:pending`, total);

    // 3. Push jobs to queue (fan-out)
    for (let email of recipients) {
      await taskQueue.add("email", {
        campaignId,
        to: email,
        subject,
        body,
      });
    }

    // 4. Respond immediately
    res.json({
      campaign_id: campaignId,
      status: "queued",
      total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
