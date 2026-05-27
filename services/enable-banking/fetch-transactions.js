const crypto = require("crypto");
const { ebFetchWithMeta } = require("./client");

const MAX_PAGES_PER_ACCOUNT = 500;

function getAccountUid(account) {
  if (!account) return null;
  if (typeof account === "string") return account;
  return account.uid || account.account_uid || account.id || null;
}

function getContinuationKeyFromLink(linkHeader) {
  if (!linkHeader) return null;
  const parts = String(linkHeader).split(",");
  for (const part of parts) {
    if (!/rel="?next"?/i.test(part)) continue;
    const match = part.match(/<([^>]+)>/);
    if (!match) continue;
    try {
      const url = new URL(match[1]);
      const key =
        url.searchParams.get("continuation_key") ||
        url.searchParams.get("continuationKey");
      if (key) return key;
    } catch (_) {}
  }
  return null;
}

function getContinuationKey(page, headers = {}) {
  const bodyKey =
    page?.continuation_key ??
    page?.continuationKey ??
    page?.continuation?.key ??
    null;
  if (bodyKey != null && bodyKey !== "") return String(bodyKey);

  const linkKey =
    getContinuationKeyFromLink(headers.link) ||
    getContinuationKeyFromLink(headers.Link);
  if (linkKey) return linkKey;

  return null;
}

function getFetchStrategyMode() {
  return (process.env.BANKING_FETCH_STRATEGY || "default").toLowerCase();
}

function getHistoryDays() {
  const parsed = Number(process.env.BANKING_HISTORY_DAYS);
  if (!Number.isFinite(parsed) || parsed <= 0) return 3650;
  return Math.floor(parsed);
}

function rawTxKey(tx) {
  return (
    tx.entry_reference ||
    tx.transaction_id ||
    `${tx.booking_date}|${tx.value_date}|${tx.transaction_amount?.amount}|${tx.credit_debit_indicator}`
  );
}

function mergeTransactions(into, list) {
  for (const tx of list) into.set(rawTxKey(tx), tx);
}

/**
 * Holt alle Transaktionsseiten für ein Konto (Enable-Banking-Pagination).
 */
async function fetchAccountTransactionsWithStrategy(accountId, options = {}) {
  const { dateFrom, dateTo, strategy = "default" } = options;
  const allRaw = [];
  let continuationKey = null;
  let pages = 0;
  let lastHadContinuation = false;
  let lastBatchSize = 0;

  do {
    const qs = new URLSearchParams();
    if (strategy === "longest") {
      qs.set("strategy", "longest");
      qs.set("date_from", dateFrom);
    } else {
      qs.set("strategy", "default");
      qs.set("date_from", dateFrom);
      qs.set("date_to", dateTo);
    }
    if (continuationKey) qs.set("continuation_key", continuationKey);

    const { data: page, headers } = await ebFetchWithMeta(
      `/accounts/${accountId}/transactions?${qs.toString()}`
    );
    const batch = page.transactions || [];
    lastBatchSize = batch.length;
    allRaw.push(...batch);
    pages += 1;
    continuationKey = getContinuationKey(page, headers);
    lastHadContinuation = Boolean(continuationKey);
  } while (continuationKey && pages < MAX_PAGES_PER_ACCOUNT);

  return {
    transactions: allRaw,
    pages,
    strategy,
    lastHadContinuation,
    lastBatchSize,
  };
}

async function fetchAccountTransactions(accountId, options = {}) {
  const mode = getFetchStrategyMode();
  const merged = new Map();
  const strategyStats = [];
  let apiPages = 0;

  const runStrategy = async (strategy) => {
    const result = await fetchAccountTransactionsWithStrategy(accountId, {
      ...options,
      strategy,
    });
    const before = merged.size;
    mergeTransactions(merged, result.transactions);
    apiPages += result.pages;
    strategyStats.push({
      strategy,
      pages: result.pages,
      count: result.transactions.length,
      newUnique: merged.size - before,
      lastHadContinuation: result.lastHadContinuation,
      lastBatchSize: result.lastBatchSize,
    });
    return result;
  };

  if (mode === "longest") {
    await runStrategy("longest");
  } else if (mode === "both") {
    await runStrategy("default");
    await runStrategy("longest");
  } else {
    await runStrategy("default");
  }

  return {
    transactions: [...merged.values()],
    pages: apiPages,
    strategyStats,
  };
}

/**
 * Session aktualisieren und alle Konten durchlaufen.
 */
async function fetchAllSessionTransactions(session) {
  if (!session?.sessionId) {
    return { transactions: [], accounts: 0, pages: 0, accountStats: [] };
  }

  let accounts = session.accounts || [];
  try {
    const { data: fresh } = await ebFetchWithMeta(`/sessions/${session.sessionId}`);
    if (fresh?.accounts?.length) accounts = fresh.accounts;
  } catch (e) {
    console.warn("[banking/sync] Session-Refresh fehlgeschlagen:", e.message);
  }

  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(
    Date.now() - getHistoryDays() * 24 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

  const allRaw = [];
  let totalPages = 0;
  let accountCount = 0;
  const accountStats = [];

  for (const account of accounts) {
    const accountId = getAccountUid(account);
    if (!accountId) continue;
    accountCount += 1;

    const result = await fetchAccountTransactions(accountId, { dateFrom, dateTo });
    allRaw.push(...result.transactions);
    totalPages += result.pages;
    accountStats.push({
      accountId,
      count: result.transactions.length,
      pages: result.pages,
      strategies: result.strategyStats,
    });
  }

  return {
    transactions: allRaw,
    accounts: accountCount,
    pages: totalPages,
    dateFrom,
    dateTo,
    strategyMode: getFetchStrategyMode(),
    accountStats,
  };
}

function stableTransactionId(tx, index) {
  if (tx.entry_reference) return String(tx.entry_reference).slice(0, 64);
  if (tx.transaction_id) return String(tx.transaction_id).slice(0, 64);
  const amount = tx.transaction_amount?.amount || "";
  const merchant =
    tx.creditor?.name || tx.debtor?.name || tx.remittance_information?.[0] || "";
  const key = [
    tx.booking_date || tx.value_date || "",
    amount,
    tx.credit_debit_indicator || "",
    merchant,
    index,
  ].join("|");
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

module.exports = {
  fetchAllSessionTransactions,
  fetchAccountTransactions,
  fetchAccountTransactionsWithStrategy,
  getAccountUid,
  stableTransactionId,
  getContinuationKey,
};
