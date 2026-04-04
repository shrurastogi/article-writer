process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret";
process.env.MONGODB_URI = "mongodb://localhost:27017/test";
process.env.GROQ_API_KEY = "test-key";

const { validateEnv } = require("../../server");

describe("validateEnv", () => {
  const REQUIRED = ["GROQ_API_KEY", "MONGODB_URI", "SESSION_SECRET"];

  it("does not throw when all required vars are set", () => {
    expect(() => validateEnv()).not.toThrow();
  });

  REQUIRED.forEach((varName) => {
    it(`throws with clear message when ${varName} is missing`, () => {
      const original = process.env[varName];
      delete process.env[varName];
      expect(() => validateEnv()).toThrow(varName);
      process.env[varName] = original;
    });
  });
});
