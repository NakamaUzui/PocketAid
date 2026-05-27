/**
 * Text für Händler-Matching vorbereiten (Akzente, Karten-Rauschen).
 */
function normalizeText(input) {
  if (!input) return "";
  return String(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s@.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Österreichische/ europäische Kartenbuchungstexte → lesbarer Händlername */
function extractMerchantFromCardLine(raw) {
  if (!raw) return "";
  let t = String(raw).trim();

  const afterK2 = t.match(/K2\s+\d{2}\.\d{2}\.\s*(?:\d{2}:\d{2}\s+)?(.+)/i);
  if (afterK2) return cleanDisplayName(afterK2[1]);

  const www = t.match(/WWW\.([A-Z0-9][A-Z0-9.-]*)/i);
  if (www) return www[1].replace(/\./g, " ");

  const shortCode = t.match(/^([A-ZÄÖÜ][A-Z0-9ÄÖÜ&.\s'-]{2,28}?)\s+\d{3,5}\s+K2\b/i);
  if (shortCode) return cleanDisplayName(shortCode[1]);

  const posTail = t.match(/(?:POS|E-COMM|AUTOMAT)\s+[\d.,\s]+(?:AT|DE|IE|USD|EUR)?\s+K2\s+.+?\s+(.+)/i);
  if (posTail) return cleanDisplayName(posTail[1]);

  return cleanDisplayName(t);
}

function cleanDisplayName(name) {
  return String(name)
    .replace(/\s+WIEN\s+\d{4}\s+\d{3}$/i, "")
    .replace(/\s+\d{4}\s+\d{3}$/i, "")
    .replace(/\s+AT\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchBlob(parts) {
  const combined = parts.filter(Boolean).join(" ");
  const extracted = extractMerchantFromCardLine(combined);
  const normalized = normalizeText(`${combined} ${extracted}`);
  return { raw: combined, extracted, normalized };
}

module.exports = {
  normalizeText,
  extractMerchantFromCardLine,
  cleanDisplayName,
  buildSearchBlob,
};
