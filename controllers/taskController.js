const mongoose = require("mongoose");
const taskQueue = require("../queue/taskQueue");
const redis = require("../config/redis");
const Campaign = require("../models/campaign");

// POST /task
exports.createTask = async (req, res) => {
  try {
    const { recipients, subject, body } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res
        .status(400)
        .json({ error: "recipients must be a non-empty array" });
    }
    if (!subject || !body) {
      return res.status(400).json({ error: "subject and body are required" });
    }

    const campaignId = new mongoose.Types.ObjectId().toString();
    const total = recipients.length;

    await Campaign.create({
      _id: campaignId,
      recipients,
      subject,
      body,
      total,
    });

    await redis.set(`campaign:${campaignId}:total`, total);
    await redis.set(`campaign:${campaignId}:sent`, 0);
    await redis.set(`campaign:${campaignId}:failed`, 0);
    await redis.set(`campaign:${campaignId}:pending`, total);

    for (let email of recipients) {
      await taskQueue.add(
        "email",
        { campaignId, to: email, subject, body },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: false,
          removeOnFail: false,
        },
      );
    }

    res.status(201).json({ campaign_id: campaignId, status: "queued", total });
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

// GET /campaign/dlq/failed
exports.getFailedJobs = async (req, res) => {
  try {
    const failedJobs = await taskQueue.getFailed();
    const jobs = failedJobs.map((job) => ({
      job_id: job.id,
      campaign_id: job.data.campaignId,
      to: job.data.to,
      subject: job.data.subject,
      failed_reason: job.failedReason,
      attempts_made: job.attemptsMade,
      failed_at: job.finishedOn,
    }));
    res.json({ total: jobs.length, failed_jobs: jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /campaign/dlq/retry/:jobId
exports.retryFailedJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await taskQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    await job.retry();
    res.json({ message: `Job ${jobId} requeued successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
