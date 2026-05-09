require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");

const app = express();

// Connect database
connectDB();

// Middleware
app.use(express.json());

// Routes
app.use("/task", require("./routes/taskRoutes"));
app.use("/campaign", require("./routes/campaignRoutes"));

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Bulk Email Dispatcher API running 🚀" });
});

// Start server
app.listen(3000, () => {
  console.log("Server running on port 3000 🚀");
});
