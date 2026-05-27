/**
 * ISO 18245 Merchant Category Code → PocketAid-Kategorie
 * @see https://enablebanking.com/docs/api/reference (merchant_category_code)
 */

const MCC_RANGES = [
  { from: 5541, to: 5542, category: "Auto / Tanken", icon: "red" },
  { from: 5983, to: 5983, category: "Auto / Tanken", icon: "red" },
  { from: 5172, to: 5172, category: "Auto / Tanken", icon: "red" },
  { from: 7523, to: 7523, category: "Auto / Tanken", icon: "red" },
  { from: 7531, to: 7538, category: "Auto / Tanken", icon: "red" },
  { from: 5511, to: 5521, category: "Auto / Tanken", icon: "red" },
  { from: 5531, to: 5533, category: "Auto / Tanken", icon: "red" },
  { from: 4111, to: 4112, category: "Mobilität", icon: "yellow" },
  { from: 4131, to: 4131, category: "Mobilität", icon: "yellow" },
  { from: 4121, to: 4121, category: "Mobilität", icon: "yellow" },
  { from: 4784, to: 4789, category: "Mobilität", icon: "yellow" },
  { from: 5812, to: 5814, category: "Essen", icon: "purple" },
  { from: 5411, to: 5411, category: "Essen", icon: "purple" },
  { from: 5422, to: 5422, category: "Essen", icon: "purple" },
  { from: 5441, to: 5441, category: "Essen", icon: "purple" },
  { from: 5499, to: 5499, category: "Essen", icon: "purple" },
  { from: 5912, to: 5912, category: "Gesundheit", icon: "teal" },
  { from: 8011, to: 8099, category: "Gesundheit", icon: "teal" },
  { from: 8021, to: 8021, category: "Gesundheit", icon: "teal" },
  { from: 8062, to: 8062, category: "Gesundheit", icon: "teal" },
  { from: 7832, to: 7832, category: "Freizeit", icon: "pink" },
  { from: 7922, to: 7922, category: "Freizeit", icon: "pink" },
  { from: 7991, to: 7999, category: "Freizeit", icon: "pink" },
  { from: 5735, to: 5735, category: "Abos", icon: "teal" },
  { from: 5815, to: 5818, category: "Abos", icon: "teal" },
  { from: 4812, to: 4816, category: "Abos", icon: "teal" },
  { from: 4899, to: 4899, category: "Abos", icon: "teal" },
  { from: 6300, to: 6300, category: "Versicherung", icon: "green" },
  { from: 5960, to: 5960, category: "Versicherung", icon: "green" },
  { from: 5311, to: 5331, category: "Einkaufen", icon: "purple" },
  { from: 5651, to: 5651, category: "Einkaufen", icon: "purple" },
  { from: 5691, to: 5699, category: "Einkaufen", icon: "purple" },
  { from: 5941, to: 5949, category: "Einkaufen", icon: "purple" },
  { from: 5995, to: 5995, category: "Haustiere", icon: "pink" },
];

function categoryFromMcc(mcc) {
  if (!mcc) return null;
  const code = parseInt(String(mcc).trim(), 10);
  if (Number.isNaN(code)) return null;
  const hit = MCC_RANGES.find((r) => code >= r.from && code <= r.to);
  return hit ? { category: hit.category, icon: hit.icon, source: "mcc" } : null;
}

module.exports = { categoryFromMcc, MCC_RANGES };
