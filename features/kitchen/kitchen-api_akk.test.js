import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
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
          return (
            list.find((item) => {
              for (const [k, v] of Object.entries(q)) {
                if (k === "_id") {
                  if (item._id?.toString() !== v?.toString()) return false;
                } else if (item[k]?.toString() !== v?.toString()) {
                  return false;
                }
              }
              return true;
            }) || null
          );
        },
        async insertOne(doc) {
          const inserted = { _id: new ObjectId(), ...doc };
          list.push(inserted);
          return { insertedId: inserted._id };
        },
        async updateOne(q, update) {
          const index = list.findIndex((item) => {
            for (const [k, v] of Object.entries(q)) {
              if (k === "_id") {
                if (item._id?.toString() !== v?.toString()) return false;
              } else if (item[k]?.toString() !== v?.toString()) {
                return false;
              }
            }
            return true;
          });
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

    // Default authorized mess admin with assigned mess
    getSessionMock.mockResolvedValue({
      user: {
        id: "admin-1",
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-test",
        messId: "mess-test",
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
    expect(json.data.leftoverPortions).toBe(15);
    expect(json.data.hostelId).toBe("hostel-test");
    expect(json.data.messId).toBe("mess-test");
  });

  it("POST /api/kitchen/production rejects invalid portions served > prepared", async () => {
    const invalidReq = new Request("http://localhost:3000/api/kitchen/production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: "lunch",
        dishId: "dal-rice",
        dishName: "Dal",
        actualPrepared: 100,
        portionsServed: 150,
      }),
    });

    const res = await postProduction(invalidReq);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("GET /api/kitchen/production retrieves records scoped to admin hostel", async () => {
    // Seed one record
    mockDb.collection("kitchen_productions").insertOne({
      hostelId: "hostel-test",
      messId: "mess-test",
      date: "2026-11-06",
      slotId: "lunch",
      dishName: "Rice",
      actualPrepared: 100,
    });

    const req = new Request("http://localhost:3000/api/kitchen/production?date=2026-11-06");
    const res = await getProduction(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].hostelId).toBe("hostel-test");
    expect(json.data[0].messId).toBe("mess-test");
  });

  it("POST /api/kitchen/waste logs food waste and calculates cost", async () => {
    const req = new Request("http://localhost:3000/api/kitchen/waste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: "lunch",
        dishName: "Curd Rice",
        category: "Overproduction",
        weightKg: 5.0,
        reason: "Excess stock",
      }),
    });

    const res = await postWaste(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.costInr).toBe(400); // 5 * 80
    expect(json.data.portionsLost).toBe(15); // 5 * 3
    expect(json.data.hostelId).toBe("hostel-test");
    expect(json.data.messId).toBe("mess-test");
  });

  it("GET /api/kitchen/demand returns planning signals with safety buffer", async () => {
    const req = new Request("http://localhost:3000/api/kitchen/demand?slotId=lunch");
    const res = await getDemand(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.slotId).toBe("lunch");
    expect(json.data.recommendedTarget).toBeGreaterThan(json.data.totalStudentIntent);
    expect(json.data.hostelId).toBe("hostel-test");
    expect(json.data.messId).toBe("mess-test");
  });

  it("GET /api/kitchen/analytics returns food efficiency KPIs", async () => {
    const req = new Request("http://localhost:3000/api/kitchen/analytics");
    const res = await getAnalytics(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.efficiencyScore).toBeDefined();
    expect(json.meta.hostelId).toBe("hostel-test");
    expect(json.meta.messId).toBe("mess-test");
  });

  it("enforces assigned mess on MESS_ADMIN and prevents cross-mess tampering", async () => {
    const tamperReq = new Request("http://localhost:3000/api/kitchen/production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messId: "other-unauthorized-mess",
        slotId: "lunch",
        dishId: "dal",
        actualPrepared: 100,
        portionsServed: 90,
      }),
    });

    const res = await postProduction(tamperReq);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("MESS_SCOPE_REQUIRED");
  });

  it("PATCH /api/kitchen/production prevents updating another mess's production record", async () => {
    // Seed a production record belonging to mess-other
    const insertRes = await mockDb.collection("kitchen_productions").insertOne({
      hostelId: "hostel-test",
      messId: "mess-other",
      date: "2026-11-08",
      slotId: "lunch",
      dishName: "Paneer Butter Masala",
      actualPrepared: 100,
      portionsServed: 50,
      status: "Preparing",
    });

    const patchReq = new Request("http://localhost:3000/api/kitchen/production", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: insertRes.insertedId.toString(),
        portionsServed: 60,
        status: "Ready",
      }),
    });

    const res = await patchProduction(patchReq);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/not found or access denied/i);

    // Verify record in database remains unmodified
    const recordInDb = await mockDb.collection("kitchen_productions").findOne({
      _id: insertRes.insertedId,
    });
    expect(recordInDb.portionsServed).toBe(50);
    expect(recordInDb.status).toBe("Preparing");
  });

  it("PATCH /api/kitchen/production rejects tampering with messId in request body (403)", async () => {
    const patchReq = new Request("http://localhost:3000/api/kitchen/production", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "prod-123",
        messId: "mess-other",
        portionsServed: 60,
      }),
    });

    const res = await patchProduction(patchReq);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("MESS_SCOPE_REQUIRED");
  });
});
