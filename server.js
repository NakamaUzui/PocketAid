require("dotenv").config();
const { createApp } = require("./server/createApp");
const { isConfigured, getStatus } = require("./agent/pocketaid-agent");
const {
  isConfigured: isBankingConfigured,
  getEnvironment: getBankingEnv,
} = require("./services/enable-banking/client");

const app = createApp();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  const status = getStatus();
  console.log(`PocketAid läuft auf http://localhost:${PORT}`);

  if (!status.aiConfigured) {
    console.warn("⚠ KI nicht konfiguriert – kopiere .env.example nach .env");
  } else {
    console.log(`✓ KI-Agent bereit (${status.provider} / ${status.model})`);
  }

  if (isBankingConfigured()) {
    console.log(`✓ Enable Banking (${getBankingEnv()}) – Bank-Verbindung möglich`);
  }

  if (process.env.SITE_PASSWORD?.trim()) {
    console.log("🔒 Seiten-Passwort aktiv");
  }
});
