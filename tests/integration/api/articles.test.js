/**
 * Integration tests for /api/articles endpoints.
 * MongoDB is provided by mongodb-memory-server (via jest globalSetup in tests/setup.js)
 * or by MONGODB_URI if already set in the environment (e.g. CI mongo:7 service).
 */

const request = require("supertest");
const mongoose = require("mongoose");
const User = require("../../../src/models/User");
const Article = require("../../../src/models/Article");

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret";
// MONGODB_URI is set by globalSetup (in-memory) or inherited from CI environment

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
  await Article.deleteMany({});
  await User.deleteMany({});
});

// Helper: register + login and return an authenticated agent
async function authenticatedAgent(email = "user@example.com", password = "password123") {
  const agent = request.agent(app);
  await agent.post("/auth/register").send({ name: "Test User", email, password });
  return agent;
}

// ── GET /api/articles ─────────────────────────────────────────────────────────

describe("GET /api/articles", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/articles");
    expect(res.status).toBe(401);
  });

  it("returns empty list for a new user", async () => {
    const agent = await authenticatedAgent();
    const res = await agent.get("/api/articles");
    expect(res.status).toBe(200);
    expect(res.body.articles).toEqual([]);
  });

  it("lists only the current user's articles", async () => {
    const agent1 = await authenticatedAgent("a@example.com");
    const agent2 = await authenticatedAgent("b@example.com");

    await agent1.post("/api/articles");
    await agent1.post("/api/articles");
    await agent2.post("/api/articles");

    const res = await agent1.get("/api/articles");
    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(2);
    // Summary fields only — no sections or library
    expect(res.body.articles[0]).not.toHaveProperty("sections");
    expect(res.body.articles[0]).not.toHaveProperty("library");
  });

  it("returns articles sorted by updatedAt descending", async () => {
    const agent = await authenticatedAgent();
    const r1 = await agent.post("/api/articles");
    const r2 = await agent.post("/api/articles");

    // Update r1 to make it more recent
    await agent.put(`/api/articles/${r1.body.article._id}`).send({ title: "Updated" });

    const res = await agent.get("/api/articles");
    expect(res.body.articles[0]._id).toBe(r1.body.article._id);
  });
});

// ── POST /api/articles ────────────────────────────────────────────────────────

describe("POST /api/articles", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app).post("/api/articles");
    expect(res.status).toBe(401);
  });

  it("creates a blank article and returns 201", async () => {
    const agent = await authenticatedAgent();
    const res = await agent.post("/api/articles");

    expect(res.status).toBe(201);
    expect(res.body.article).toHaveProperty("_id");
    expect(res.body.article.title).toBe("Untitled Article");
  });
});

// ── GET /api/articles/:id ─────────────────────────────────────────────────────

describe("GET /api/articles/:id", () => {
  it("returns 404 for a non-existent article", async () => {
    const agent = await authenticatedAgent();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await agent.get(`/api/articles/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it("returns 403 when accessing another user's article", async () => {
    const agent1 = await authenticatedAgent("owner@example.com");
    const agent2 = await authenticatedAgent("other@example.com");

    const create = await agent1.post("/api/articles");
    const articleId = create.body.article._id;

    const res = await agent2.get(`/api/articles/${articleId}`);
    expect(res.status).toBe(403);
  });

  it("returns the full article for the owner", async () => {
    const agent = await authenticatedAgent();
    const create = await agent.post("/api/articles");
    const articleId = create.body.article._id;

    const res = await agent.get(`/api/articles/${articleId}`);
    expect(res.status).toBe(200);
    expect(res.body.article._id).toBe(articleId);
    // Full article includes sections and library
    expect(res.body.article).toHaveProperty("sections");
    expect(res.body.article).toHaveProperty("library");
  });
});

// ── PUT /api/articles/:id ─────────────────────────────────────────────────────

describe("PUT /api/articles/:id", () => {
  it("updates article fields and recomputes wordCount", async () => {
    const agent = await authenticatedAgent();
    const create = await agent.post("/api/articles");
    const articleId = create.body.article._id;

    const res = await agent.put(`/api/articles/${articleId}`).send({
      title: "My Review",
      topic: "DLBCL",
      sections: {
        abstract: { prose: "Background: This is a review. Key Findings: Treatment advances. Conclusions: More research needed.", tables: [] },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.article.title).toBe("My Review");
    expect(res.body.article.topic).toBe("DLBCL");
    expect(res.body.article.wordCount).toBeGreaterThan(0);
  });

  it("returns 403 when updating another user's article", async () => {
    const agent1 = await authenticatedAgent("owner2@example.com");
    const agent2 = await authenticatedAgent("other2@example.com");

    const create = await agent1.post("/api/articles");
    const res = await agent2.put(`/api/articles/${create.body.article._id}`).send({ title: "Stolen" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for a non-existent article", async () => {
    const agent = await authenticatedAgent();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await agent.put(`/api/articles/${fakeId}`).send({ title: "Ghost" });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/articles/:id ──────────────────────────────────────────────────

describe("DELETE /api/articles/:id", () => {
  it("deletes the article and returns 204", async () => {
    const agent = await authenticatedAgent();
    const create = await agent.post("/api/articles");
    const articleId = create.body.article._id;

    const delRes = await agent.delete(`/api/articles/${articleId}`);
    expect(delRes.status).toBe(204);

    const getRes = await agent.get(`/api/articles/${articleId}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 403 when deleting another user's article", async () => {
    const agent1 = await authenticatedAgent("del-owner@example.com");
    const agent2 = await authenticatedAgent("del-other@example.com");

    const create = await agent1.post("/api/articles");
    const res = await agent2.delete(`/api/articles/${create.body.article._id}`);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/articles/:id/clone ──────────────────────────────────────────────

describe("POST /api/articles/:id/clone", () => {
  it("creates a copy with 'Copy of' prefix, new _id, same sections, returns 201", async () => {
    const agent = await authenticatedAgent("clone-owner@example.com");
    const create = await agent.post("/api/articles").send();
    const id = create.body.article._id;
    await agent.put(`/api/articles/${id}`).send({ title: "My Article", sections: { introduction: { prose: "Intro text." } } });

    const res = await agent.post(`/api/articles/${id}/clone`);
    expect(res.status).toBe(201);
    expect(res.body.article._id).not.toBe(id);
    expect(res.body.article.title).toBe("Copy of My Article");
  });

  it("returns 404 for a non-existent article", async () => {
    const agent = await authenticatedAgent("clone-404@example.com");
    const fakeId = new mongoose.Types.ObjectId();
    const res = await agent.post(`/api/articles/${fakeId}/clone`);
    expect(res.status).toBe(404);
  });

  it("returns 403 when cloning another user's article", async () => {
    const agent1 = await authenticatedAgent("clone-owner2@example.com");
    const agent2 = await authenticatedAgent("clone-other@example.com");
    const create = await agent1.post("/api/articles");
    const res = await agent2.post(`/api/articles/${create.body.article._id}/clone`);
    expect(res.status).toBe(403);
  });
});
