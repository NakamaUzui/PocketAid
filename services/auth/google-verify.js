const { OAuth2Client } = require("google-auth-library");

function getClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() || "";
}

function isGoogleConfigured() {
  return Boolean(getClientId());
}

async function verifyGoogleIdToken(idToken) {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error("Google-Anmeldung ist nicht konfiguriert.");
  }
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: String(idToken),
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new Error("Ungültiges Google-Token.");
  }
  return {
    provider: "google",
    providerId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    name: payload.name || payload.given_name || "",
    picture: payload.picture || null,
  };
}

module.exports = { isGoogleConfigured, verifyGoogleIdToken, getClientId };
