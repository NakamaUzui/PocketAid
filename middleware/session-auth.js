const { readTokenFromRequest, verifyUserToken } = require("../services/auth/token");

const PUBLIC_API = new Set([
  "/api/health",
  "/api/auth/config",
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/google",
  "/api/auth/apple",
  "/api/banking/callback",
]);

function sessionAuth(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  if (PUBLIC_API.has(req.path)) return next();

  const token = readTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "Nicht angemeldet.", code: "UNAUTHORIZED" });
  }

  try {
    req.user = verifyUserToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Sitzung abgelaufen. Bitte erneut anmelden.", code: "UNAUTHORIZED" });
  }
}

module.exports = { sessionAuth };
