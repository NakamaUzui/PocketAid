const { isSupabaseConfigured } = require("../db/client");
const dbUsers = require("../db/users");

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BLOB_KEY = "registry";

function isLambda() {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function getLocalFile() {
  if (isLambda()) {
    return path.join("/tmp", "pocketaid-data", "auth", "users.json");
  }
  return path.join(__dirname, "..", "..", "data", "auth", "users.json");
}

function emptyRegistry() {
  return { users: {}, byEmail: {}, byProvider: {} };
}

function readLocalRegistry() {
  const file = getLocalFile();
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch (e) {
    console.warn("[user-store] Lesen fehlgeschlagen:", e.message);
  }
  return emptyRegistry();
}

function writeLocalRegistry(data) {
  const file = getLocalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

async function loadRegistry() {
  const onNetlify = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (onNetlify) {
    const { getStore } = require("@netlify/blobs");
    const store = getStore("pocketaid-users");
    const data = await store.get(BLOB_KEY, { type: "json" });
    if (data?.users) return data;
    return emptyRegistry();
  }
  return readLocalRegistry();
}

async function saveRegistry(data) {
  const onNetlify = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (onNetlify) {
    const { getStore } = require("@netlify/blobs");
    const store = getStore("pocketaid-users");
    await store.setJSON(BLOB_KEY, data);
    return;
  }
  writeLocalRegistry(data);
}

function normalizeEmail(email) {
  return dbUsers.normalizeEmail(email);
}

async function findUserByEmail(email) {
  if (isSupabaseConfigured()) return dbUsers.findUserByEmail(email);
  const registry = await loadRegistry();
  const id = registry.byEmail[normalizeEmail(email)];
  return id ? registry.users[id] : null;
}

async function findUserById(id) {
  if (isSupabaseConfigured()) return dbUsers.findUserById(id);
  const registry = await loadRegistry();
  return registry.users[id] || null;
}

async function findUserByProvider(provider, providerId) {
  if (isSupabaseConfigured()) return dbUsers.findUserByProvider(provider, providerId);
  const registry = await loadRegistry();
  if (!registry.byProvider) registry.byProvider = {};
  const uid = registry.byProvider[`${provider}:${providerId}`];
  return uid ? registry.users[uid] : null;
}

async function findOrCreateOAuthUser(params) {
  if (isSupabaseConfigured()) return dbUsers.findOrCreateOAuthUser(params);
  const { provider, providerId, email, name, picture } = params;
  const registry = await loadRegistry();
  if (!registry.byProvider) registry.byProvider = {};

  const providerKey = `${provider}:${providerId}`;
  let userId = registry.byProvider[providerKey];
  if (userId && registry.users[userId]) {
    return registry.users[userId];
  }

  const norm = email ? normalizeEmail(email) : "";
  if (norm && registry.byEmail[norm]) {
    userId = registry.byEmail[norm];
    const existing = registry.users[userId];
    if (existing) {
      if (!existing.authProviders) existing.authProviders = {};
      existing.authProviders[provider] = providerId;
      if (picture && !existing.picture) existing.picture = picture;
      if (name && name.trim()) existing.name = name.trim();
      registry.byProvider[providerKey] = userId;
      await saveRegistry(registry);
      return existing;
    }
  }

  if (!norm) {
    const err = new Error(
      "Apple hat keine E-Mail geteilt. Bitte erneut anmelden und E-Mail freigeben."
    );
    err.code = "OAUTH_NO_EMAIL";
    throw err;
  }

  if (registry.byEmail[norm]) {
    const err = new Error("E-Mail ist bereits registriert. Bitte anmelden.");
    err.code = "EMAIL_EXISTS";
    throw err;
  }

  const user = {
    id: crypto.randomUUID(),
    email: norm,
    name: String(name || "").trim() || norm.split("@")[0],
    picture: picture || null,
    authProviders: { [provider]: providerId },
    createdAt: new Date().toISOString(),
  };

  registry.users[user.id] = user;
  registry.byEmail[norm] = user.id;
  registry.byProvider[providerKey] = user.id;
  await saveRegistry(registry);
  return user;
}

async function createUser(params) {
  if (isSupabaseConfigured()) return dbUsers.createUser(params);
  const { email, name, passwordHash, passwordSalt } = params;
  const registry = await loadRegistry();
  const norm = normalizeEmail(email);
  if (registry.byEmail[norm]) {
    const existing = registry.users[registry.byEmail[norm]];
    if (existing?.authProviders && !existing.passwordHash) {
      const err = new Error("Diese E-Mail nutzt Google oder Apple. Bitte dort anmelden.");
      err.code = "OAUTH_ACCOUNT";
      throw err;
    }
    const err = new Error("E-Mail ist bereits registriert.");
    err.code = "EMAIL_EXISTS";
    throw err;
  }

  const user = {
    id: crypto.randomUUID(),
    email: norm,
    name: String(name || "").trim() || norm.split("@")[0],
    passwordHash,
    passwordSalt,
    createdAt: new Date().toISOString(),
  };

  registry.users[user.id] = user;
  registry.byEmail[norm] = user.id;
  await saveRegistry(registry);
  return user;
}

function userHasPassword(user) {
  return dbUsers.userHasPassword(user);
}

function toPublicUser(user) {
  return dbUsers.toPublicUser(user);
}

module.exports = {
  findUserByEmail,
  findUserById,
  findUserByProvider,
  findOrCreateOAuthUser,
  createUser,
  toPublicUser,
  normalizeEmail,
  userHasPassword,
};
