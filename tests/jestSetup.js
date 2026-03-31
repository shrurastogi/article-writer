/**
 * setupFilesAfterFramework — runs in each Jest worker before each test file.
 * Reads the MongoDB URI written by globalSetup and sets it as an env var
 * for this worker process.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_FILE = path.join(os.tmpdir(), "jest-mongod-state.json");

if (!process.env.MONGODB_URI && fs.existsSync(STATE_FILE)) {
  const { uri } = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  process.env.MONGODB_URI = uri;
}
