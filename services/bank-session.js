const { getBankSession, saveBankSession, clearBankSession } = require("./transactions-store");

const SESSION_COOKIE = "pocketaid_bank";
const MAX_AGE_SEC = 90 * 24 * 60 * 60;

function encodeSession(session) {
  return Buffer.from(JSON.stringify(session)).toString("base64url");
}

function decodeSession(encoded) {
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function sessionFromRequest(req) {
  if (!req) return null;

  const body = req.body?.bankSession;
  if (body && typeof body === "object" && body.sessionId) {
    return body;
  }

  const raw = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!raw) return null;
  try {
    return decodeSession(raw);
  } catch (e) {
    console.warn("[bank-session] Cookie ungültig:", e.message);
    return null;
  }
}

async function resolveBankSession(req) {
  const userId = req?.user?.id;
  const fromStore = await getBankSession(userId);
  if (fromStore?.sessionId && fromStore?.accounts?.length) {
    return fromStore;
  }
  const fromReq = sessionFromRequest(req);
  if (fromReq?.sessionId && fromReq?.accounts?.length) {
    return fromReq;
  }
  return fromStore?.sessionId ? fromStore : fromReq;
}

async function persistBankSession(res, session, userId) {
  await saveBankSession(session, userId);
  if (!res) return;
  try {
    const value = encodeSession(session);
    if (value.length > 3800) {
      console.warn("[bank-session] Session zu groß für Cookie – nur DB/Client");
      return;
    }
    const secure =
      process.env.URL?.startsWith("https") ||
      process.env.ENABLE_BANKING_REDIRECT_URL?.startsWith("https") ||
      process.env.APP_BASE_URL?.startsWith("https") ||
      Boolean(process.env.VERCEL_URL) ||
      Boolean(process.env.VERCEL);
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${
        secure ? "; Secure" : ""
      }`
    );
  } catch (e) {
    console.warn("[bank-session] Cookie setzen fehlgeschlagen:", e.message);
  }
}

async function clearBankSessionEverywhere(res, userId) {
  await clearBankSession(userId);
  if (res) {
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`
    );
  }
}

function toClientPayload(session) {
  if (!session?.sessionId) return null;
  return {
    sessionId: session.sessionId,
    accounts: session.accounts || [],
    aspsp: session.aspsp || null,
    connectedAt: session.connectedAt || null,
  };
}

module.exports = {
  resolveBankSession,
  persistBankSession,
  clearBankSessionEverywhere,
  toClientPayload,
};
