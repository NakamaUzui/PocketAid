/**
 * PEM nach Netlify Blobs hochladen (umgeht Lambda 4KB Env-Limit).
 * Voraussetzung: netlify login && netlify link
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getStore } = require("@netlify/blobs");
const { BLOB_STORE, BLOB_KEY, readPemFromFile } = require("../services/enable-banking/key-store");

function getNetlifyToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  const candidates = [
    path.join(process.env.APPDATA || "", "netlify", "Config", "config.json"),
    path.join(process.env.USERPROFILE || "", ".config", "netlify", "config.json"),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const user of Object.values(cfg.users || {})) {
        if (user?.auth?.token) return user.auth.token;
      }
    } catch (_) {}
  }
  return null;
}

function getSiteId() {
  if (process.env.NETLIFY_SITE_ID) return process.env.NETLIFY_SITE_ID;
  const stateFile = path.join(__dirname, "..", ".netlify", "state.json");
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    return state.siteId || state.site_id;
  }
  return null;
}

async function main() {
  const pem = readPemFromFile();
  if (!pem) {
    console.error("Keine PEM-Datei gefunden (keys/enable-banking-production.pem).");
    process.exit(1);
  }

  const siteId = getSiteId();
  const token = getNetlifyToken();
  if (!siteId || !token) {
    console.error("Netlify Site-ID oder Token fehlt. Bitte: netlify login && netlify link");
    process.exit(1);
  }

  const store = getStore({ name: BLOB_STORE, siteId, token });
  await store.set(BLOB_KEY, pem.trim());
  console.log(`✓ PEM hochgeladen → Blobs "${BLOB_STORE}" / "${BLOB_KEY}" (Site ${siteId})`);
  console.log("\nNächste Schritte:");
  console.log("  netlify env:unset ENABLE_BANKING_PRIVATE_KEY");
  console.log("  netlify deploy --prod");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
