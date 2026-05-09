const mongoose = require("mongoose");

const CampaignSchema = new mongoose.Schema(
  {
    recipients: [String],
    subject: String,
    body: String,
    total: Number,
    status: { type: String, default: "queued" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Campaign", CampaignSchema);
