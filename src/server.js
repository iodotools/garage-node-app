const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
require("express-async-errors");
const authRouter = require("./routes/auth/auth.routes");
const { ZodError } = require("zod");

// Load environment variables
dotenv.config();

const app = express();
const prisma = require("./lib/prisma");
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// aUTH Routes
app.use("/api/auth", authRouter);

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.get("/", (req, res) => {
  res.json({ message: "Garage API is running." });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation error",
      details: err.errors,
    });
  }

  if (err instanceof Error) {
    return res.status(400).json({
      error: err.message,
    });
  }

  return res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
