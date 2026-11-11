import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { USER_ROLE, ACCOUNT_STATUS } from "../../lib/auth-contracts.js";
import {
  withBuffer,
  efficiencyScore,
  totalCostLoss,
  totalWasteKg,
  wasteByCategory,
  wasteTrendByDay,
  topWastedDishes,
  buildAnalyticsSummary,
} from "./utils/calculations-ak.js";
import { validateProduction, validateWaste } from "./utils/validation-ak.js";

// Hoisted mocks
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

// Import after mocks
const {
  getProductionRecords,
  createProductionRecord,
  updateProductionRecord,
  getWasteRecords,
  createWasteRecord,
  getDemandData,
  syncStudentDemandAggregate,
  ensureKitchenDemandRecord,
  ensureKitchenIndexes,
  resetKitchenIndexesCache,
  getKitchenAnalytics,
  KITCHEN_PRODUCTION_COLLECTION,
  KITCHEN_WASTE_COLLECTION,
  KITCHEN_DEMAND_COLLECTION,
} = await import("./services/kitchen-db_akk.js");

const { authorizeKitchenRequest } = await import("./utils/kitchen-auth_akk.js");

// In-memory MongoDB Mock Store
function createMockDb() {
  const collections = {
    [KITCHEN_PRODUCTION_COLLECTION]: [],
    [KITCHEN_WASTE_COLLECTION]: [],
    [KITCHEN_DEMAND_COLLECTION]: [],
  };

  function matchQuery(doc, query = {}) {
    for (const [key, val] of Object.entries(query)) {
      if (key === "_id") {
        if (doc._id?.toString() !== val?.toString()) return false;
        continue;
      }
      if (val && typeof val === "object" && "$gte" in val) {
        if (doc[key] < val.$gte) return false;
      }
      if (val && typeof val === "object" && "$lte" in val) {
        if (doc[key] > val.$lte) return false;
      }
      if (typeof val === "string" || typeof val === "number") {
        if (doc[key] !== val) return false;
      }
      if (val instanceof ObjectId) {
        if (!doc[key] || doc[key].toString() !== val.toString()) return false;
      }
    }
    return true;
  }

  function evalExpr(expr, doc) {
    if (expr === "$NOW") return new Date();
    if (typeof expr === "string" && expr.startsWith("$")) {
      return doc[expr.slice(1)];
    }
    if (typeof expr === "number" || typeof expr === "string" || typeof expr === "boolean") {
      return expr;
    }
    if (typeof expr !== "object" || expr === null) return expr;

    if ("$cond" in expr) {
      const { if: condIf, then: condThen, else: condElse } = expr.$cond;
      const condResult = evalExpr(condIf, doc);
      return condResult ? evalExpr(condThen, doc) : evalExpr(condElse, doc);
    }
    if ("$eq" in expr) {
      const [a, b] = expr.$eq;
      return evalExpr(a, doc) === evalExpr(b, doc);
    }
    if ("$max" in expr) {
      const vals = expr.$max.map((x) => evalExpr(x, doc));
      return Math.max(...vals);
    }
    if ("$round" in expr) {
      const [val, decimals] = expr.$round;
      const num = evalExpr(val, doc);
      return Number(Number(num).toFixed(decimals));
    }
    if ("$add" in expr) {
      const vals = expr.$add.map((x) => Number(evalExpr(x, doc)) || 0);
      return vals.reduce((sum, v) => sum + v, 0);
    }
    if ("$ifNull" in expr) {
      const [val, fallback] = expr.$ifNull;
      const evaluated = evalExpr(val, doc);
      return evaluated !== undefined && evaluated !== null ? evaluated : evalExpr(fallback, doc);
    }
    if ("$ceil" in expr) {
      return Math.ceil(evalExpr(expr.$ceil, doc));
    }
    if ("$multiply" in expr) {
      const [a, b] = expr.$multiply;
      return evalExpr(a, doc) * evalExpr(b, doc);
    }
    return expr;
  }

  const collectionInstances = {};

  return {
    collection(name) {
      if (collectionInstances[name]) return collectionInstances[name];
      if (!collections[name]) collections[name] = [];
      const list = collections[name];

      const instance = {
        createIndex: vi.fn(async () => name),
        find(query = {}) {
          const matched = list.filter((item) => matchQuery(item, query));
          return {
            sort: () => ({
              limit: (n) => ({
                toArray: async () => matched.slice(0, n),
              }),
              toArray: async () => matched,
            }),
            limit: (n) => ({
              toArray: async () => matched.slice(0, n),
            }),
            toArray: async () => matched,
          };
        },
        findOne: vi.fn(async (query = {}, options = {}) => {
          return list.find((item) => matchQuery(item, query)) || null;
        }),
        insertOne: vi.fn(async (doc, options = {}) => {
          const inserted = { _id: new ObjectId(), ...doc };
          list.push(inserted);
          return { insertedId: inserted._id };
        }),
        updateOne: vi.fn(async (query, update = {}, options = {}) => {
          const existingIndex = list.findIndex((item) => matchQuery(item, query));

          // Pipeline update support: update is an Array of stages [ { $set: ... }, ... ]
          if (Array.isArray(update)) {
            if (existingIndex >= 0) {
              const doc = { ...list[existingIndex] };
              for (const stage of update) {
                if (stage.$set) {
                  for (const [k, v] of Object.entries(stage.$set)) {
                    doc[k] = evalExpr(v, doc);
                  }
                }
              }
              list[existingIndex] = doc;
              return { matchedCount: 1, modifiedCount: 1 };
            }
            if (options.upsert) {
              const doc = { _id: new ObjectId(), ...query };
              for (const stage of update) {
                if (stage.$set) {
                  for (const [k, v] of Object.entries(stage.$set)) {
                    doc[k] = evalExpr(v, doc);
                  }
                }
              }
              list.push(doc);
              return { matchedCount: 0, upsertedCount: 1, upsertedId: doc._id };
            }
            return { matchedCount: 0, modifiedCount: 0 };
          }

          // Standard object update support
          if (existingIndex >= 0) {
            if (update.$set) {
              list[existingIndex] = { ...list[existingIndex], ...update.$set };
            }
            return { matchedCount: 1, modifiedCount: 1 };
          }
          if (options.upsert) {
            const newDoc = {
              _id: new ObjectId(),
              ...query,
              ...(update.$setOnInsert || {}),
              ...(update.$set || {}),
            };
            list.push(newDoc);
            return { matchedCount: 0, upsertedCount: 1, upsertedId: newDoc._id };
          }
          return { matchedCount: 0, modifiedCount: 0 };
        }),
      };

      collectionInstances[name] = instance;
      return instance;
    },
  };
}

describe("Kitchen Module: Calculations Engine", () => {
  it("computes recommended target with buffer", () => {
    expect(withBuffer(100, 8)).toBe(108);
    expect(withBuffer(210, 8)).toBe(227);
    expect(withBuffer(0, 8)).toBe(0);
  });

  it("calculates food efficiency score accurately capped at 100", () => {
    expect(efficiencyScore(100, 100)).toBe(100);
    expect(efficiencyScore(85, 100)).toBe(85);
    expect(efficiencyScore(214, 230)).toBe(93);
    expect(efficiencyScore(0, 100)).toBe(0);
    expect(efficiencyScore(50, 0)).toBe(0);
  });

  it("calculates total cost loss and waste weight", () => {
    const wastes = [
      { weightKg: 4.5, costInr: 360, category: "Overproduction", date: "2026-11-01", dishName: "Dal" },
      { weightKg: 2.0, costInr: 160, category: "Plate Waste", date: "2026-11-01", dishName: "Roti" },
      { weightKg: 1.5, costInr: 120, category: "Overproduction", date: "2026-11-02", dishName: "Dal" },
    ];

    expect(totalWasteKg(wastes)).toBe(8.0);
    expect(totalCostLoss(wastes)).toBe(640);
  });

  it("groups waste by category and day", () => {
    const wastes = [
      { weightKg: 4.0, costInr: 320, category: "Overproduction", date: "2026-11-01", dishName: "Dal" },
      { weightKg: 2.0, costInr: 160, category: "Plate Waste", date: "2026-11-01", dishName: "Roti" },
      { weightKg: 3.0, costInr: 240, category: "Overproduction", date: "2026-11-02", dishName: "Rice" },
    ];

    const cat = wasteByCategory(wastes);
    expect(cat.Overproduction.count).toBe(2);
    expect(cat.Overproduction.weightKg).toBe(7.0);
    expect(cat["Plate Waste"].count).toBe(1);

    const trend = wasteTrendByDay(wastes);
    expect(trend).toHaveLength(2);
    expect(trend[0].date).toBe("2026-11-01");
    expect(trend[0].wasteKg).toBe(6.0);
  });

  it("ranks top wasted dishes", () => {
    const wastes = [
      { weightKg: 5.0, costInr: 400, dishName: "Rice Bowl" },
      { weightKg: 2.5, costInr: 200, dishName: "Dal" },
      { weightKg: 4.0, costInr: 320, dishName: "Rice Bowl" },
    ];
    const top = topWastedDishes(wastes, 2);
    expect(top[0].dishName).toBe("Rice Bowl");
    expect(top[0].weightKg).toBe(9.0);
    expect(top[1].dishName).toBe("Dal");
  });
});

describe("Kitchen Module: Data Validation Rules", () => {
  it("validates production batches and enforces served <= prepared invariant", () => {
    // Valid
    const valid = validateProduction({
      dishId: "dal-rice",
      actualPrepared: 100,
      portionsServed: 95,
    });
    expect(Object.keys(valid)).toHaveLength(0);

    // Invariant: served cannot exceed prepared
    const invalidServed = validateProduction({
      dishId: "dal-rice",
      actualPrepared: 100,
      portionsServed: 120,
    });
    expect(invalidServed.portionsServed).toBe(
      "Portions served cannot exceed portions prepared."
    );

    // Required fields
    const missing = validateProduction({
      dishId: "",
      actualPrepared: 0,
      portionsServed: -5,
    });
    expect(missing.dishId).toBeDefined();
    expect(missing.actualPrepared).toBeDefined();
    expect(missing.portionsServed).toBeDefined();
  });

  it("validates food waste records and enforces minimum 0.1 kg", () => {
    const valid = validateWaste({
      slotId: "lunch",
      dishName: "Curd Rice",
      category: "Overproduction",
      weightKg: 2.5,
      reason: "Unexpected rainy weather reduced campus attendance",
    });
    expect(Object.keys(valid)).toHaveLength(0);

    // Too small weight
    const tooSmall = validateWaste({
      slotId: "lunch",
      dishName: "Curd Rice",
      category: "Overproduction",
      weightKg: 0.05,
      reason: "Small scrape",
    });
    expect(tooSmall.weightKg).toBe("Weight must be at least 0.1 kg.");

    // Missing reason
    const noReason = validateWaste({
      slotId: "lunch",
      dishName: "Curd Rice",
      category: "Overproduction",
      weightKg: 3.0,
      reason: "",
    });
    expect(noReason.reason).toBe("Reason is required.");
  });
});

describe("Kitchen Module: Database Persistence & Multi-Tenant Isolation", () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockDb();
    getMongoDbMock.mockResolvedValue(mockDb);
  });

  it("creates and retrieves daily food production records scoped to hostel", async () => {
    const record1 = await createProductionRecord({
      hostelId: "hostel-alpha",
      messId: "mess-1",
      date: "2026-11-06",
      slotId: "lunch",
      dishId: "dal-rice",
      dishName: "Dal & Jeera Rice",
      plannedPortions: 200,
      actualPrepared: 210,
      portionsServed: 195,
      chef: "Chef Ramesh",
    });

    expect(record1.id).toBeDefined();
    expect(record1.leftoverPortions).toBe(15);
    expect(record1.hostelId).toBe("hostel-alpha");

    // Second record in a different hostel
    await createProductionRecord({
      hostelId: "hostel-beta",
      messId: "mess-2",
      date: "2026-11-06",
      slotId: "lunch",
      dishId: "paneer",
      dishName: "Paneer Roti",
      plannedPortions: 150,
      actualPrepared: 155,
      portionsServed: 140,
    });

    // Query hostel-alpha only
    const alphaRecords = await getProductionRecords({ hostelId: "hostel-alpha" });
    expect(alphaRecords).toHaveLength(1);
    expect(alphaRecords[0].dishId).toBe("dal-rice");

    // Query hostel-beta only
    const betaRecords = await getProductionRecords({ hostelId: "hostel-beta" });
    expect(betaRecords).toHaveLength(1);
    expect(betaRecords[0].dishId).toBe("paneer");
  });

  it("updates production status and portions served while enforcing limits", async () => {
    const created = await createProductionRecord({
      hostelId: "hostel-alpha",
      messId: "mess-1",
      slotId: "dinner",
      dishId: "khichdi",
      dishName: "Khichdi",
      actualPrepared: 100,
      portionsServed: 50,
      status: "Preparing",
    });

    // Update status to Ready and portionsServed to 80
    const updated = await updateProductionRecord(created.id, {
      hostelId: "hostel-alpha",
      status: "Ready",
      portionsServed: 80,
    });

    expect(updated.status).toBe("Ready");
    expect(updated.portionsServed).toBe(80);
    expect(updated.leftoverPortions).toBe(20);

    // Attempting to exceed prepared count must fail
    await expect(
      updateProductionRecord(created.id, {
        hostelId: "hostel-alpha",
        portionsServed: 150,
      })
    ).rejects.toThrow("Portions served cannot exceed portions prepared.");

    // Attempting cross-hostel update must fail
    await expect(
      updateProductionRecord(created.id, {
        hostelId: "wrong-hostel",
        messId: "mess-1",
        status: "Completed",
      })
    ).rejects.toThrow("Production record not found or access denied.");

    // Attempting cross-mess update must fail
    await expect(
      updateProductionRecord(created.id, {
        hostelId: "hostel-alpha",
        messId: "wrong-mess",
        status: "Completed",
      })
    ).rejects.toThrow("Production record not found or access denied.");
  });

  it("persists food waste records and computes cost loss and portions lost", async () => {
    const waste = await createWasteRecord({
      hostelId: "hostel-alpha",
      messId: "mess-1",
      date: "2026-11-06",
      slotId: "lunch",
      dishName: "Dal & Jeera Rice",
      category: "Overproduction",
      weightKg: 5.0,
      reason: "End-of-service surplus",
    });

    expect(waste.id).toBeDefined();
    expect(waste.weightKg).toBe(5.0);
    expect(waste.portionsLost).toBe(15); // 5 * 3
    expect(waste.costInr).toBe(400); // 5 * 80

    const records = await getWasteRecords({ hostelId: "hostel-alpha" });
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe("Overproduction");
  });

  it("generates comprehensive kitchen analytics from real database records", async () => {
    await createProductionRecord({
      hostelId: "hostel-alpha",
      messId: "mess-alpha",
      slotId: "lunch",
      dishId: "dal",
      actualPrepared: 200,
      portionsServed: 180,
    });

    await createWasteRecord({
      hostelId: "hostel-alpha",
      messId: "mess-alpha",
      slotId: "lunch",
      dishName: "Dal",
      category: "Overproduction",
      weightKg: 4.0,
      reason: "Surplus",
    });

    const analytics = await getKitchenAnalytics({ hostelId: "hostel-alpha", messId: "mess-alpha" });
    expect(analytics.totalCooked).toBe(200);
    expect(analytics.totalServed).toBe(180);
    expect(analytics.efficiencyScore).toBe(90);
    expect(analytics.totalWasteKg).toBe(4.0);
    expect(analytics.totalCostLossInr).toBe(320);
    expect(analytics.mealBreakdown).toHaveLength(1);
    expect(analytics.mealBreakdown[0].slot).toBe("lunch");
  });

  it("provides meal demand planning signals with safety buffer", async () => {
    const demand = await getDemandData({
      hostelId: "hostel-alpha",
      messId: "mess-alpha",
      slotId: "lunch",
    });

    expect(demand.slotId).toBe("lunch");
    expect(demand.totalStudentIntent).toBeGreaterThan(0);
    expect(demand.bufferPct).toBe(8);
    expect(demand.recommendedTarget).toBe(withBuffer(demand.totalStudentIntent, 8));
  });

  it("enforces demand isolation between different messes in the same hostel", async () => {
    const demandMessA = await getDemandData({
      hostelId: "hostel-alpha",
      messId: "mess-A",
      slotId: "lunch",
    });

    const demandMessB = await getDemandData({
      hostelId: "hostel-alpha",
      messId: "mess-B",
      slotId: "lunch",
    });

    expect(demandMessA.messId).toBe("mess-A");
    expect(demandMessB.messId).toBe("mess-B");
    expect(demandMessA.id).not.toBe(demandMessB.id);
  });

  it("seeds baseline demand with source: BASELINE and replaces with STUDENT_DEMAND on first student submission", async () => {
    // 1. Initial fetch without student opt-in returns baseline demand tagged with source: BASELINE
    const baseline = await getDemandData({
      hostelId: "hostel-sync",
      messId: "mess-sync",
      date: "2026-11-10",
      slotId: "dinner",
    });
    expect(baseline.source).toBe("BASELINE");
    expect(baseline.totalStudentIntent).toBe(310); // Illustrative template baseline

    // 2. First real student submits a Large portion (1.5) -> Replaces baseline entirely
    const syncedFirst = await syncStudentDemandAggregate({
      hostelId: "hostel-sync",
      messId: "mess-sync",
      date: "2026-11-10",
      slotId: "dinner",
      portionDelta: 1.5,
    });

    expect(syncedFirst.source).toBe("STUDENT_DEMAND");
    expect(syncedFirst.totalStudentIntent).toBe(1.5);
    expect(syncedFirst.recommendedTarget).toBe(2); // Math.ceil(1.5 * 1.08) = 2

    // 3. Second student submits a Regular portion (1.0) -> Increments total to 2.5
    const syncedSecond = await syncStudentDemandAggregate({
      hostelId: "hostel-sync",
      messId: "mess-sync",
      date: "2026-11-10",
      slotId: "dinner",
      portionDelta: 1.0,
    });

    expect(syncedSecond.totalStudentIntent).toBe(2.5);
    expect(syncedSecond.recommendedTarget).toBe(3); // Math.ceil(2.5 * 1.08) = 3

    // 4. Portion preference change (Regular to Large: delta +0.5) -> 3.0
    const syncedChange = await syncStudentDemandAggregate({
      hostelId: "hostel-sync",
      messId: "mess-sync",
      date: "2026-11-10",
      slotId: "dinner",
      portionDelta: 0.5,
    });
    expect(syncedChange.totalStudentIntent).toBe(3.0);
    expect(syncedChange.recommendedTarget).toBe(4); // Math.ceil(3.0 * 1.08) = 4

    // 5. Student cancels Large portion (-1.5) -> Decrements to 1.5
    const syncedCancel = await syncStudentDemandAggregate({
      hostelId: "hostel-sync",
      messId: "mess-sync",
      date: "2026-11-10",
      slotId: "dinner",
      portionDelta: -1.5,
    });

    expect(syncedCancel.totalStudentIntent).toBe(1.5);
    expect(syncedCancel.recommendedTarget).toBe(2); // Math.ceil(1.5 * 1.08) = 2

    // 6. Excessive cancellation -> Floored at 0 (never negative)
    const syncedFloor = await syncStudentDemandAggregate({
      hostelId: "hostel-sync",
      messId: "mess-sync",
      date: "2026-11-10",
      slotId: "dinner",
      portionDelta: -100,
    });
    expect(syncedFloor.totalStudentIntent).toBe(0);
    expect(syncedFloor.recommendedTarget).toBe(0);
  });

  it("supports idempotent synchronization with absolute totalIntent", async () => {
    // Calling with explicit totalIntent sets exact value idempotently
    const res1 = await syncStudentDemandAggregate({
      hostelId: "hostel-idempotent",
      messId: "mess-idempotent",
      date: "2026-11-10",
      slotId: "lunch",
      totalIntent: 142.5,
    });

    expect(res1.source).toBe("STUDENT_DEMAND");
    expect(res1.totalStudentIntent).toBe(142.5);
    expect(res1.recommendedTarget).toBe(154); // Math.ceil(142.5 * 1.08) = 154

    // Duplicate/retry call with same totalIntent produces identical result
    const res2 = await syncStudentDemandAggregate({
      hostelId: "hostel-idempotent",
      messId: "mess-idempotent",
      date: "2026-11-10",
      slotId: "lunch",
      totalIntent: 142.5,
    });

    expect(res2.totalStudentIntent).toBe(142.5);
    expect(res2.recommendedTarget).toBe(154);
  });

  it("propagates transaction session to all database operations in syncStudentDemandAggregate and getDemandData", async () => {
    const mockSession = { id: "mock-tx-session-token-xyz" };
    const demandCollection = (await getMongoDbMock()).collection(KITCHEN_DEMAND_COLLECTION);
    const findOneSpy = vi.spyOn(demandCollection, "findOne");
    const updateOneSpy = vi.spyOn(demandCollection, "updateOne");

    // 1. Test getDemandData with session
    await getDemandData(
      {
        hostelId: "hostel-tx",
        messId: "mess-tx",
        date: "2026-11-10",
        slotId: "breakfast",
      },
      { session: mockSession }
    );

    // Verify session passed to findOne in getDemandData
    expect(findOneSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: mockSession })
    );

    // 2. Test syncStudentDemandAggregate with session
    await syncStudentDemandAggregate(
      {
        hostelId: "hostel-tx",
        messId: "mess-tx",
        date: "2026-11-10",
        slotId: "breakfast",
        portionDelta: 2.0,
      },
      { session: mockSession }
    );

    // Verify session passed to updateOne in syncStudentDemandAggregate
    expect(updateOneSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ session: mockSession })
    );

    findOneSpy.mockRestore();
    updateOneSpy.mockRestore();
  });

  it("ensures kitchen indexes rethrow errors on unique-index or database creation failure", async () => {
    resetKitchenIndexesCache();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failingDb = {
      collection: () => ({
        createIndex: vi.fn(async () => {
          throw new Error("E11000 index build failed: duplicate key on unique index");
        }),
      }),
    };

    await expect(ensureKitchenIndexes(failingDb)).rejects.toThrow(
      "E11000 index build failed: duplicate key on unique index"
    );
    errorSpy.mockRestore();
    resetKitchenIndexesCache();
  });

  it("avoids running index DDL operations when a transaction session is provided", async () => {
    const mockSession = { id: "session-no-ddl-test" };
    const demandCol = mockDb.collection(KITCHEN_DEMAND_COLLECTION);
    const createIndexSpy = vi.spyOn(demandCol, "createIndex");

    // Call syncStudentDemandAggregate with transaction session
    await syncStudentDemandAggregate(
      {
        hostelId: "hostel-tx-ddl",
        messId: "mess-tx-ddl",
        date: "2026-11-10",
        slotId: "lunch",
        portionDelta: 1.0,
      },
      { session: mockSession }
    );

    // Verify DDL createIndex was NOT invoked inside the transaction flow
    expect(createIndexSpy).not.toHaveBeenCalled();

    createIndexSpy.mockRestore();
  });

  it("propagates errors directly out of syncStudentDemandAggregate when session is provided instead of retrying on aborted session", async () => {
    const mockSession = { id: "session-abort-test" };
    const demandCol = mockDb.collection(KITCHEN_DEMAND_COLLECTION);
    let attempts = 0;
    const originalUpdateOne = demandCol.updateOne;

    demandCol.updateOne = vi.fn(async (...args) => {
      attempts++;
      const dupError = new Error("E11000 duplicate key error in transaction");
      dupError.code = 11000;
      dupError.codeName = "DuplicateKey";
      throw dupError;
    });

    // When session is supplied, the error must immediately propagate out to the outer
    // transaction boundary (e.g. session.withTransaction()) rather than attempting
    // unsafe retries on an aborted MongoDB session.
    await expect(
      syncStudentDemandAggregate(
        {
          hostelId: "hostel-tx-error",
          messId: "mess-tx-error",
          date: "2026-11-10",
          slotId: "dinner",
          portionDelta: 1.0,
        },
        { session: mockSession }
      )
    ).rejects.toThrow("E11000 duplicate key error in transaction");

    // Verify only 1 attempt was made inside the function (no internal retry loop on aborted session)
    expect(attempts).toBe(1);

    demandCol.updateOne = originalUpdateOne;
  });

  it("pre-initializes kitchen demand and indexes with ensureKitchenDemandRecord outside transactions", async () => {
    const initialized = await ensureKitchenDemandRecord({
      hostelId: "hostel-preinit",
      messId: "mess-preinit",
      date: "2026-11-10",
      slotId: "dinner",
    });

    expect(initialized).toBeDefined();
    expect(initialized.source).toBe("BASELINE");
    expect(initialized.totalStudentIntent).toBe(310); // dinner baseline

    // Subsequent transactional call now updates the existing document in-place
    const mockSession = { id: "session-after-init" };
    const updated = await syncStudentDemandAggregate(
      {
        hostelId: "hostel-preinit",
        messId: "mess-preinit",
        date: "2026-11-10",
        slotId: "dinner",
        portionDelta: 1.0,
      },
      { session: mockSession }
    );

    expect(updated.source).toBe("STUDENT_DEMAND");
    expect(updated.totalStudentIntent).toBe(1.0);
  });

  it("handles concurrent baseline upsert races (E11000 duplicate key) safely without failing or losing demand", async () => {
    const demandCol = mockDb.collection(KITCHEN_DEMAND_COLLECTION);
    let attempts = 0;
    const originalUpdateOne = demandCol.updateOne;

    // Simulate an E11000 race on the first attempt when two concurrent threads race to insert
    demandCol.updateOne = vi.fn(async (...args) => {
      attempts++;
      if (attempts === 1) {
        const dupError = new Error("E11000 duplicate key error collection: kitchen_demands");
        dupError.code = 11000;
        dupError.codeName = "DuplicateKey";
        throw dupError;
      }
      return originalUpdateOne.apply(demandCol, args);
    });

    const result = await syncStudentDemandAggregate({
      hostelId: "hostel-race",
      messId: "mess-race",
      date: "2026-11-10",
      slotId: "dinner",
      portionDelta: 1.5,
    });

    expect(attempts).toBe(2); // First failed with E11000, second succeeded on retry
    expect(result.source).toBe("STUDENT_DEMAND");
    expect(result.totalStudentIntent).toBe(1.5);
    expect(result.recommendedTarget).toBe(Math.ceil(1.5 * 1.08));

    demandCol.updateOne = originalUpdateOne;
  });

  it("handles high-volume concurrent increments, modifications, and cancellations with exact expected totals", async () => {
    // 1. Seed illustrative baseline demand (lunch baseline is 420)
    const baselineRecord = await getDemandData({
      hostelId: "hostel-exact",
      messId: "mess-exact",
      date: "2026-11-10",
      slotId: "lunch",
    });
    expect(baselineRecord.source).toBe("BASELINE");
    expect(baselineRecord.totalStudentIntent).toBe(420);

    // 2. Fire 10 simultaneous student demands with a mix of:
    // - 5 Regular opt-ins (+1.0 each)
    // - 2 Large opt-ins (+1.5 each)
    // - 1 Portion upgrade from Regular to Large (+0.5)
    // - 2 Cancellations (-1.0 each)
    //
    // Mathematical Expected Intent:
    // First arrival atomically replaces the 420 baseline.
    // Sum = (5 * 1.0) + (2 * 1.5) + (1 * 0.5) - (2 * 1.0)
    //     = 5.0 + 3.0 + 0.5 - 2.0 = 6.5
    // Recommended Target with 8% buffer: Math.ceil(6.5 * 1.08) = Math.ceil(7.02) = 8
    const concurrentRequests = [
      syncStudentDemandAggregate({ hostelId: "hostel-exact", messId: "mess-exact", date: "2026-11-10", slotId: "lunch", portionDelta: 1.0 }),
      syncStudentDemandAggregate({ hostelId: "hostel-exact", messId: "mess-exact", date: "2026-11-10", slotId: "lunch", portionDelta: 1.0 }),
      syncStudentDemandAggregate({ hostelId: "hostel-exact", messId: "mess-exact", date: "2026-11-10", slotId: "lunch", portionDelta: 1.0 }),
      syncStudentDemandAggregate({ hostelId: "hostel-exact", messId: "mess-exact", date: "2026-11-10", slotId: "lunch", portionDelta: 1.0 }),
      syncStudentDemandAggregate({ hostelId: "hostel-exact", messId: "mess-exact", date: "2026-11-10", slotId: "lunch", portionDelta: 1.0 }),
      syncStudentDemandAggregate({ hostelId: "hostel-exact", messId: "mess-exact", date: "2026-11-10", slotId: "lunch", portionDelta: 1.5 }),
      syncStudentDemandAggregate({ hostelId: "hostel-exact", messId: "mess-exact", date: "2026-11-10", slotId: "lunch", portionDelta: 1.5 }),
      syncStudentDemandAggregate({ hostelId: "hostel-exact", messId: "mess-exact", date: "2026-11-10", slotId: "lunch", portionDelta: 0.5 }),
      syncStudentDemandAggregate({ hostelId: "hostel-exact", messId: "mess-exact", date: "2026-11-10", slotId: "lunch", portionDelta: -1.0 }),
      syncStudentDemandAggregate({ hostelId: "hostel-exact", messId: "mess-exact", date: "2026-11-10", slotId: "lunch", portionDelta: -1.0 }),
    ];

    await Promise.all(concurrentRequests);

    // 3. Final demand document must match the exact mathematical accumulator
    const finalRecord = await getDemandData({
      hostelId: "hostel-exact",
      messId: "mess-exact",
      date: "2026-11-10",
      slotId: "lunch",
    });

    expect(finalRecord.source).toBe("STUDENT_DEMAND");
    expect(finalRecord.totalStudentIntent).toBe(6.5);
    expect(finalRecord.recommendedTarget).toBe(8);
  });
});

describe("Kitchen Module: Role-Based Authorization & Tenant Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows active MESS_ADMIN to access their assigned hostel and mess", async () => {
    getSessionMock.mockResolvedValue({
      user: {
        id: "admin-1",
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-101",
        messId: "mess-101",
      },
    });

    const auth = await authorizeKitchenRequest();
    expect(auth.hostelId).toBe("hostel-101");
    expect(auth.messId).toBe("mess-101");
    expect(auth.user.role).toBe(USER_ROLE.MESS_ADMIN);
  });

  it("prevents MESS_ADMIN from accessing or overriding to a different mess", async () => {
    getSessionMock.mockResolvedValue({
      user: {
        id: "admin-1",
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-101",
        messId: "mess-101",
      },
    });

    await expect(
      authorizeKitchenRequest("hostel-101", "mess-999")
    ).rejects.toThrow("You do not have access to this mess's kitchen records.");
  });

  it("rejects MESS_ADMIN without an assigned messId with 403 MESS_REQUIRED even if messId requested", async () => {
    getSessionMock.mockResolvedValue({
      user: {
        id: "admin-no-mess",
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-101",
      },
    });

    await expect(
      authorizeKitchenRequest("hostel-101", "requested-mess")
    ).rejects.toThrow("Mess assignment is required for kitchen operations.");
  });

  it("prevents MESS_ADMIN from accessing a different hostel", async () => {
    getSessionMock.mockResolvedValue({
      user: {
        id: "admin-1",
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-101",
        messId: "mess-101",
      },
    });

    await expect(authorizeKitchenRequest("hostel-999")).rejects.toThrow(
      "You do not have access to this hostel's kitchen records."
    );
  });

  it("allows active SUPER_ADMIN to query any hostel and mess when mess belongs to hostel", async () => {
    getSessionMock.mockResolvedValue({
      user: {
        id: "super-1",
        role: USER_ROLE.SUPER_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-main",
        messId: "mess-main",
      },
    });

    const mockDb = {
      collection: () => ({
        findOne: async () => ({ _id: "mess-any-block", hostelId: "hostel-any-block" }),
      }),
    };
    getMongoDbMock.mockResolvedValue(mockDb);

    const auth = await authorizeKitchenRequest("hostel-any-block", "mess-any-block");
    expect(auth.hostelId).toBe("hostel-any-block");
    expect(auth.messId).toBe("mess-any-block");
  });

  it("rejects SUPER_ADMIN when selected mess does not exist in MESS_COLLECTION (404)", async () => {
    getSessionMock.mockResolvedValue({
      user: {
        id: "super-1",
        role: USER_ROLE.SUPER_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-main",
        messId: "mess-main",
      },
    });

    const mockDb = {
      collection: () => ({
        findOne: async () => null,
      }),
    };
    getMongoDbMock.mockResolvedValue(mockDb);

    await expect(
      authorizeKitchenRequest("hostel-alpha", "non-existent-mess")
    ).rejects.toThrow("The specified mess was not found.");
  });

  it("rejects SUPER_ADMIN when selected mess has missing or mismatched hostelId (400)", async () => {
    getSessionMock.mockResolvedValue({
      user: {
        id: "super-1",
        role: USER_ROLE.SUPER_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-1",
        messId: "mess-1",
      },
    });

    const mockDb = {
      collection: () => ({
        findOne: async () => ({ _id: "mess-no-hostel" }),
      }),
    };
    getMongoDbMock.mockResolvedValue(mockDb);

    await expect(
      authorizeKitchenRequest("hostel-1", "mess-no-hostel")
    ).rejects.toThrow("The specified mess does not belong to the selected hostel.");
  });

  it("prevents SUPER_ADMIN from selecting a mess that belongs to another hostel", async () => {
    getSessionMock.mockResolvedValue({
      user: {
        id: "super-1",
        role: USER_ROLE.SUPER_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-1",
        messId: "mess-1",
      },
    });

    const mockDb = {
      collection: () => ({
        findOne: async () => ({ _id: "mess-other", hostelId: "hostel-other" }),
      }),
    };
    getMongoDbMock.mockResolvedValue(mockDb);

    await expect(
      authorizeKitchenRequest("hostel-1", "mess-other")
    ).rejects.toThrow("The specified mess does not belong to the selected hostel.");
  });

  it("rejects unauthenticated requests", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(authorizeKitchenRequest()).rejects.toThrow("Sign in is required.");
  });

  it("rejects unauthorized roles such as STUDENT", async () => {
    getSessionMock.mockResolvedValue({
      user: {
        id: "student-1",
        role: USER_ROLE.STUDENT,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: "hostel-101",
      },
    });

    await expect(authorizeKitchenRequest()).rejects.toThrow(
      "You do not have access to the Kitchen Management module."
    );
  });

  it("rejects pending or inactive accounts", async () => {
    getSessionMock.mockResolvedValue({
      user: {
        id: "pending-admin",
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.PENDING,
        hostelId: "hostel-101",
      },
    });

    await expect(authorizeKitchenRequest()).rejects.toThrow(
      "Your account is awaiting approval."
    );
  });
});
