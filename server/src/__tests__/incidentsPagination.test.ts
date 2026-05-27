import request from "supertest";
import express from "express";
import incidentsRouter from "../routes/incidents";

// ---------------------------------------------------------------------------
// Prisma mock — keyed by UUID so we can simulate multi-page results.
// ---------------------------------------------------------------------------
const makeIncident = (id: string, startedAt: Date) => ({
  id,
  protocol: "TestProtocol",
  severity: "HIGH",
  type: "PAUSE",
  title: `Incident ${id}`,
  description: "Test description",
  affectedVaults: [],
  resolved: false,
  startedAt,
  resolvedAt: null,
  createdAt: startedAt,
  updatedAt: startedAt,
});

// 25 incidents ordered newest-first (ids "id-01" … "id-25", dates descending)
const ALL_INCIDENTS = Array.from({ length: 25 }, (_, i) => {
  const n = 25 - i; // n goes 25, 24, … 1
  const id = `id-${String(n).padStart(2, "0")}`;
  const startedAt = new Date(2024, 0, n); // Jan n, 2024
  return makeIncident(id, startedAt);
});

jest.mock("@prisma/client", () => {
  const mockFindMany = jest.fn().mockImplementation(
    (args?: {
      where?: { id?: { lt?: string }; resolved?: boolean };
      take?: number;
      orderBy?: unknown;
    }) => {
      let pool = [...ALL_INCIDENTS];

      if (args?.where?.resolved !== undefined) {
        pool = pool.filter((i) => i.resolved === args.where!.resolved);
      }
      if (args?.where?.id?.lt) {
        const cursor = args.where.id.lt;
        const idx = pool.findIndex((i) => i.id === cursor);
        pool = idx >= 0 ? pool.slice(idx + 1) : [];
      }

      return Promise.resolve(args?.take ? pool.slice(0, args.take) : pool);
    },
  );

  return {
    PrismaClient: jest.fn(() => ({
      incident: { findMany: mockFindMany, findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      $disconnect: jest.fn(),
    })),
  };
});

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use("/api/incidents", incidentsRouter);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("GET /api/incidents — cursor pagination", () => {
  it("returns first page with default limit (20) and hasMore=true", async () => {
    const res = await request(app).get("/api/incidents");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.pagination.hasMore).toBe(true);
    expect(res.body.pagination.limit).toBe(20);
    expect(typeof res.body.pagination.nextCursor).toBe("string");
  });

  it("returns correct second page using nextCursor", async () => {
    const firstPage = await request(app).get("/api/incidents");
    const { nextCursor } = firstPage.body.pagination;

    const secondPage = await request(app).get(`/api/incidents?cursor=${nextCursor}`);

    expect(secondPage.status).toBe(200);
    // 25 total - 20 first page = 5 remaining
    expect(secondPage.body.data).toHaveLength(5);
    expect(secondPage.body.pagination.hasMore).toBe(false);
    expect(secondPage.body.pagination.nextCursor).toBeNull();
  });

  it("returns empty data array when cursor points past the last item", async () => {
    // Use a cursor that does not match any id → pool becomes empty after cursor filter
    const res = await request(app).get("/api/incidents?cursor=id-nonexistent");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.hasMore).toBe(false);
    expect(res.body.pagination.nextCursor).toBeNull();
  });

  it("respects a custom limit", async () => {
    const res = await request(app).get("/api/incidents?limit=5");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.hasMore).toBe(true);
  });

  it("clamps limit to maximum of 100", async () => {
    const res = await request(app).get("/api/incidents?limit=999");

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  it("uses default limit when limit param is invalid", async () => {
    const res = await request(app).get("/api/incidents?limit=abc");

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(20);
  });

  it("returns pagination shape on every response (data + pagination fields present)", async () => {
    const res = await request(app).get("/api/incidents?limit=3");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pagination");
    expect(res.body.pagination).toHaveProperty("nextCursor");
    expect(res.body.pagination).toHaveProperty("hasMore");
    expect(res.body.pagination).toHaveProperty("limit");
  });
});
