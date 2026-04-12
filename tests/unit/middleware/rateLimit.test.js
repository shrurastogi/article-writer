process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret";
process.env.MONGODB_URI = "mongodb://localhost:27017/test";
process.env.GROQ_API_KEY = "test-key";

const request = require("supertest");
const express = require("express");
const aiRateLimit = require("../../../src/middleware/rateLimit");

const app = express();
app.use(aiRateLimit);
app.get("/test", (req, res) => res.json({ ok: true }));

describe("AI rate limiter", () => {
  it("allows requests under the limit", async () => {
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });

  it("returns 429 after exceeding 100 requests", async () => {
    const requests = Array.from({ length: 101 }, () => request(app).get("/test"));
    const responses = await Promise.all(requests);
    const tooMany = responses.filter(r => r.status === 429);
    expect(tooMany.length).toBeGreaterThan(0);
    expect(tooMany[0].body.error).toMatch(/too many requests/i);
  });
});
