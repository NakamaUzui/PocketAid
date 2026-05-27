const jwt = require("jsonwebtoken");

const COOKIE_NAME = "pocketaid_token";
const MAX_AGE_SEC = 30 * 24 * 60 * 60;

function getSecret() {
  const secret = process.env.JWT_SECRET?.trim() || process.env.SITE_PASSWORD?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET fehlt in .env (min. 32 Zeichen empfohlen).");
  }
  return secret;
}

function signUserToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    getSecret(),
    { expiresIn: "30d" }
  );
}

function verifyUserToken(token) {
  const payload = jwt.verify(token, getSecret());
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
  };
}

function setAuthCookie(res, token) {
  const secure =
    process.env.URL?.startsWith("https") ||
    process.env.ENABLE_BANKING_REDIRECT_URL?.startsWith("https") ||
    process.env.APP_BASE_URL?.startsWith("https") ||
    Boolean(process.env.VERCEL_URL) ||
    Boolean(process.env.VERCEL);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${
      secure ? "; Secure" : ""
    }`
  );
}

function clearAuthCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
}

function readTokenFromRequest(req) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  const cookie = req.headers.cookie || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

module.exports = {
  COOKIE_NAME,
  signUserToken,
  verifyUserToken,
  setAuthCookie,
  clearAuthCookie,
  readTokenFromRequest,
};
