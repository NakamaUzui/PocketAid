const express = require("express");
const { hashPassword, verifyPassword } = require("../services/auth/password");
const {
  createUser,
  findUserByEmail,
  toPublicUser,
  normalizeEmail,
  findOrCreateOAuthUser,
  userHasPassword,
} = require("../services/auth/user-store");
const {
  signUserToken,
  setAuthCookie,
  clearAuthCookie,
  readTokenFromRequest,
  verifyUserToken,
} = require("../services/auth/token");
const {
  isGoogleConfigured,
  verifyGoogleIdToken,
  getClientId: getGoogleClientId,
} = require("../services/auth/google-verify");
const {
  isAppleConfigured,
  verifyAppleIdToken,
  getClientId: getAppleClientId,
} = require("../services/auth/apple-verify");
const { isSupabaseConfigured } = require("../services/db/client");

const router = express.Router();

function issueSession(res, user) {
  const token = signUserToken(user);
  setAuthCookie(res, token);
  return { user: toPublicUser(user), token };
}

router.get("/config", (_req, res) => {
  res.json({
    google: isGoogleConfigured(),
    apple: isAppleConfigured(),
    googleClientId: getGoogleClientId() || null,
    appleClientId: getAppleClientId() || null,
    storage: isSupabaseConfigured() ? "supabase" : "legacy",
  });
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    const norm = normalizeEmail(email);

    if (!norm || !norm.includes("@")) {
      return res.status(400).json({ error: "Gültige E-Mail eingeben." });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: "Passwort mindestens 8 Zeichen." });
    }

    const { salt, hash } = hashPassword(String(password));
    const user = await createUser({
      email: norm,
      name,
      passwordHash: hash,
      passwordSalt: salt,
    });

    res.status(201).json(issueSession(res, user));
  } catch (err) {
    if (err.code === "EMAIL_EXISTS" || err.code === "OAUTH_ACCOUNT") {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.includes("JWT_SECRET")) {
      return res.status(503).json({
        error: "Server nicht konfiguriert (JWT_SECRET fehlt auf Netlify).",
      });
    }
    console.error("[auth/register]", err.message);
    res.status(500).json({ error: "Registrierung fehlgeschlagen." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({ error: "E-Mail oder Passwort falsch." });
    }
    if (!userHasPassword(user)) {
      return res.status(401).json({
        error: "Dieses Konto nutzt Google oder Apple. Bitte dort anmelden.",
      });
    }
    if (!verifyPassword(String(password || ""), user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: "E-Mail oder Passwort falsch." });
    }

    res.json(issueSession(res, user));
  } catch (err) {
    console.error("[auth/login]", err.message);
    res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
  }
});

router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: "Google-Token fehlt." });
    }
    const profile = await verifyGoogleIdToken(idToken);
    if (!profile.email) {
      return res.status(400).json({ error: "Google-Konto ohne E-Mail." });
    }
    const user = await findOrCreateOAuthUser({
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });
    res.json(issueSession(res, user));
  } catch (err) {
    console.error("[auth/google]", err.message);
    const status = err.message.includes("nicht konfiguriert") ? 503 : 401;
    res.status(status).json({ error: err.message || "Google-Anmeldung fehlgeschlagen." });
  }
});

router.post("/apple", async (req, res) => {
  try {
    const { idToken, name } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: "Apple-Token fehlt." });
    }
    const profile = await verifyAppleIdToken(idToken);
    let displayName = "";
    if (name && typeof name === "object") {
      displayName = [name.firstName, name.lastName].filter(Boolean).join(" ");
    } else if (typeof name === "string") {
      displayName = name;
    }
    const user = await findOrCreateOAuthUser({
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
      name: displayName || profile.name,
      picture: null,
    });
    res.json(issueSession(res, user));
  } catch (err) {
    if (err.code === "OAUTH_NO_EMAIL") {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === "EMAIL_EXISTS") {
      return res.status(409).json({ error: err.message });
    }
    console.error("[auth/apple]", err.message);
    const status = err.message.includes("nicht konfiguriert") ? 503 : 401;
    res.status(status).json({ error: err.message || "Apple-Anmeldung fehlgeschlagen." });
  }
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  const token = readTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "Nicht angemeldet.", code: "UNAUTHORIZED" });
  }
  try {
    const user = verifyUserToken(token);
    res.json({ user });
  } catch {
    res.status(401).json({ error: "Sitzung abgelaufen.", code: "UNAUTHORIZED" });
  }
});

module.exports = router;
