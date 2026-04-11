/**
 * Integration tests for AI streaming endpoints.
 * The Groq client is mocked to return a fake async iterable stream.
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
            return { done: false, value: { choices: [{ delta: { content: "test content" } }] } };
          },
        };
      },
    };
  }
  return {
    MODEL: "test-model",
    createCompletion: jest.fn().mockResolvedValue(makeStream()),
    createCompletionForUser: jest.fn().mockResolvedValue(makeStream()),
    getClient: jest.fn().mockReturnValue({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue(makeStream()),
        },
      },
    }),
  };
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

describe("POST /api/generate", () => {
  it("streams content for a valid topic", async () => {
    const res = await request(app)
      .post("/api/generate")
      .send({ topic: "Multiple Myeloma", sectionId: "intro", sectionTitle: "Introduction" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("test content");
  });

  it("returns 400 when topic is missing", async () => {
    const res = await request(app)
      .post("/api/generate")
      .send({ sectionTitle: "Introduction" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("accepts language field without error", async () => {
    const res = await request(app)
      .post("/api/generate")
      .send({ topic: "Multiple Myeloma", sectionId: "intro", sectionTitle: "Introduction", language: "Spanish" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/improve", () => {
  it("streams improved content for valid input", async () => {
    const res = await request(app)
      .post("/api/improve")
      .send({ topic: "Multiple Myeloma", sectionTitle: "Introduction", content: "Some content." });
    expect(res.status).toBe(200);
    expect(res.text).toContain("test content");
  });

  it("returns 400 when content is missing", async () => {
    const res = await request(app)
      .post("/api/improve")
      .send({ topic: "Multiple Myeloma", sectionTitle: "Introduction" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 when topic is missing", async () => {
    const res = await request(app)
      .post("/api/improve")
      .send({ content: "Some content." });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe("POST /api/keypoints", () => {
  it("streams key points for a valid topic", async () => {
    const res = await request(app)
      .post("/api/keypoints")
      .send({ topic: "Multiple Myeloma", sectionTitle: "Treatment" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("test content");
  });

  it("returns 400 when topic is missing", async () => {
    const res = await request(app)
      .post("/api/keypoints")
      .send({ sectionTitle: "Treatment" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe("POST /api/refine", () => {
  it("streams refined content for valid input", async () => {
    const res = await request(app)
      .post("/api/refine")
      .send({ topic: "Multiple Myeloma", sectionTitle: "Treatment", currentDraft: "Draft text.", instruction: "Make it shorter." });
    expect(res.status).toBe(200);
    expect(res.text).toContain("test content");
  });

  it("returns 400 when instruction is missing", async () => {
    const res = await request(app)
      .post("/api/refine")
      .send({ topic: "Multiple Myeloma", sectionTitle: "Treatment", currentDraft: "Draft text." });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 when topic is missing", async () => {
    const res = await request(app)
      .post("/api/refine")
      .send({ sectionTitle: "Treatment", currentDraft: "Draft text.", instruction: "Shorter." });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe("POST /api/coherence-check", () => {
  it("streams coherence analysis for valid sections", async () => {
    const res = await request(app)
      .post("/api/coherence-check")
      .send({ topic: "Multiple Myeloma", sections: [{ title: "Introduction", prose: "Some intro." }] });
    expect(res.status).toBe(200);
    expect(res.text).toContain("test content");
  });

  it("returns 400 when sections is empty", async () => {
    const res = await request(app)
      .post("/api/coherence-check")
      .send({ topic: "Multiple Myeloma", sections: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 when sections is missing", async () => {
    const res = await request(app)
      .post("/api/coherence-check")
      .send({ topic: "Multiple Myeloma" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe("POST /api/generate-table", () => {
  it("streams table HTML for valid input", async () => {
    const res = await request(app)
      .post("/api/generate-table")
      .send({ topic: "Multiple Myeloma", sectionTitle: "Treatment", tableDescription: "Comparison of CAR-T therapies" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("test content");
  });

  it("returns 400 when tableDescription is missing", async () => {
    const res = await request(app)
      .post("/api/generate-table")
      .send({ topic: "Multiple Myeloma", sectionTitle: "Treatment" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 when topic is missing", async () => {
    const res = await request(app)
      .post("/api/generate-table")
      .send({ sectionTitle: "Treatment", tableDescription: "Some table" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe("POST /api/grammar-check", () => {
  it("streams grammar results for valid content", async () => {
    const res = await request(app)
      .post("/api/grammar-check")
      .send({ content: "The drug was administered by the physician.", topic: "Oncology", sectionTitle: "Treatment" });
    expect(res.status).toBe(200);
    expect(res.text).toBeDefined();
  });

  it("returns 400 when content is missing", async () => {
    const res = await request(app)
      .post("/api/grammar-check")
      .send({ topic: "Oncology" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
