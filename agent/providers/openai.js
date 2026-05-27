const OpenAI = require("openai");

let client = null;

function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY fehlt. Trage ihn in .env ein.");
  }
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function getModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

async function chat(messages, systemPrompt) {
  const openai = getClient();
  const sanitized = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

  const response = await openai.chat.completions.create({
    model: getModel(),
    temperature: 0.6,
    max_tokens: 500,
    messages: [{ role: "system", content: systemPrompt }, ...sanitized],
  });

  const reply = response.choices[0]?.message?.content?.trim();
  if (!reply) throw new Error("Keine Antwort von OpenAI erhalten.");
  return reply;
}

module.exports = { chat, isConfigured, getModel, name: "openai" };
