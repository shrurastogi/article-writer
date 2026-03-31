/**
 * Integration tests for POST /api/suggest-sections.
 * The Groq API call is mocked so tests run without a real API key.
 */

const request = require("supertest");
const mongoose = require("mongoose");

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret";
process.env.GROQ_API_KEY = "test-key";

// Mock the openai client used by server.js before requiring the app
jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: '["Epidemiology", "Pathophysiology", "Diagnosis", "Treatment", "Novel Therapies", "Prognosis"]',
              },
            },
          ],
        }),
      },
    },
  }));
});

let app;
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../../../server");
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("POST /api/suggest-sections", () => {
  it("returns 400 when topic is missing", async () => {
    const res = await request(app)
      .post("/api/suggest-sections")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 when topic is blank", async () => {
    const res = await request(app)
      .post("/api/suggest-sections")
      .send({ topic: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns a suggestions array for a valid topic", async () => {
    const res = await request(app)
      .post("/api/suggest-sections")
      .send({ topic: "Multiple Myeloma" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(typeof res.body.suggestions[0]).toBe("string");
  });

  it("accepts existingSections without error", async () => {
    const res = await request(app)
      .post("/api/suggest-sections")
      .send({ topic: "Lupus Nephritis", existingSections: ["Introduction", "Pathophysiology"] });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });

  it("caps results at 10 even if LLM returns more", async () => {
    const OpenAI = require("openai");
    const mockCreate = OpenAI.mock.results[0].value.chat.completions.create;
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(Array.from({ length: 15 }, (_, i) => `Section ${i + 1}`)) } }],
    });
    const res = await request(app)
      .post("/api/suggest-sections")
      .send({ topic: "Chronic Lymphocytic Leukemia" });
    expect(res.status).toBe(200);
    expect(res.body.suggestions.length).toBeLessThanOrEqual(10);
  });
});
