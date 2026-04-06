/**
 * Integration tests for /api/articles/:id/versions endpoints.
 */

const request = require("supertest");
const mongoose = require("mongoose");
const User = require("../../../src/models/User");
const Article = require("../../../src/models/Article");
const ArticleVersion = require("../../../src/models/ArticleVersion");

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
  await ArticleVersion.deleteMany({});
});

async function authenticatedAgent(email = "vers@example.com", password = "password123") {
  const agent = request.agent(app);
  await agent.post("/auth/register").send({ name: "Version User", email, password });
  return agent;
}

describe("GET /api/articles/:id/versions", () => {
  it("returns empty array for a new article", async () => {
    const agent = await authenticatedAgent("v-get@example.com");
    const create = await agent.post("/api/articles");
    const id = create.body.article._id;

    const res = await agent.get(`/api/articles/${id}/versions`);
    expect(res.status).toBe(200);
    expect(res.body.versions).toEqual([]);
  });

  it("returns 401 when not authenticated", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/articles/${fakeId}/versions`);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/articles/:id/versions", () => {
  it("creates a version snapshot and returns 201", async () => {
    const agent = await authenticatedAgent("v-create@example.com");
    const create = await agent.post("/api/articles");
    const id = create.body.article._id;
    await agent.put(`/api/articles/${id}`).send({ title: "With Content" });

    const res = await agent.post(`/api/articles/${id}/versions`).send({ label: "Draft v1" });
    expect(res.status).toBe(201);
    expect(res.body.version).toHaveProperty("_id");
    expect(res.body.version.label).toBe("Draft v1");
  });

  it("returns 404 for a non-existent article", async () => {
    const agent = await authenticatedAgent("v-404@example.com");
    const fakeId = new mongoose.Types.ObjectId();
    const res = await agent.post(`/api/articles/${fakeId}/versions`).send({});
    expect(res.status).toBe(404);
  });

  it("enforces cap of 50 — excess versions are deleted", async () => {
    const agent = await authenticatedAgent("v-cap@example.com");
    const create = await agent.post("/api/articles");
    const id = create.body.article._id;

    // Create 51 versions
    for (let i = 0; i < 51; i++) {
      await agent.post(`/api/articles/${id}/versions`).send({ label: `v${i}` });
    }

    const listRes = await agent.get(`/api/articles/${id}/versions`);
    expect(listRes.body.versions.length).toBeLessThanOrEqual(50);
  }, 30000);
});

describe("POST /api/articles/:id/versions/:vid/restore", () => {
  it("restores article sections from a version", async () => {
    const agent = await authenticatedAgent("v-restore@example.com");
    const create = await agent.post("/api/articles");
    const id = create.body.article._id;

    // Set initial content and snapshot it
    await agent.put(`/api/articles/${id}`).send({ sections: { abstract: { prose: "Original abstract.", tables: [] } } });
    const snapRes = await agent.post(`/api/articles/${id}/versions`).send({ label: "Snapshot" });
    const vid = snapRes.body.version._id;

    // Overwrite content
    await agent.put(`/api/articles/${id}`).send({ sections: { abstract: { prose: "Changed abstract.", tables: [] } } });

    // Restore
    const restoreRes = await agent.post(`/api/articles/${id}/versions/${vid}/restore`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.restored).toBe(true);

    // Verify restored content
    const articleRes = await agent.get(`/api/articles/${id}`);
    expect(articleRes.body.article.sections.abstract.prose).toBe("Original abstract.");
  });

  it("returns 404 for a non-existent version", async () => {
    const agent = await authenticatedAgent("v-restore-404@example.com");
    const create = await agent.post("/api/articles");
    const id = create.body.article._id;
    const fakeVid = new mongoose.Types.ObjectId();

    const res = await agent.post(`/api/articles/${id}/versions/${fakeVid}/restore`);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/articles/:id/versions/:vid", () => {
  it("deletes a version", async () => {
    const agent = await authenticatedAgent("v-delete@example.com");
    const create = await agent.post("/api/articles");
    const id = create.body.article._id;

    const snapRes = await agent.post(`/api/articles/${id}/versions`).send({});
    const vid = snapRes.body.version._id;

    const delRes = await agent.delete(`/api/articles/${id}/versions/${vid}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);

    const listRes = await agent.get(`/api/articles/${id}/versions`);
    expect(listRes.body.versions.find(v => v._id === vid)).toBeUndefined();
  });
});
