import "dotenv/config";

import cors from "cors";
import express from "express";

import settingsRouter from "./routes/settings";
import commitsRouter from "./routes/commits";

const app = express();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  }),
);
app.use(express.json());

// Routes
app.use("/api/settings", settingsRouter);
app.use("/api/commits", commitsRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(3000, () => {
  console.log("✓ Server running on http://localhost:3000");
});
