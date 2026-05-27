const serverless = require("serverless-http");
const { createApp } = require("../server/createApp");
const { ensurePrivateKey } = require("../services/enable-banking/client");

const app = createApp();
const handle = serverless(app);

module.exports = async (req, res) => {
  await ensurePrivateKey().catch(() => {});
  return handle(req, res);
};

