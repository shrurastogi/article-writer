/**
 * Jest globalTeardown — runs once in the main Jest process after all test workers finish.
 * Stops the in-memory MongoDB instance if one was started by globalSetup.
 */

module.exports = async () => {
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
};
