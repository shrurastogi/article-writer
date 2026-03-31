/**
 * Jest global setup — starts an in-memory MongoDB instance before any tests run
 * and tears it down after all tests complete.
 *
 * If MONGODB_URI is already set in the environment (e.g. CI with a real mongo:7
 * service container or a developer pointing at Atlas), this setup is skipped and
 * that URI is used instead.
 */

const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

module.exports = {
  async setup() {
    if (process.env.MONGODB_URI) return; // already configured — skip
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env._MONGO_MEMORY_SERVER = "true"; // flag so teardown knows to stop it
  },

  async teardown() {
    if (process.env._MONGO_MEMORY_SERVER && mongod) {
      await mongod.stop();
    }
  },
};
