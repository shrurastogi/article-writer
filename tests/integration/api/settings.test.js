/**
 * Integration tests for /api/settings endpoints.
 */

const request = require("supertest");
const mongoose = require("mongoose");
const User = require("../../../src/models/User");

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret";

let app;
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../../../server");
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await User.deleteMany({});
});

async function authenticatedAgent(email = "settings@example.com", password = "password123") {
  const agent = request.agent(app);
  await agent.post("/auth/register").send({ name: "Settings User", email, password });
  return agent;
}

// ── GET /api/settings ─────────────────────────────────────────────────────────

describe("GET /api/settings", () => {
  it("returns safe settings object (no encrypted values)", async () => {
    const agent = await authenticatedAgent("s-get@example.com");
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("llmConfig");
    expect(res.body).toHaveProperty("researchConfig");
    expect(res.body).toHaveProperty("preferences");
    expect(res.body.llmConfig).not.toHaveProperty("encryptedApiKey");
    expect(res.body.llmConfig.hasKey).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
  });
});

// ── PUT /api/settings ─────────────────────────────────────────────────────────

describe("PUT /api/settings", () => {
  it("updates model and provider", async () => {
    const agent = await authenticatedAgent("s-put@example.com");
    const res = await agent.put("/api/settings").send({
      provider: "groq",
      model: "llama-3.1-8b-instant",
    });
    expect(res.status).toBe(200);
    expect(res.body.llmConfig.model).toBe("llama-3.1-8b-instant");
  });

  it("stores LLM API key and hasKey becomes true", async () => {
    const agent = await authenticatedAgent("s-key@example.com");
    const res = await agent.put("/api/settings").send({ apiKey: "gsk_test_key_1234567890" });
    expect(res.status).toBe(200);
    expect(res.body.llmConfig.hasKey).toBe(true);
  });

  it("updates preferences", async () => {
    const agent = await authenticatedAgent("s-pref@example.com");
    const res = await agent.put("/api/settings").send({
      preferences: { theme: "dark", fontSize: 16, language: "Spanish", strictMode: true },
    });
    expect(res.status).toBe(200);
    expect(res.body.preferences.theme).toBe("dark");
    expect(res.body.preferences.fontSize).toBe(16);
    expect(res.body.preferences.language).toBe("Spanish");
    expect(res.body.preferences.strictMode).toBe(true);
  });
});

// ── DELETE /api/settings/llm-key ─────────────────────────────────────────────

describe("DELETE /api/settings/llm-key", () => {
  it("removes the LLM key — hasKey becomes false", async () => {
    const agent = await authenticatedAgent("s-del-llm@example.com");
    await agent.put("/api/settings").send({ apiKey: "gsk_test_key_abc" });

    const delRes = await agent.delete("/api/settings/llm-key");
    expect(delRes.status).toBe(200);
    expect(delRes.body.hasKey).toBe(false);

    const getRes = await agent.get("/api/settings");
    expect(getRes.body.llmConfig.hasKey).toBe(false);
  });
});

// ── DELETE /api/settings/ncbi-key ────────────────────────────────────────────

describe("DELETE /api/settings/ncbi-key", () => {
  it("removes the NCBI key", async () => {
    const agent = await authenticatedAgent("s-del-ncbi@example.com");
    await agent.put("/api/settings").send({ ncbiKey: "ncbi_test_key_123" });

    const delRes = await agent.delete("/api/settings/ncbi-key");
    expect(delRes.status).toBe(200);
    expect(delRes.body.hasNcbiKey).toBe(false);
  });
});

// ── GET /api/llm/models ───────────────────────────────────────────────────────

describe("GET /api/llm/models", () => {
  it("returns list of models", async () => {
    const agent = await authenticatedAgent("s-models@example.com");
    const res = await agent.get("/api/llm/models");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.models)).toBe(true);
    expect(res.body.models.length).toBeGreaterThan(0);
    expect(res.body.models[0]).toHaveProperty("id");
    expect(res.body.models[0]).toHaveProperty("name");
  });
});

// ── Encryption roundtrip ──────────────────────────────────────────────────────

describe("encryptionService", () => {
  it("encrypt/decrypt roundtrip returns original text", () => {
    const { encrypt, decrypt } = require("../../../src/services/encryptionService");
    const original = "my-super-secret-api-key-12345678";
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.split(":")).toHaveLength(3);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });
});
