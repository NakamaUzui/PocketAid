const path = require("path");
const express = require("express");
const { chat, isConfigured, getStatus } = require("../agent/pocketaid-agent");
const bankingRoutes = require("../routes/banking");
const authRoutes = require("../routes/auth");
const { sessionAuth } = require("../middleware/session-auth");
const { isSupabaseConfigured } = require("../services/db/client");

function createApp() {
  const app = express();
  const root = path.join(__dirname, "..");

  app.use(express.json({ limit: "512kb" }));
  app.use("/api/auth", authRoutes);

  app.get("/api/health", (_req, res) => {
    const status = getStatus();
    const onNetlify = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const onVercel = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
    res.json({
      ok: true,
      ...status,
      host: onVercel ? "vercel" : onNetlify ? "netlify" : "node",
      storage: isSupabaseConfigured() ? "supabase" : "legacy",
    });
  });

  app.use(sessionAuth);
  app.use("/api/banking", bankingRoutes);

  app.post("/api/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages-Array fehlt oder ist leer." });
      }
      const reply = await chat(messages, req);
      res.json({ reply, ...getStatus() });
    } catch (err) {
      console.error("[/api/chat]", err.message);
      const status =
        err.message.includes("fehlt") || err.message.includes("konfiguriert") ? 503 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  app.use(express.static(root));
  return app;
}

module.exports = { createApp };
