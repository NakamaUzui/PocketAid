const fs = require("fs");
const path = require("path");

const BLOB_STORE = "pocketaid-secrets";
const BLOB_KEY = "enable-banking-pem";

function isNetlifyRuntime() {
  return Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function readPemFromFile() {
  const keyPath = process.env.ENABLE_BANKING_PRIVATE_KEY_PATH?.trim();
  if (keyPath && fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, "utf8");
  }
  const defaultPath = path.join(__dirname, "..", "..", "keys", "enable-banking-production.pem");
  if (fs.existsSync(defaultPath)) {
    return fs.readFileSync(defaultPath, "utf8");
  }
  return null;
}

async function readPemFromBlob() {
  const { getStore } = require("@netlify/blobs");
  const store = getStore(BLOB_STORE);
  return store.get(BLOB_KEY, { type: "text" });
}

async function writePemToBlob(pem) {
  const { getStore } = require("@netlify/blobs");
  const store = getStore(BLOB_STORE);
  await store.set(BLOB_KEY, pem);
}

module.exports = {
  BLOB_STORE,
  BLOB_KEY,
  isNetlifyRuntime,
  readPemFromFile,
  readPemFromBlob,
  writePemToBlob,
};
