/**
 * Schützt die App mit HTTP-Basic-Auth (Browser-Passwortabfrage).
 * Ausnahme: Bank-Callback (Enable Banking sendet kein Passwort).
 */
function sitePasswordGate(req, res, next) {
  const password = process.env.SITE_PASSWORD?.trim();
  if (!password) return next();

  const publicPaths = ["/api/banking/callback"];
  if (publicPaths.some((p) => req.path === p || req.path.startsWith(p + "?"))) {
    return next();
  }

  const header = req.headers.authorization;
  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    const pass = colon >= 0 ? decoded.slice(colon + 1) : decoded;
    if (pass === password) return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="PocketAid"');
  res.status(401).send("Zugang nur mit Passwort. Bitte erneut versuchen.");
}

module.exports = { sitePasswordGate };
