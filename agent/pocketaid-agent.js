const { buildContextBlock } = require("../data/finance-context");
const openaiProvider = require("./providers/openai");
const geminiProvider = require("./providers/gemini");

const SYSTEM_PROMPT_BASE = `Du bist PocketAid, der persönliche Finanz-Assistent in einer Mobile-App.

DEINE ROLLE:
- Du hilfst bei Ausgaben, Kategorien, Budgets und Transaktionen.
- Du antwortest immer auf Deutsch, freundlich und knapp (2–4 Sätze, außer der Nutzer will Details).
- Du nutzt NUR die mitgelieferten Finanzdaten – erfinde keine Buchungen oder Beträge.
- Bei fehlenden Daten sag ehrlich, dass du sie nicht hast.

FÄHIGKEITEN:
- Transaktionen erklären und nach Kategorie/Händler filtern
- Ausgaben vergleichen und Spartipps geben
- Kategorien vorschlagen oder bestätigen (z. B. Auto / Tanken)
REGELN:
- Beträge im österreichischen/deutschen Format (z. B. 12,67 €)
- Nutzer ist in Österreich (EUR)
- Keine Rechts- oder Steuerberatung`;

async function buildSystemPrompt(req) {
  const block = await buildContextBlock(req);
  return `${SYSTEM_PROMPT_BASE}\n\n${block}`;
}

const providers = {
  openai: openaiProvider,
  gemini: geminiProvider,
};

function resolveProvider() {
  const requested = (process.env.AI_PROVIDER || "").toLowerCase().trim();

  if (requested === "openai" || requested === "gemini") {
    return providers[requested];
  }

  if (geminiProvider.isConfigured()) return geminiProvider;
  if (openaiProvider.isConfigured()) return openaiProvider;

  return null;
}

function getProvider() {
  const provider = resolveProvider();
  if (!provider) {
    throw new Error(
      "Kein KI-Anbieter konfiguriert. Setze AI_PROVIDER=gemini + GEMINI_API_KEY oder AI_PROVIDER=openai + OPENAI_API_KEY in .env"
    );
  }
  if (!provider.isConfigured()) {
    const name = provider.name === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY";
    throw new Error(`${name} fehlt. Trage den Key in .env ein.`);
  }
  return provider;
}

async function chat(messages, req) {
  const provider = getProvider();
  try {
    const systemPrompt = await buildSystemPrompt(req);
    return await provider.chat(messages, systemPrompt);
  } catch (err) {
    if (provider.friendlyError) throw new Error(provider.friendlyError(err));
    throw err;
  }
}

function isConfigured() {
  return resolveProvider()?.isConfigured() ?? false;
}

function getStatus() {
  const provider = resolveProvider();
  if (!provider) {
    return { aiConfigured: false, provider: null, model: null };
  }
  return {
    aiConfigured: provider.isConfigured(),
    provider: provider.name,
    model: provider.getModel(),
  };
}

module.exports = { chat, isConfigured, getStatus, buildSystemPrompt };
