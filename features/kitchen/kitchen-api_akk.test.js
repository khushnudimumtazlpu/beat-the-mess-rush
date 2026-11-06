import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_ROLE, ACCOUNT_STATUS } from "../../lib/auth-contracts.js";

const { getMongoDbMock, getSessionMock } = vi.hoisted(() => ({
  getMongoDbMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map()),
}));
vi.mock("../../lib/mongodb.js", () => ({
  getMongoDb: getMongoDbMock,
  getMongoClient: vi.fn(),
}));
vi.mock("../../lib/auth.js", () => ({
  getAuth: vi.fn(async () => ({
    api: {
      getSession: getSessionMock,
    },
  })),
}));

const { GET: getProduction, POST: postProduction, PATCH: patchProduction } =
  await import("../../app/api/kitchen/production/production_akk.js");
const { GET: getWaste, POST: postWaste } =
  await import("../../app/api/kitchen/waste/waste_akk.js");
const { GET: getDemand } =
  await import("../../app/api/kitchen/demand/demand_akk.js");
const { GET: getAnalytics } =
  await import("../../app/api/kitchen/analytics/analytics_akk.js");

function createMockDb() {
  const collections = {
    kitchen_productions: [],
    kitchen_wastes: [],
    kitchen_demands: [],
  };

  return {
    collection(name) {
      if (!collections[name]) collections[name] = [];
      const list = collections[name];
      return {
        createIndex: vi.fn(async () => name),
        find() {
          return {
            sort: () => ({
              limit: () => ({ toArray: async () => list }),
              toArray: async () => list,
            }),
            limit: () => ({ toArray: async () => list }),
            toArray: async () => list,
          };
        },
        async findOne(q = {}) {
          if (q._id) {
            return list.find((i) => i._id?.toString() === q._id?.toString()) || null;
          }
          return list[0] || null;
        },
        async insertOne(doc) {
          const { ObjectId } = await import("mongodb");
          const inserted = { _id: new ObjectId(), ...doc };
          list.push(inserted);
          return { insertedId: inserted._id };
        },
        async updateOne(q, update) {
          const index = list.findIndex(
            (i) => i._id?.toString() === q._id?.toString()
          );
          if (index >= 0) {
            list[index] = { ...list[index], ...update.$set };
            return { modifiedCount: 1 };
          }
          return { modifiedCount: 0 };
        },
      };
    },
  };
}

describe("Kitchen API Route Handlers (_akk)", () => {
  let mockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    getMongoDbMock.mockResolvedValue(mockDb);

    // Default authorized mess admin
    getSessionMock.mockResolvedValue({
      user: {
        id: "admin-1",
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-test",
      },
    });
  });

  it("POST /api/kitchen/production creates production record and enforces validation", async () => {
    const validReq = new Request("http://localhost:3000/api/kitchen/production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: "lunch",
        dishId: "dal-rice",
        dishName: "Dal & Jeera Rice",
        plannedPortions: 200,
        actualPrepared: 210,
        portionsServed: 195,
        chef: "Chef Ramesh",
      }),
    });

    const res = await postProduction(validReq);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.dishName).toBe("Dal & Jeera Rice");
    expect(json.data.leftoverPortions).toBe(15);
  });

  it("POST /api/kitchen/production rejects invalid portions served > prepared", async () => {
    const invalidReq = new Request("http://localhost:3000/api/kitchen/production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: "lunch",
        dishId: "dal-rice",
        actualPrepared: 100,
        portionsServed: 150, // exceeds prepared
      }),
    });

    const res = await postProduction(invalidReq);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.details.portionsServed).toBe(
      "Portions served cannot exceed portions prepared."
    );
  });

  it("GET /api/kitchen/production retrieves records scoped to admin hostel", async () => {
    const req = new Request("http://localhost:3000/api/kitchen/production?slotId=lunch");
    const res = await getProduction(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("POST /api/kitchen/waste logs food waste and calculates cost", async () => {
    const req = new Request("http://localhost:3000/api/kitchen/waste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: "lunch",
        dishName: "Dal & Jeera Rice",
        category: "Overproduction",
        weightKg: 4.5,
        reason: "Rainy day attendance slump",
      }),
    });

    const res = await postWaste(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.weightKg).toBe(4.5);
    expect(json.data.costInr).toBe(360); // 4.5 * 80
  });

  it("GET /api/kitchen/demand returns planning signals with safety buffer", async () => {
    const req = new Request("http://localhost:3000/api/kitchen/demand?slotId=lunch");
    const res = await getDemand(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.slotId).toBe("lunch");
    expect(json.data.bufferPct).toBe(8);
  });

  it("GET /api/kitchen/analytics returns food efficiency KPIs", async () => {
    const req = new Request("http://localhost:3000/api/kitchen/analytics");
    const res = await getAnalytics(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.efficiencyScore).toBeDefined();
    expect(json.data.totalWasteKg).toBeDefined();
    expect(json.data.categoryBreakdown).toBeDefined();
  });
});
