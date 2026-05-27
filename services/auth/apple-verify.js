const appleSignin = require("apple-signin-auth");

function getClientId() {
  return process.env.APPLE_CLIENT_ID?.trim() || "";
}

function isAppleConfigured() {
  return Boolean(getClientId());
}

async function verifyAppleIdToken(idToken) {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error("Apple-Anmeldung ist nicht konfiguriert.");
  }
  const payload = await appleSignin.verifyIdToken(String(idToken), {
    audience: clientId,
    ignoreExpiration: false,
  });
  if (!payload?.sub) {
    throw new Error("Ungültiges Apple-Token.");
  }
  return {
    provider: "apple",
    providerId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: "",
  };
}

module.exports = { isAppleConfigured, verifyAppleIdToken, getClientId };
