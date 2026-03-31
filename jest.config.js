/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
  collectCoverageFrom: ["routes/**/*.js", "lib/**/*.js", "middleware/**/*.js", "models/**/*.js"],
  globalSetup: "./tests/setup.js",
  globalTeardown: "./tests/setup.js",
};
