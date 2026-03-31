/**
 * Jest globalSetup — runs once in the main Jest process before any test workers start.
 * Starts an in-memory MongoDB if MONGODB_URI is not already set (local dev without MongoDB).
 * Writes the URI to a temp file so test workers can read it via setupFilesAfterFramework.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_FILE = path.join(os.tmpdir(), "jest-mongod-state.json");

module.exports = async () => {
  if (process.env.MONGODB_URI) {
    // CI (mongo:7 service) or developer with Atlas — write URI so workers can read it
    fs.writeFileSync(STATE_FILE, JSON.stringify({ uri: process.env.MONGODB_URI, managed: false }));
    return;
  }

  // No MongoDB configured — start an in-memory instance
  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  fs.writeFileSync(STATE_FILE, JSON.stringify({ uri, managed: true }));

  // Keep reference for globalTeardown (same process)
  global.__MONGOD__ = mongod;
};
