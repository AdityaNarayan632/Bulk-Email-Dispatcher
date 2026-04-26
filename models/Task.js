const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema(
  {
    name: String,
    status: {
      type: String,
      default: "pending",
    },
    result: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Task", TaskSchema);
