process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret";
process.env.MONGODB_URI = "mongodb://localhost:27017/test";
process.env.npm_package_version = "1.2.3";
process.env.BUILD_SHA = "abc1234567890";

const request = require("supertest");

let app;
beforeAll(() => {
  app = require("../../../server");
});

describe("GET /api/version", () => {
  it("returns 200 with version, env, and sha fields", async () => {
    const res = await request(app).get("/api/version");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      version: expect.any(String),
      env: expect.any(String),
      sha: expect.any(String),
    });
  });

  it("returns the correct env and sha values", async () => {
    const res = await request(app).get("/api/version");
    expect(res.body.env).toBe("test");
    expect(res.body.sha).toBe("abc1234567890");
  });
});
