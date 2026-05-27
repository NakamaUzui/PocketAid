const {
  getTransactions,
  getSummary,
} = require("../services/transactions-store");
const { resolveBankSession } = require("../services/bank-session");

const CATEGORIES = [
  { name: "Auto", color: "orange", share: "~35%" },
  { name: "Essen", color: "purple", share: "~22%" },
  { name: "Abos", color: "teal", share: "~12%" },
  { name: "Freizeit", color: "pink", share: "~18%" },
  { name: "Sparen", color: "green", share: "~13%" },
];

const MAX_TX_IN_PROMPT = 80;

function parseAmount(val) {
  if (typeof val === "number") return val;
  return parseFloat(String(val).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;
}

function normalizeClientTransactions(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.map((t) => ({
    merchant: t.merchant || t.name || "Unbekannt",
    date: t.date || "",
    amount: parseAmount(t.amount ?? t.amountDisplay),
    amountDisplay: t.amountDisplay || String(t.amount || ""),
    category: t.category || "Sonstiges",
    source: t.source || "client",
  }));
}

async function resolveTransactions(req) {
  const clientTx = normalizeClientTransactions(req?.body?.transactions);
  const serverTx = await getTransactions(req?.user?.id);

  if (clientTx?.length) {
    const hasLive = clientTx.some((t) => t.source === "enable-banking");
    const serverLive = serverTx.some((t) => t.source === "enable-banking");
    if (hasLive || clientTx.length >= serverTx.length) {
      return { transactions: clientTx, dataSource: hasLive ? "Enable Banking (App-Sync)" : "App-Cache" };
    }
  }

  const isLive = serverTx.some((t) => t.source === "enable-banking");
  return {
    transactions: serverTx,
    dataSource: isLive ? "Enable Banking (Server)" : "Demo-Daten",
  };
}

function buildCategorySummary(transactions) {
  const totals = {};
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const cat = t.category || "Sonstiges";
    totals[cat] = (totals[cat] || 0) + Math.abs(t.amount);
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, sum]) => `- ${cat}: ${sum.toFixed(2).replace(".", ",")} €`);
}

async function getFinanceContext(req) {
  const { transactions, dataSource } = await resolveTransactions(req);
  const summary = getSummary(transactions);
  const session = await resolveBankSession(req);

  return {
    user: { name: "Nutzer", locale: "de-AT", currency: "EUR", country: "AT" },
    period: { label: summary.label, totalSpent: summary.totalSpent },
    categories: CATEGORIES,
    transactions,
    bankConnected: Boolean(session?.sessionId),
    bankName: session?.aspsp?.name || null,
    dataSource,
  };
}

async function buildContextBlock(req) {
  const ctx = await getFinanceContext(req);
  const categoryLines = buildCategorySummary(ctx.transactions);

  const expenses = ctx.transactions
    .filter((t) => t.amount < 0)
    .slice(0, MAX_TX_IN_PROMPT);

  const txLines = expenses
    .map(
      (t) =>
        `- ${t.date} | ${t.merchant} | ${t.amountDisplay} | Kategorie: ${t.category}`
    )
    .join("\n");

  const catLines = ctx.categories
    .map((c) => `- ${c.name} (${c.share})`)
    .join("\n");

  return `
DATENQUELLE: ${ctx.dataSource}
WICHTIG: Nutze NUR die unten stehenden Transaktionen und Summen. Sie entsprechen der Übersicht in der App.
${ctx.bankConnected ? `Verbundene Bank: ${ctx.bankName}` : "Keine Bank verbunden"}
Zeitraum: ${ctx.period.label}
Gesamtausgaben (Summe Abbuchungen): ${ctx.period.totalSpent}
Anzahl Buchungen gesamt: ${ctx.transactions.length} (${expenses.length} Ausgaben in Liste)

Ausgaben nach Kategorie (berechnet):
${categoryLines.length ? categoryLines.join("\n") : "(keine Ausgaben)"}

Transaktionen (Ausgaben, neueste zuerst, max. ${MAX_TX_IN_PROMPT}):
${txLines || "(keine Transaktionen geladen – Nutzer soll unter Einstellungen synchronisieren)"}

Hinweis-Kategorien (Richtwerte):
${catLines}`.trim();
}

module.exports = { getFinanceContext, buildContextBlock, CATEGORIES, resolveTransactions };
