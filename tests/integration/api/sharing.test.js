/**
 * Integration tests for article sharing and collaborators.
 */

const request = require("supertest");
const mongoose = require("mongoose");
const User = require("../../../src/models/User");
const Article = require("../../../src/models/Article");

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
  await Article.deleteMany({});
  await User.deleteMany({});
});

async function authenticatedAgent(email = "share@example.com", password = "password123") {
  const agent = request.agent(app);
  await agent.post("/auth/register").send({ name: "Share User", email, password });
  return agent;
}

// ── POST /api/articles/:id/share ──────────────────────────────────────────────

describe("POST /api/articles/:id/share", () => {
  it("generates a share token and returns url", async () => {
    const agent = await authenticatedAgent("sh-gen@example.com");
    const create = await agent.post("/api/articles");
    const id = create.body.article._id;

    const res = await agent.post(`/api/articles/${id}/share`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("shareToken");
    expect(res.body.url).toContain("/share/");
  });

  it("is idempotent — returns same token on second call", async () => {
    const agent = await authenticatedAgent("sh-idem@example.com");
    const create = await agent.post("/api/articles");
    const id = create.body.article._id;

    const res1 = await agent.post(`/api/articles/${id}/share`);
    const res2 = await agent.post(`/api/articles/${id}/share`);
    expect(res1.body.shareToken).toBe(res2.body.shareToken);
  });

  it("returns 404 for another user's article", async () => {
    const agent1 = await authenticatedAgent("sh-owner@example.com");
    const agent2 = await authenticatedAgent("sh-other@example.com");
    const create = await agent1.post("/api/articles");
    const res = await agent2.post(`/api/articles/${create.body.article._id}/share`);
    expect(res.status).toBe(404);
  });
});

// ── GET /api/share/:token ─────────────────────────────────────────────────────

describe("GET /api/share/:token", () => {
  it("returns article data without authentication", async () => {
    const agent = await authenticatedAgent("sh-pub@example.com");
    const create = await agent.post("/api/articles");
    const id = create.body.article._id;
    await agent.put(`/api/articles/${id}`).send({ title: "Shared Review", topic: "Cancer" });

    const shareRes = await agent.post(`/api/articles/${id}/share`);
    const { shareToken } = shareRes.body;

    // Unauthenticated request
    const res = await request(app).get(`/api/share/${shareToken}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Shared Review");
    expect(res.body.topic).toBe("Cancer");
  });

  it("returns 404 for an invalid token", async () => {
    const res = await request(app).get("/api/share/invalid-token-xyz");
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/articles/:id/share ────────────────────────────────────────────

describe("DELETE /api/articles/:id/share", () => {
  it("revokes token — subsequent GET returns 404", async () => {
    const agent = await authenticatedAgent("sh-rev@example.com");
    const create = await agent.post("/api/articles");
    const id = create.body.article._id;

    const shareRes = await agent.post(`/api/articles/${id}/share`);
    const { shareToken } = shareRes.body;

    await agent.delete(`/api/articles/${id}/share`);

    const res = await request(app).get(`/api/share/${shareToken}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /api/articles/:id/collaborators ──────────────────────────────────────

describe("POST /api/articles/:id/collaborators", () => {
  it("adds a collaborator by email", async () => {
    const owner = await authenticatedAgent("collab-owner@example.com");
    const create = await owner.post("/api/articles");
    const id = create.body.article._id;

    // Register the invitee
    await request(app).post("/auth/register").send({ name: "Collab User", email: "collab-invitee@example.com", password: "password123" });

    const res = await owner.post(`/api/articles/${id}/collaborators`).send({ email: "collab-invitee@example.com", role: "viewer" });
    expect(res.status).toBe(200);
    expect(res.body.collaborators).toHaveLength(1);
    expect(res.body.collaborators[0].role).toBe("viewer");
  });

  it("returns 400 for missing or invalid role", async () => {
    const agent = await authenticatedAgent("collab-400@example.com");
    const create = await agent.post("/api/articles");
    const res = await agent.post(`/api/articles/${create.body.article._id}/collaborators`).send({ email: "x@x.com", role: "admin" });
    expect(res.status).toBe(400);
  });

  it("returns 404 if invitee email not registered", async () => {
    const agent = await authenticatedAgent("collab-404@example.com");
    const create = await agent.post("/api/articles");
    const res = await agent.post(`/api/articles/${create.body.article._id}/collaborators`).send({ email: "nobody@example.com", role: "viewer" });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/articles/:id/collaborators/:uid ───────────────────────────────

describe("DELETE /api/articles/:id/collaborators/:uid", () => {
  it("removes a collaborator", async () => {
    const owner = await authenticatedAgent("collab-del-owner@example.com");
    const create = await owner.post("/api/articles");
    const id = create.body.article._id;

    await request(app).post("/auth/register").send({ name: "To Remove", email: "collab-rem@example.com", password: "password123" });
    const addRes = await owner.post(`/api/articles/${id}/collaborators`).send({ email: "collab-rem@example.com", role: "editor" });
    const uid = addRes.body.collaborators[0]._userId;

    const delRes = await owner.delete(`/api/articles/${id}/collaborators/${uid}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.collaborators).toHaveLength(0);
  });
});
