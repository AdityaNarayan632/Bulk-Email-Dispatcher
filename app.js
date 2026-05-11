require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");

const app = express();

connectDB();

app.use(express.json());

app.use("/auth", require("./routes/authRoutes"));
app.use("/task", require("./routes/taskRoutes"));
app.use("/campaign", require("./routes/campaignRoutes"));

app.get("/", (req, res) => {
  res.json({ message: "Bulk Email Dispatcher API running 🚀" });
});

app.listen(3000, () => {
  console.log("Server running on port 3000 🚀");
});
