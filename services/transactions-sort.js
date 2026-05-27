function parseGermanDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  const parts = dateStr.trim().split(".");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  if (!d || !m || !y) return "";
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function getTransactionSortKey(tx) {
  if (tx?.dateSort) return tx.dateSort;
  if (tx?.raw?.dateSort) return tx.raw.dateSort;
  return parseGermanDate(tx?.date);
}

function sortTransactionsNewestFirst(list) {
  return [...(list || [])].sort((a, b) => {
    const da = getTransactionSortKey(a);
    const db = getTransactionSortKey(b);
    if (da !== db) return db.localeCompare(da);
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

module.exports = {
  parseGermanDate,
  getTransactionSortKey,
  sortTransactionsNewestFirst,
};
