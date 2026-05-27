const { categorizeTransaction, getDisplayMerchant } = require("../categorize");
const { stableTransactionId } = require("./fetch-transactions");

function formatGermanDate(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

function formatEuro(amount) {
  const abs = Math.abs(amount).toFixed(2).replace(".", ",");
  const sign = amount < 0 ? "- " : "+ ";
  return `${sign}${abs} €`;
}

function getMerchantName(tx) {
  let name;
  if (tx.credit_debit_indicator === "DBIT") {
    name = tx.creditor?.name || tx.remittance_information?.[0] || "Abbuchung";
  } else {
    name = tx.debtor?.name || tx.remittance_information?.[0] || "Gutschrift";
  }
  return getDisplayMerchant(tx, name);
}

/**
 * Enable Banking HAL-Transaktion → PocketAid-Format
 */
function normalizeTransaction(tx, index = 0) {
  const rawAmount = parseFloat(tx.transaction_amount?.amount || "0");
  const isExpense = tx.credit_debit_indicator === "DBIT";
  const signedAmount = isExpense ? -Math.abs(rawAmount) : Math.abs(rawAmount);
  const merchant = getMerchantName(tx);
  const { category, icon } = categorizeTransaction(tx, merchant);
  const dateSort = tx.booking_date || tx.value_date || "";

  return {
    id: stableTransactionId(tx, index),
    merchant,
    date: formatGermanDate(dateSort),
    dateSort,
    amount: signedAmount,
    amountDisplay: formatEuro(signedAmount),
    category,
    icon,
    source: "enable-banking",
    rawStatus: tx.status,
    mcc: tx.merchant_category_code || null,
  };
}

function normalizeAll(transactions) {
  return (transactions || []).map((tx, index) => normalizeTransaction(tx, index));
}

module.exports = { normalizeTransaction, normalizeAll, formatEuro };
