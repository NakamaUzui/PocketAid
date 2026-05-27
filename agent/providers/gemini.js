const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI = null;

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY fehlt. Trage ihn in .env ein.");
  }
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
}

function getModel() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
}

/**
 * Gemini verlangt: Verlauf startet mit "user", wechselt user/model.
 * Die UI-Begrüßung (erste assistant-Nachricht) wird nur angezeigt, nicht im Verlauf.
 */
function prepareGeminiMessages(messages) {
  const msgs = messages.filter((m) => m.role === "user" || m.role === "assistant");

  let start = 0;
  while (start < msgs.length && msgs[start].role === "assistant") {
    start++;
  }

  const trimmed = msgs.slice(start);
  if (trimmed.length === 0) {
    throw new Error("Keine Nutzernachricht vorhanden.");
  }

  const last = trimmed[trimmed.length - 1];
  if (last.role !== "user") {
    throw new Error("Letzte Nachricht muss vom Nutzer sein.");
  }

  const history = [];
  for (const m of trimmed.slice(0, -1)) {
    const role = m.role === "assistant" ? "model" : "user";
    const text = String(m.content).slice(0, 4000);

    if (history.length === 0 && role === "model") continue;

    const prev = history[history.length - 1];
    if (prev && prev.role === role) {
      prev.parts[0].text += "\n\n" + text;
      continue;
    }

    history.push({ role, parts: [{ text }] });
  }

  return { history, userMessage: String(last.content).slice(0, 4000) };
}

async function chat(messages, systemPrompt) {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: getModel(),
    systemInstruction: systemPrompt,
  });

  const { history, userMessage } = prepareGeminiMessages(messages);

  const session = model.startChat({ history });
  const result = await session.sendMessage(userMessage);
  const reply = result.response.text()?.trim();

  if (!reply) throw new Error("Keine Antwort von Gemini erhalten.");
  return reply;
}

function friendlyError(err) {
  const msg = err?.message || String(err);
  if (msg.includes("429") || msg.includes("quota") || msg.includes("Quota")) {
    return "Gemini-Kontingent erreicht. Warte 1 Minute oder prüfe https://ai.google.dev – Modell in .env: gemini-2.5-flash-lite";
  }
  if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
    return "Ungültiger GEMINI_API_KEY in .env. Neuen Key holen: https://aistudio.google.com/apikey";
  }
  if (msg.includes("404") || msg.includes("not found")) {
    return `Gemini-Modell nicht gefunden. In .env GEMINI_MODEL=gemini-2.5-flash-lite setzen.`;
  }
  return msg.replace(/\[GoogleGenerativeAI Error\]:\s*/i, "").slice(0, 200);
}

module.exports = { chat, isConfigured, getModel, friendlyError, name: "gemini" };
