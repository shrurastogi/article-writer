/**
 * Integration tests for POST /api/agent/draft (SSE endpoint).
 */

const request = require("supertest");
const mongoose = require("mongoose");

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret";
process.env.GROQ_API_KEY = "test-key";

jest.mock("../../../src/services/llmService", () => {
  function makeStream() {
    return {
      [Symbol.asyncIterator]() {
        let done = false;
        return {
          async next() {
            if (done) return { done: true };
            done = true;
            return { done: false, value: { choices: [{ delta: { content: "draft content" } }] } };
          },
        };
      },
    };
  }
  return {
    createCompletion: jest.fn().mockResolvedValue(makeStream()),
    getClient: () => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue(makeStream()),
        },
      },
    }),
    MODEL: "test-model",
  };
});

let app;
beforeAll(() => {
  app = require("../../../src/app");
});
afterAll(async () => {
  await mongoose.disconnect();
});

const SECTIONS = [
  { id: "introduction", title: "Introduction", notes: "", userContext: "" },
  { id: "discussion", title: "Discussion", notes: "", userContext: "" },
];

describe("POST /api/agent/draft", () => {
  it("streams SSE events including section_done and complete", async () => {
    const res = await request(app)
      .post("/api/agent/draft")
      .send({ topic: "Multiple Myeloma", sections: SECTIONS });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.text).toContain("section_done");
    expect(res.text).toContain("complete");
  });

  it("returns 400 when topic is missing", async () => {
    const res = await request(app)
      .post("/api/agent/draft")
      .send({ sections: SECTIONS });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 when sections array is empty", async () => {
    const res = await request(app)
      .post("/api/agent/draft")
      .send({ topic: "Multiple Myeloma", sections: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
