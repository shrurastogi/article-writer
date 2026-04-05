/**
 * Integration tests for export endpoints.
 * - DOCX: no mocking needed (docx is pure JS)
 * - PDF: pdfService.generatePdf is mocked
 */

const request = require("supertest");
const mongoose = require("mongoose");

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret";
process.env.GROQ_API_KEY = "test-key";

// Mock pdfService before requiring app so the route gets the mock
jest.mock("../../../src/services/pdfService", () => ({
  generatePdf: jest.fn().mockResolvedValue(Buffer.from("%PDF-test")),
}));

let app;
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../../../server");
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("POST /api/export-docx", () => {
  it("returns 200 with correct Content-Type for a valid article", async () => {
    const res = await request(app)
      .post("/api/export-docx")
      .send({
        title: "Test Article",
        authors: "John Smith",
        keywords: "test, myeloma",
        sections: [{ title: "Introduction", prose: "Some intro text." }],
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/
    );
  });

  it("returns 200 even with empty sections array", async () => {
    const res = await request(app)
      .post("/api/export-docx")
      .send({ title: "Empty Article", sections: [] });
    expect(res.status).toBe(200);
  });

  it("returns 200 when sections contain table HTML", async () => {
    const res = await request(app)
      .post("/api/export-docx")
      .send({
        title: "Table Article",
        sections: [
          {
            title: "Results",
            prose: "See table below.",
            table: "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>",
          },
        ],
      });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/export-pdf-server", () => {
  it("returns 200 with application/pdf when html is provided", async () => {
    const res = await request(app)
      .post("/api/export-pdf-server")
      .send({ html: "<h1>Test Article</h1><p>Body text.</p>", title: "Test Article" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
  });

  it("returns 400 when html is missing", async () => {
    const res = await request(app)
      .post("/api/export-pdf-server")
      .send({ title: "Test Article" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 when html is blank", async () => {
    const res = await request(app)
      .post("/api/export-pdf-server")
      .send({ html: "   ", title: "Test Article" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 500 when generatePdf throws", async () => {
    const { generatePdf } = require("../../../src/services/pdfService");
    generatePdf.mockRejectedValueOnce(new Error("Chromium not found"));
    const res = await request(app)
      .post("/api/export-pdf-server")
      .send({ html: "<p>content</p>", title: "Error Case" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/PDF generation failed/);
  });
});
