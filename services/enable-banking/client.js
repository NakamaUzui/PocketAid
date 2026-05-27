const fs = require("fs");
const jwt = require("jsonwebtoken");
const { isNetlifyRuntime, readPemFromFile, readPemFromBlob } = require("./key-store");

const API_BASE = "https://api.enablebanking.com";

let cachedPrivateKey = null;
let loadPromise = null;

function getEnvironment() {
  return (process.env.ENABLE_BANKING_ENV || "sandbox").toLowerCase();
}

/** Netlify/UI: PEM oft als eine Zeile mit Leerzeichen statt Zeilenumbrüchen. */
function normalizePrivateKey(raw) {
  if (!raw) return null;
  let key = String(raw).trim().replace(/\\n/g, "\n");
  const beginMatch = key.match(/-----BEGIN ([A-Z0-9 ]+)-----/);
  const endMatch = key.match(/-----END ([A-Z0-9 ]+)-----/);
  if (!beginMatch || !endMatch || beginMatch[1] !== endMatch[1]) {
    return key;
  }
  const label = beginMatch[1];
  const body = key
    .replace(/-----BEGIN [A-Z0-9 ]+-----/g, "")
    .replace(/-----END [A-Z0-9 ]+-----/g, "")
    .replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

async function resolvePrivateKey() {
  if (process.env.ENABLE_BANKING_PRIVATE_KEY?.trim()) {
    return normalizePrivateKey(process.env.ENABLE_BANKING_PRIVATE_KEY);
  }

  const fromFile = readPemFromFile();
  if (fromFile) return normalizePrivateKey(fromFile);

  if (isNetlifyRuntime()) {
    try {
      const fromBlob = await readPemFromBlob();
      if (fromBlob) return normalizePrivateKey(fromBlob);
    } catch (e) {
      console.warn("[enable-banking] PEM aus Blob:", e.message);
    }
  }

  return null;
}

async function ensurePrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;
  if (!loadPromise) {
    loadPromise = resolvePrivateKey().then((key) => {
      cachedPrivateKey = key;
      return key;
    });
  }
  return loadPromise;
}

function loadPrivateKey() {
  return cachedPrivateKey;
}

async function isConfiguredAsync() {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  await ensurePrivateKey();
  return Boolean(appId && cachedPrivateKey);
}

function isConfigured() {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  return Boolean(appId && loadPrivateKey());
}

async function getConfigDiagnosticsAsync() {
  await ensurePrivateKey();
  const appId = process.env.ENABLE_BANKING_APP_ID?.trim();
  const hasKeyEnv = Boolean(process.env.ENABLE_BANKING_PRIVATE_KEY?.trim());
  const hasKeyFile = Boolean(readPemFromFile());
  const hasKey = Boolean(cachedPrivateKey);
  const onNetlify = isNetlifyRuntime();

  let hint = null;
  if (!appId && !hasKey) {
    hint = "ENABLE_BANKING_APP_ID und PEM fehlen.";
  } else if (!appId) {
    hint = "ENABLE_BANKING_APP_ID fehlt.";
  } else if (!hasKey) {
    hint = onNetlify
      ? "PEM fehlt in Netlify Blobs – npm run banking:upload-key ausführen."
      : "PEM fehlt: keys/enable-banking-production.pem oder ENABLE_BANKING_PRIVATE_KEY.";
  }

  return {
    appId: Boolean(appId),
    privateKey: hasKey,
    privateKeyEnv: hasKeyEnv,
    privateKeyFile: hasKeyFile,
    privateKeyBlob: onNetlify && hasKey && !hasKeyEnv,
    onNetlify,
    hint,
  };
}

function getConfigDiagnostics() {
  const appId = process.env.ENABLE_BANKING_APP_ID?.trim();
  const hasKey = Boolean(loadPrivateKey());
  const onNetlify = isNetlifyRuntime();
  return {
    appId: Boolean(appId),
    privateKey: hasKey,
    onNetlify,
    hint: !hasKey && onNetlify ? "PEM in Netlify Blobs hochladen (npm run banking:upload-key)." : null,
  };
}

async function isKeyValidAsync() {
  if (!(await isConfiguredAsync())) return false;
  try {
    createJwt();
    return true;
  } catch {
    return false;
  }
}

function isKeyValid() {
  if (!isConfigured()) return false;
  try {
    createJwt();
    return true;
  } catch {
    return false;
  }
}

function createJwt() {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const privateKey = loadPrivateKey();

  if (!appId || !privateKey) {
    throw new Error(
      "Enable Banking: ENABLE_BANKING_APP_ID und PEM (Datei, Blob oder ENABLE_BANKING_PRIVATE_KEY) fehlen."
    );
  }
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    {
      algorithm: "RS256",
      header: { typ: "JWT", alg: "RS256", kid: appId },
    }
  );
}

function getHeaders() {
  return {
    Authorization: `Bearer ${createJwt()}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function ebFetch(path, options = {}) {
  const { data } = await ebFetchWithMeta(path, options);
  return data;
}

async function ebFetchWithMeta(path, options = {}) {
  await ensurePrivateKey();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...getHeaders(), ...options.headers },
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || data?.detail || res.statusText;
    throw new Error(`Enable Banking (${res.status}): ${msg}`);
  }

  const headers = {};
  res.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return { data, headers, url };
}

module.exports = {
  ensurePrivateKey,
  isConfigured,
  isConfiguredAsync,
  isKeyValid,
  isKeyValidAsync,
  getEnvironment,
  getConfigDiagnostics,
  getConfigDiagnosticsAsync,
  ebFetch,
  ebFetchWithMeta,
  API_BASE,
};
