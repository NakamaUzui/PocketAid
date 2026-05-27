const express = require("express");
const crypto = require("crypto");
const {
  isConfiguredAsync,
  isKeyValidAsync,
  getEnvironment,
  getConfigDiagnosticsAsync,
  ebFetch,
} = require("../services/enable-banking/client");
const { normalizeAll } = require("../services/enable-banking/mapper");
const { sortTransactionsNewestFirst } = require("../services/transactions-sort");
const { fetchAllSessionTransactions } = require("../services/enable-banking/fetch-transactions");
const {
  getTransactions,
  countTransactions,
  saveTransactions,
  getLastSyncedAt,
} = require("../services/transactions-store");
const {
  resolveBankSession,
  persistBankSession,
  clearBankSessionEverywhere,
  toClientPayload,
} = require("../services/bank-session");

const router = express.Router();

function encodeOAuthState(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeOAuthState(state) {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function getBankCountry() {
  return (process.env.ENABLE_BANKING_COUNTRY || "AT").toUpperCase();
}

function getRedirectUrl() {
  if (process.env.ENABLE_BANKING_REDIRECT_URL) {
    return process.env.ENABLE_BANKING_REDIRECT_URL;
  }
  if (process.env.APP_BASE_URL) {
    return `${process.env.APP_BASE_URL.replace(/\/$/, "")}/api/banking/callback`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}/api/banking/callback`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}/api/banking/callback`;
  }
  if (process.env.URL) {
    return `${process.env.URL.replace(/\/$/, "")}/api/banking/callback`;
  }
  return `http://localhost:${process.env.PORT || 3000}/api/banking/callback`;
}

router.get("/status", async (req, res) => {
  const session = await resolveBankSession(req);
  const config = await getConfigDiagnosticsAsync();
  res.json({
    configured: await isConfiguredAsync(),
    configHint: config.hint,
    config,
    keyValid: await isKeyValidAsync(),
    connected: Boolean(session?.sessionId && session?.accounts?.length),
    bank: session?.aspsp || null,
    accounts: session?.accounts?.length || 0,
    sessionPayload: toClientPayload(session),
    lastSync: await getLastSyncedAt(req.user?.id),
    country: getBankCountry(),
    environment: getEnvironment(),
    syncEngine: "v5-date-chunks",
  });
});

router.get("/banks", async (req, res) => {
  try {
    if (!(await isConfiguredAsync())) {
      return res.status(503).json({ error: "Enable Banking nicht konfiguriert (siehe README)." });
    }
    const country = (req.query.country || getBankCountry()).toUpperCase();
    const data = await ebFetch(`/aspsps?country=${country}`);
    const banks = (data.aspsps || [])
      .map((b) => ({ name: b.name, country: b.country, logo: b.logo }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    res.json({ banks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/connect", async (req, res) => {
  try {
    if (!(await isConfiguredAsync())) {
      return res.status(503).json({ error: "Enable Banking nicht konfiguriert." });
    }

    const { bankName, country = getBankCountry() } = req.body;
    if (!bankName) {
      return res.status(400).json({ error: "bankName fehlt." });
    }

    const state = encodeOAuthState({
      uid: req.user.id,
      bankName,
      country,
      n: crypto.randomUUID(),
    });

    const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const auth = await ebFetch("/auth", {
      method: "POST",
      body: JSON.stringify({
        access: {
          valid_until: validUntil,
          balances: true,
          transactions: true,
        },
        aspsp: { name: bankName, country },
        state,
        redirect_url: getRedirectUrl(),
        psu_type: "personal",
        language: "de",
      }),
    });

    res.json({ url: auth.url, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/callback", async (req, res) => {
  try {
    const { code, state, error, error_description: errorDesc } = req.query;

    if (error) {
      return res.redirect(`/?bank=error&message=${encodeURIComponent(errorDesc || error)}`);
    }

    if (!code) {
      return res.redirect("/?bank=error&message=Kein+Autorisierungscode");
    }

    const pending = decodeOAuthState(state) || {};

    const session = await ebFetch("/sessions", {
      method: "POST",
      body: JSON.stringify({ code }),
    });

    const bankSession = {
      sessionId: session.session_id,
      accounts: session.accounts || [],
      aspsp: session.aspsp || {
        name: pending.bankName,
        country: pending.country || getBankCountry(),
      },
      connectedAt: new Date().toISOString(),
    };

    await persistBankSession(res, bankSession, pending.uid);

    res.redirect("/?bank=connected");
  } catch (err) {
    console.error("[banking/callback]", err.message);
    res.redirect(`/?bank=error&message=${encodeURIComponent(err.message)}`);
  }
});

router.post("/sync", async (req, res) => {
  try {
    if (!(await isConfiguredAsync())) {
      return res.status(503).json({ error: "Enable Banking nicht konfiguriert." });
    }

    const session = await resolveBankSession(req);
    if (!session?.accounts?.length) {
      return res.status(400).json({ error: "Keine Bank verbunden. Zuerst Bank verbinden." });
    }

    const fetched = await fetchAllSessionTransactions(session);
    const normalized = sortTransactionsNewestFirst(normalizeAll(fetched.transactions));

    await saveTransactions(normalized, req.user.id);
    const dbCount = await countTransactions(req.user.id);
    const stored = await getTransactions(req.user.id);

    console.info(
      `[banking/sync] user=${req.user.id} raw=${fetched.transactions.length} normalized=${normalized.length} dbCount=${dbCount} loaded=${stored.length} pages=${fetched.pages} accounts=${fetched.accounts} mode=${fetched.strategyMode}`
    );

    res.json({
      ok: true,
      count: dbCount,
      loaded: stored.length,
      fetched: normalized.length,
      raw: fetched.transactions.length,
      pages: fetched.pages,
      accounts: fetched.accounts,
      accountStats: fetched.accountStats,
      syncEngine: "v5-date-chunks",
    });
  } catch (err) {
    console.error("[banking/sync]", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/disconnect", async (req, res) => {
  await clearBankSessionEverywhere(res, req.user.id);
  res.json({ ok: true });
});

router.get("/transactions", async (req, res) => {
  const transactions = await getTransactions(req.user.id);
  res.json({ transactions });
});

module.exports = router;
