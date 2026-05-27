const serverless = require("serverless-http");
const { connectLambda } = require("@netlify/blobs");
const { createApp } = require("../../server/createApp");
const { ensurePrivateKey } = require("../../services/enable-banking/client");

const app = createApp();
const handle = serverless(app);

module.exports.handler = async (event, context) => {
  connectLambda(event);
  await ensurePrivateKey().catch(() => {});
  return handle(event, context);
};
