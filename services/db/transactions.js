const { getSupabase } = require("./client");
const { sortTransactionsNewestFirst } = require("../transactions-sort");

function rowToTransaction(row) {
  const raw = row.raw && typeof row.raw === "object" ? row.raw : null;
  return {
    id: row.id,
    merchant: row.merchant,
    date: row.date,
    dateSort: raw?.dateSort || null,
    amount: row.amount != null ? Number(row.amount) : 0,
    amountDisplay: row.amount_display,
    category: row.category,
    icon: row.icon,
    source: row.source,
    mcc: row.mcc,
    ...(raw ? { raw } : {}),
  };
}

function transactionToRow(t, userId, syncedAt) {
  const raw =
    t.dateSort || t.raw
      ? { ...(t.raw && typeof t.raw === "object" ? t.raw : {}), ...(t.dateSort ? { dateSort: t.dateSort } : {}) }
      : null;
  return {
    id: String(t.id),
    user_id: userId,
    merchant: t.merchant || null,
    date: t.date || null,
    amount: t.amount,
    amount_display: t.amountDisplay || null,
    category: t.category || null,
    icon: t.icon || null,
    source: t.source || null,
    mcc: t.mcc || null,
    raw,
    synced_at: syncedAt,
  };
}

async function countTransactions(userId) {
  if (!userId) return 0;
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count || 0;
}

async function getTransactions(userId) {
  if (!userId) return [];
  const supabase = getSupabase();
  const pageSize = 50;
  const rows = [];
  let from = 0;
  let total = null;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error, count } = await supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (total == null && typeof count === "number") total = count;
    if (!data?.length) break;

    rows.push(...data);
    from += data.length;

    if (total != null && from >= total) break;
    if (data.length < pageSize) break;
  }

  return sortTransactionsNewestFirst(rows.map(rowToTransaction));
}

async function saveTransactions(transactions, userId) {
  if (!userId) return;
  const supabase = getSupabase();
  const syncedAt = new Date().toISOString();

  const { error: delError } = await supabase.from("transactions").delete().eq("user_id", userId);
  if (delError) throw delError;

  if (!transactions?.length) return;

  const rows = transactions.map((t) => transactionToRow(t, userId, syncedAt));
  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("transactions").insert(chunk);
    if (error) throw error;
  }
}

async function getLastSyncedAt(userId) {
  if (!userId) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("transactions")
    .select("synced_at")
    .eq("user_id", userId)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.synced_at || null;
}

async function getBankSession(userId) {
  if (!userId) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bank_sessions")
    .select("session_data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.session_data || null;
}

async function saveBankSession(session, userId) {
  if (!userId) return;
  const supabase = getSupabase();
  const { error } = await supabase.from("bank_sessions").upsert({
    user_id: userId,
    session_data: session,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function clearBankSession(userId) {
  if (!userId) return;
  const supabase = getSupabase();
  const { error } = await supabase.from("bank_sessions").delete().eq("user_id", userId);
  if (error) throw error;
}

module.exports = {
  getTransactions,
  countTransactions,
  saveTransactions,
  getLastSyncedAt,
  getBankSession,
  saveBankSession,
  clearBankSession,
};
