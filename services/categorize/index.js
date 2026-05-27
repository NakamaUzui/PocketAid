const { buildSearchBlob, extractMerchantFromCardLine, normalizeText } = require("./normalize");
const { categoryFromMcc } = require("./mcc");
const { matchKeywordRules } = require("./rules");

const DEFAULT = { category: "Sonstiges", icon: "teal", source: "default" };

/**
 * @param {object} tx – Enable-Banking-Transaktion (roh)
 * @param {string} merchantLabel – Anzeigename (creditor/debtor)
 */
function categorizeTransaction(tx, merchantLabel) {
  const mcc = tx?.merchant_category_code;
  const fromMcc = categoryFromMcc(mcc);
  if (fromMcc) return fromMcc;

  const remittance = (tx?.remittance_information || []).join(" ");
  const { normalized, extracted } = buildSearchBlob([
    merchantLabel,
    remittance,
    tx?.note,
  ]);

  const fromKeywords = matchKeywordRules(normalized);
  if (fromKeywords) return fromKeywords;

  if (extracted) {
    const fromExtracted = matchKeywordRules(normalizeText(extracted));
    if (fromExtracted) return fromExtracted;
  }

  const btc = tx?.bank_transaction_code;
  if (btc) {
    const domain = String(btc.domain || btc.proprietary?.domain || "").toLowerCase();
    const family = String(btc.family || btc.proprietary?.family || "").toLowerCase();
    if (/card|credit card|debit card/i.test(domain + family)) {
      return { category: "Einkaufen", icon: "purple", source: "bank_code" };
    }
  }

  return DEFAULT;
}

function getDisplayMerchant(tx, fallbackName) {
  const raw = fallbackName || "";
  if (/^(POS|E-COMM|AUTOMAT)\s/i.test(raw)) {
    const extracted = extractMerchantFromCardLine(raw);
    if (extracted && extracted.length > 2) return extracted;
  }
  return raw;
}

module.exports = {
  categorizeTransaction,
  getDisplayMerchant,
  DEFAULT,
};
