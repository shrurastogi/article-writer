/**
 * Integration tests for /auth endpoints.
 * MongoDB is provided by mongodb-memory-server (via jest globalSetup in tests/setup.js)
 * or by MONGODB_URI if already set in the environment (e.g. CI mongo:7 service).
 */

const request = require("supertest");
const mongoose = require("mongoose");
const User = require("../../../models/user");

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
  await User.deleteMany({});
});

// ── /auth/register ────────────────────────────────────────────────────────────

describe("POST /auth/register", () => {
  it("creates a new user and returns 201 with safe user object", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Alice", email: "alice@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.email).toBe("alice@example.com");
    expect(res.body.user.name).toBe("Alice");
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("returns 400 if email already exists", async () => {
    await request(app)
      .post("/auth/register")
      .send({ name: "Alice", email: "alice@example.com", password: "password123" });

    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Alice2", email: "alice@example.com", password: "password456" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("returns 400 if password is shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Bob", email: "bob@example.com", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it("returns 400 if required fields are missing", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "no-name@example.com", password: "password123" });

    expect(res.status).toBe(400);
  });

  it("normalises email to lowercase", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Carol", email: "Carol@Example.COM", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("carol@example.com");
  });
});

// ── /auth/login ───────────────────────────────────────────────────────────────

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await request(app)
      .post("/auth/register")
      .send({ name: "Dave", email: "dave@example.com", password: "correctpassword" });
  });

  it("returns 200 with user on valid credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "dave@example.com", password: "correctpassword" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.email).toBe("dave@example.com");
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("returns 401 on wrong password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "dave@example.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  it("returns 401 on unknown email", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" });

    expect(res.status).toBe(401);
  });
});

// ── /auth/me ──────────────────────────────────────────────────────────────────

describe("GET /auth/me", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });

  it("returns the current user when authenticated", async () => {
    const agent = request.agent(app);

    await agent
      .post("/auth/register")
      .send({ name: "Eve", email: "eve@example.com", password: "password123" });

    const res = await agent.get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("eve@example.com");
    expect(res.body).not.toHaveProperty("passwordHash");
  });
});

// ── /auth/logout ──────────────────────────────────────────────────────────────

describe("POST /auth/logout", () => {
  it("destroys session and redirects to /login", async () => {
    const agent = request.agent(app);

    await agent
      .post("/auth/register")
      .send({ name: "Frank", email: "frank@example.com", password: "password123" });

    const logoutRes = await agent.post("/auth/logout");
    expect(logoutRes.status).toBe(302);
    expect(logoutRes.headers.location).toBe("/login");

    // /auth/me should now be 401
    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(401);
  });
});
