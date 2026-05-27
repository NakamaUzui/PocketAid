const fs = require("fs");
const path = require("path");
const { isSupabaseConfigured } = require("./db/client");
const dbTx = require("./db/transactions");
const { sortTransactionsNewestFirst } = require("./transactions-sort");

const DEFAULT_TRANSACTIONS = [
  {
    id: "tx-demo-1",
    merchant: "Aral Tankstelle",
    date: "18.02.2022",
    amount: -12.67,
    amountDisplay: "- 12,67 €",
    category: "Auto / Tanken",
    icon: "red",
    source: "demo",
  },
];

function getUserDataDir(userId) {
  if (!userId) {
    return process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join("/tmp", "pocketaid-data", "_legacy")
      : path.join(__dirname, "..", "data");
  }
  return process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "pocketaid-data", userId)
    : path.join(__dirname, "..", "data", "users", userId);
}

function pathsForUser(userId) {
  const dir = getUserDataDir(userId);
  return {
    txFile: path.join(dir, "transactions.json"),
    sessionFile: path.join(dir, "bank-session.json"),
  };
}

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.warn(`[store] Konnte ${file} nicht lesen:`, e.message);
  }
  return fallback;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function getTransactionsLegacy(userId) {
  const { txFile } = pathsForUser(userId);
  const data = readJson(txFile, { transactions: [], syncedAt: null });
  const list = data.transactions || [];
  if (list.length === 0 && !userId) {
    return DEFAULT_TRANSACTIONS;
  }
  return sortTransactionsNewestFirst(list);
}

function saveTransactionsLegacy(transactions, userId) {
  const { txFile } = pathsForUser(userId);
  writeJson(txFile, {
    transactions,
    syncedAt: new Date().toISOString(),
    source: transactions.some((t) => t.source === "enable-banking") ? "enable-banking" : "demo",
  });
}

function getBankSessionLegacy(userId) {
  const { sessionFile } = pathsForUser(userId);
  return readJson(sessionFile, null);
}

function saveBankSessionLegacy(session, userId) {
  const { sessionFile } = pathsForUser(userId);
  writeJson(sessionFile, session);
}

function clearBankSessionLegacy(userId) {
  const { sessionFile } = pathsForUser(userId);
  if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
}

async function getTransactions(userId) {
  if (isSupabaseConfigured()) return dbTx.getTransactions(userId);
  return getTransactionsLegacy(userId);
}

async function countTransactions(userId) {
  if (isSupabaseConfigured()) return dbTx.countTransactions(userId);
  return getTransactionsLegacy(userId).length;
}

async function saveTransactions(transactions, userId) {
  if (isSupabaseConfigured()) return dbTx.saveTransactions(transactions, userId);
  return saveTransactionsLegacy(transactions, userId);
}

async function getLastSyncedAt(userId) {
  if (isSupabaseConfigured()) return dbTx.getLastSyncedAt(userId);
  const { txFile } = pathsForUser(userId);
  const data = readJson(txFile, { syncedAt: null });
  return data.syncedAt || null;
}

async function getBankSession(userId) {
  if (isSupabaseConfigured()) return dbTx.getBankSession(userId);
  return getBankSessionLegacy(userId);
}

async function saveBankSession(session, userId) {
  if (isSupabaseConfigured()) return dbTx.saveBankSession(session, userId);
  return saveBankSessionLegacy(session, userId);
}

async function clearBankSession(userId) {
  if (isSupabaseConfigured()) return dbTx.clearBankSession(userId);
  return clearBankSessionLegacy(userId);
}

function getSummary(transactions) {
  const total = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return {
    totalSpent: total.toFixed(2).replace(".", ",") + " €",
    count: transactions.length,
    label: new Date().toLocaleDateString("de-AT", { month: "long", year: "numeric" }),
  };
}

module.exports = {
  getTransactions,
  countTransactions,
  saveTransactions,
  getLastSyncedAt,
  getBankSession,
  saveBankSession,
  clearBankSession,
  getSummary,
  DEFAULT_TRANSACTIONS,
};
