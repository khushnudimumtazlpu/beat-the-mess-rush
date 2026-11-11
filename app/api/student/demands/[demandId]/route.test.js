import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => ({
  requireActiveRole: vi.fn(),
  getMongoDb: vi.fn(),
  getMongoClient: vi.fn(),
  createStudentDemandDocument: vi.fn(),
  validateStudentDemandSelection: vi.fn(),
  ensureStudentDemandIndexes: vi.fn(),
  ensureKitchenDemandRecord: vi.fn(),
  syncStudentDemandAggregate: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message, status = 403, code = "FORBIDDEN") {
      super(message);
      this.name = "AuthorizationError";
      this.status = status;
      this.code = code;
    }
  },
  StudentDemandError: class StudentDemandError extends Error {
    constructor(message, code, status = 400) {
      super(message);
      this.name = "StudentDemandError";
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/auth-contracts.js", () => ({
  HOSTEL_COLLECTION: "hostels",
  MESS_COLLECTION: "messes",
  USER_ROLE: { STUDENT: "STUDENT" },
}));
vi.mock("../../../../../lib/auth-authorization.js", () => ({
  AuthorizationError: mocks.AuthorizationError,
  requireActiveRole: mocks.requireActiveRole,
}));
vi.mock("../../../../../lib/mongodb.js", () => ({
  getMongoDb: mocks.getMongoDb,
  getMongoClient: mocks.getMongoClient,
}));
vi.mock("../../../../../lib/student-demands.js", () => ({
  STUDENT_DEMAND_COLLECTION: "student_demands",
  STUDENT_DEMAND_PORTION_WEIGHT: { REGULAR: 1, LARGE: 1.5 },
  STUDENT_DEMAND_STATUS: { ACTIVE: "ACTIVE", CANCELLED: "CANCELLED" },
  StudentDemandError: mocks.StudentDemandError,
  createStudentDemandDocument: mocks.createStudentDemandDocument,
  ensureStudentDemandIndexes: mocks.ensureStudentDemandIndexes,
  validateStudentDemandSelection: mocks.validateStudentDemandSelection,
}));
vi.mock("../../../../../features/kitchen/services/kitchen-db_akk.js", () => ({
  ensureKitchenDemandRecord: mocks.ensureKitchenDemandRecord,
  syncStudentDemandAggregate: mocks.syncStudentDemandAggregate,
}));

const { PATCH, DELETE } = await import("./route.js");

const STUDENT_ID = new ObjectId("507f1f77bcf86cd799439011");
const OTHER_STUDENT_ID = new ObjectId("507f1f77bcf86cd799439015");
const HOSTEL_ID = new ObjectId("507f1f77bcf86cd799439012");
const OTHER_HOSTEL_ID = new ObjectId("507f1f77bcf86cd799439016");
const MESS_ID = new ObjectId("507f1f77bcf86cd799439013");
const OTHER_MESS_ID = new ObjectId("507f1f77bcf86cd799439017");
const DEMAND_ID = new ObjectId("507f1f77bcf86cd799439014");
const OTHER_DEMAND_ID = new ObjectId("507f1f77bcf86cd799439018");

function demand(overrides = {}) {
  return {
    _id: DEMAND_ID,
    studentId: STUDENT_ID,
    hostelId: HOSTEL_ID,
    messId: MESS_ID,
    mealType: "LUNCH",
    slotId: "lunch",
    serviceDate: "2026-06-15",
    portion: "REGULAR",
    portionWeight: 1,
    expectedArrivalAt: "2026-06-15T18:30:00+05:30",
    status: "ACTIVE",
    createdAt: new Date("2026-06-15T10:00:00.000Z"),
    updatedAt: new Date("2026-06-15T11:00:00.000Z"),
    cancelledAt: null,
    ...overrides,
  };
}

function sameValue(actual, expected) {
  if (expected && typeof expected === "object" && "$exists" in expected) {
    return expected.$exists ? actual !== undefined : actual === undefined;
  }
  if (expected && typeof expected === "object" && "$ne" in expected) {
    return !sameValue(actual, expected.$ne);
  }
  if (actual instanceof ObjectId && expected instanceof ObjectId) return actual.equals(expected);
  if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime();
  return actual === expected;
}

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => sameValue(document[key], value));
}

function setup({ documents = [demand()], hostelActive = true, messActive = true } = {}) {
  const records = documents.map((item) => ({ ...item }));
  const events = [];
  let forceConflict = false;
  const collectionMocks = {};
  const db = {
    collection: vi.fn((name) => {
      if (name === "student_demands") {
        if (!collectionMocks.demands) {
          collectionMocks.demands = {
            // MongoDB returns a document value; updates do not mutate the previously read object.
            findOne: vi.fn(async (filter) => {
              const record = records.find((item) => matches(item, filter));
              return record ? { ...record } : null;
            }),
            updateOne: vi.fn(async (filter, update) => {
              if (forceConflict) {
                forceConflict = false;
                return { matchedCount: 0, modifiedCount: 0 };
              }
              const current = records.find((item) => matches(item, filter));
              if (!current) return { matchedCount: 0, modifiedCount: 0 };
              Object.assign(current, update.$set);
              for (const [key, delta] of Object.entries(update.$inc ?? {})) {
                current[key] = (current[key] ?? 0) + delta;
              }
              events.push("studentUpdate");
              return { matchedCount: 1, modifiedCount: 1 };
            }),
          };
        }
        return collectionMocks.demands;
      }
      if (name === "hostels") {
        return { findOne: vi.fn(async () => (hostelActive ? { _id: HOSTEL_ID } : null)) };
      }
      if (name === "messes") {
        return { findOne: vi.fn(async () => (messActive ? { _id: MESS_ID } : null)) };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  const session = {
    withTransaction: vi.fn(async (callback) => {
      const snapshot = records.map((item) => ({ ...item }));
      events.push("transaction");
      try {
        return await callback();
      } catch (error) {
        records.splice(0, records.length, ...snapshot);
        throw error;
      }
    }),
    endSession: vi.fn(async () => {}),
  };
  const client = { startSession: vi.fn(() => session) };
  mocks.getMongoDb.mockResolvedValue(db);
  mocks.getMongoClient.mockResolvedValue(client);
  mocks.ensureStudentDemandIndexes.mockImplementation(async () => { events.push("studentIndexes"); });
  mocks.ensureKitchenDemandRecord.mockImplementation(async (key) => { events.push(["kitchenPreinit", key]); });
  mocks.syncStudentDemandAggregate.mockImplementation(async (payload) => {
    events.push(["kitchenSync", payload]);
    return {};
  });

  return {
    records,
    events,
    db,
    session,
    client,
    collectionMocks,
    conflictNextUpdate() { forceConflict = true; },
  };
}

function patchRequest(body = {
  mealType: "LUNCH",
  portion: "LARGE",
  expectedArrivalAt: "2026-06-15T19:00:00+05:30",
}) {
  return new Request("http://localhost:3000/api/student/demands/507f1f77bcf86cd799439014", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function routeContext(id = DEMAND_ID.toHexString()) {
  return { params: Promise.resolve({ demandId: id }) };
}

function nextDocument(overrides = {}) {
  return {
    ...demand({ portion: "LARGE", portionWeight: 1.5, expectedArrivalAt: "2026-06-15T19:00:00+05:30" }),
    _id: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupState = setup();
  mocks.requireActiveRole.mockResolvedValue({
    id: STUDENT_ID.toHexString(),
    role: "STUDENT",
    status: "ACTIVE",
    hostelId: HOSTEL_ID.toHexString(),
  });
  mocks.createStudentDemandDocument.mockImplementation(async ({ selection }) => nextDocument({
    mealType: selection.mealType,
    slotId: ({ BREAKFAST: "breakfast", LUNCH: "lunch", SNACKS: "snacks", DINNER: "dinner" })[selection.mealType],
    portion: selection.portion,
    portionWeight: selection.portion === "LARGE" ? 1.5 : 1,
    expectedArrivalAt: selection.expectedArrivalAt,
  }));
  mocks.validateStudentDemandSelection.mockImplementation(({ mealType, portion, expectedArrivalAt }) => ({
    slotId: ({ BREAKFAST: "breakfast", LUNCH: "lunch", SNACKS: "snacks", DINNER: "dinner" })[mealType],
    portionWeight: portion === "LARGE" ? 1.5 : 1,
    expectedArrivalAt,
  }));
});

let setupState;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PATCH /api/student/demands/[demandId]", () => {
  it("updates the authenticated Student's demand and applies the portion delta atomically", async () => {
    const response = await PATCH(patchRequest(), routeContext());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data).toMatchObject({ status: "ACTIVE", portion: "LARGE", portionWeight: 1.5 });
    expect(setupState.records[0].revision).toBe(1);
    expect(setupState.events.filter((event) => Array.isArray(event) && event[0] === "kitchenPreinit")).toHaveLength(1);
    expect(mocks.syncStudentDemandAggregate).toHaveBeenCalledWith({
      hostelId: HOSTEL_ID.toHexString(),
      messId: MESS_ID.toHexString(),
      date: "2026-06-15",
      slotId: "lunch",
      portionDelta: 0.5,
    }, { session: setupState.session });
    expect(setupState.events.findIndex((event) => Array.isArray(event) && event[0] === "kitchenPreinit"))
      .toBeLessThan(setupState.events.indexOf("transaction"));
  });

  it("subtracts the exact portion decrease when changing from LARGE to REGULAR", async () => {
    setupState = setup({ documents: [demand({ portion: "LARGE", portionWeight: 1.5 })] });
    mocks.createStudentDemandDocument.mockResolvedValueOnce(nextDocument({
      portion: "REGULAR",
      portionWeight: 1,
      expectedArrivalAt: "2026-06-15T19:00:00+05:30",
    }));

    const response = await PATCH(patchRequest({
      mealType: "LUNCH", portion: "REGULAR", expectedArrivalAt: "2026-06-15T19:00:00+05:30",
    }), routeContext());

    expect(response.status).toBe(200);
    expect(mocks.syncStudentDemandAggregate).toHaveBeenCalledWith(expect.objectContaining({
      portionDelta: -0.5,
    }), { session: setupState.session });
  });

  it("moves aggregates when meal slot, service date, and Mess change", async () => {
    expect(setupState.records[0].portionWeight).toBe(1);
    mocks.createStudentDemandDocument.mockResolvedValueOnce(nextDocument({
      messId: OTHER_MESS_ID,
      mealType: "DINNER",
      slotId: "dinner",
      serviceDate: "2026-06-16",
    }));
    const response = await PATCH(patchRequest({
      mealType: "DINNER", portion: "LARGE", expectedArrivalAt: "2026-06-16T19:00:00+05:30", messId: OTHER_MESS_ID.toHexString(),
    }), routeContext());

    expect(response.status).toBe(200);
    const syncCalls = mocks.syncStudentDemandAggregate.mock.calls;
    expect(syncCalls).toHaveLength(2);
    expect(syncCalls[0][0]).toMatchObject({
      hostelId: HOSTEL_ID.toHexString(), messId: MESS_ID.toHexString(),
      date: "2026-06-15", slotId: "lunch", portionDelta: -1,
    });
    expect(syncCalls[1][0]).toMatchObject({
      hostelId: HOSTEL_ID.toHexString(), messId: OTHER_MESS_ID.toHexString(),
      date: "2026-06-16", slotId: "dinner", portionDelta: 1.5,
    });
    expect(syncCalls.every(([, options]) => options.session === setupState.session)).toBe(true);
  });

  it("does not update another Student's demand", async () => {
    setupState = setup({ documents: [demand({ studentId: OTHER_STUDENT_ID })] });
    const response = await PATCH(patchRequest(), routeContext());
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("STUDENT_DEMAND_NOT_FOUND");
    expect(setupState.session.withTransaction).not.toHaveBeenCalled();
  });

  it("requires an active authenticated Student and rejects malformed demand IDs", async () => {
    mocks.createStudentDemandDocument.mockRejectedValueOnce(
      new mocks.AuthorizationError("Sign in is required.", 401, "UNAUTHENTICATED"),
    );
    const unauthenticated = await PATCH(patchRequest(), routeContext());
    expect(unauthenticated.status).toBe(401);
    expect((await unauthenticated.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.getMongoDb).not.toHaveBeenCalled();

    const invalidId = await PATCH(patchRequest(), routeContext("invalid"));
    expect(invalidId.status).toBe(400);
    expect((await invalidId.json()).error.code).toBe("INVALID_STUDENT_DEMAND_ID");
  });

  it("rejects a target identity already used by another demand", async () => {
    setupState = setup({ documents: [
      demand(),
      demand({ _id: OTHER_DEMAND_ID, serviceDate: "2026-06-16" }),
    ] });
    mocks.createStudentDemandDocument.mockResolvedValueOnce(nextDocument({ serviceDate: "2026-06-16" }));
    const response = await PATCH(patchRequest({
      mealType: "LUNCH", portion: "LARGE", expectedArrivalAt: "2026-06-16T19:00:00+05:30",
    }), routeContext());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("DUPLICATE_STUDENT_DEMAND");
    expect(mocks.ensureKitchenDemandRecord).not.toHaveBeenCalled();
  });

  it("maps a concurrent unique-identity collision to a conflict", async () => {
    const collection = setupState.db.collection("student_demands");
    collection.updateOne.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: 11000 }));
    mocks.createStudentDemandDocument.mockResolvedValueOnce(nextDocument({ serviceDate: "2026-06-16" }));
    const response = await PATCH(patchRequest({
      mealType: "LUNCH", portion: "LARGE", expectedArrivalAt: "2026-06-16T19:00:00+05:30",
    }), routeContext());

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("DUPLICATE_STUDENT_DEMAND");
    expect(mocks.syncStudentDemandAggregate).not.toHaveBeenCalled();
  });

  it("rejects invalid fields and invalid selection without writing", async () => {
    const response = await PATCH(patchRequest({
      mealType: "LUNCH", portion: "REGULAR", expectedArrivalAt: "2026-06-15T19:00:00+05:30", hostelId: HOSTEL_ID.toHexString(),
    }), routeContext());
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_FIELDS");

    mocks.validateStudentDemandSelection.mockImplementationOnce(() => {
      throw new mocks.StudentDemandError("Invalid meal type.", "INVALID_DEMAND_SELECTION", 400);
    });
    const invalid = await PATCH(patchRequest({
      mealType: "BRUNCH", portion: "REGULAR", expectedArrivalAt: "2026-06-15T19:00:00+05:30",
    }), routeContext());
    expect(invalid.status).toBe(400);
    expect(setupState.session.withTransaction).not.toHaveBeenCalled();
  });

  it("rolls back the demand update when Kitchen synchronization fails", async () => {
    const original = { ...setupState.records[0] };
    mocks.syncStudentDemandAggregate.mockRejectedValueOnce(new Error("internal sync failure"));
    const response = await PATCH(patchRequest(), routeContext());
    expect(response.status).toBe(500);
    expect(setupState.records[0].portion).toBe(original.portion);
    expect(setupState.records[0].portionWeight).toBe(original.portionWeight);
    expect(Object.hasOwn(setupState.records[0], "revision")).toBe(false);
    expect((await response.json()).error.message).toBe("An unexpected server error occurred.");
  });

  it("returns conflict when a concurrent update changes the demand", async () => {
    setupState.conflictNextUpdate();
    const response = await PATCH(patchRequest(), routeContext());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("STUDENT_DEMAND_CONFLICT");
    expect(mocks.syncStudentDemandAggregate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/student/demands/[demandId]", () => {
  it("cancels only the authenticated Student's demand and subtracts its recorded weight", async () => {
    const response = await DELETE(new Request("http://localhost/api/student/demands/id", { method: "DELETE" }), routeContext());
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ status: "CANCELLED", portionWeight: 1 });
    expect(setupState.records[0]).toMatchObject({ status: "CANCELLED", revision: 1 });
    expect(mocks.syncStudentDemandAggregate).toHaveBeenCalledWith({
      hostelId: HOSTEL_ID.toHexString(), messId: MESS_ID.toHexString(),
      date: "2026-06-15", slotId: "lunch", portionDelta: -1,
    }, { session: setupState.session });
  });

  it("subtracts the exact recorded LARGE weight and preserves cancellation audit fields", async () => {
    setupState = setup({ documents: [demand({ portion: "LARGE", portionWeight: 1.5 })] });
    const response = await DELETE(new Request("http://localhost/api/student/demands/id", { method: "DELETE" }), routeContext());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.cancelledAt).toBeTruthy();
    expect(setupState.records[0].cancelledAt).toBeInstanceOf(Date);
    expect(mocks.syncStudentDemandAggregate).toHaveBeenCalledWith(expect.objectContaining({
      portionDelta: -1.5,
    }), { session: setupState.session });
  });

  it("rejects a malformed demand ID before database access", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/student/demands/id", { method: "DELETE" }),
      routeContext("invalid"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_STUDENT_DEMAND_ID");
    expect(mocks.getMongoDb).not.toHaveBeenCalled();
  });

  it("does not cancel a demand belonging to another Student or Hostel", async () => {
    setupState = setup({ documents: [demand({ studentId: OTHER_STUDENT_ID, hostelId: OTHER_HOSTEL_ID })] });
    const response = await DELETE(new Request("http://localhost/api/student/demands/id", { method: "DELETE" }), routeContext());
    expect(response.status).toBe(404);
    expect(setupState.session.withTransaction).not.toHaveBeenCalled();
  });

  it("rejects a repeated cancellation", async () => {
    setupState = setup({ documents: [demand({ status: "CANCELLED", cancelledAt: new Date() })] });
    const response = await DELETE(new Request("http://localhost/api/student/demands/id", { method: "DELETE" }), routeContext());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("STUDENT_DEMAND_CONFLICT");
    expect(mocks.syncStudentDemandAggregate).not.toHaveBeenCalled();
  });

  it("rolls back cancellation when Kitchen synchronization fails", async () => {
    mocks.syncStudentDemandAggregate.mockRejectedValueOnce(new Error("internal sync failure"));
    const response = await DELETE(new Request("http://localhost/api/student/demands/id", { method: "DELETE" }), routeContext());
    expect(response.status).toBe(500);
    expect(setupState.records[0].status).toBe("ACTIVE");
    expect(Object.hasOwn(setupState.records[0], "revision")).toBe(false);
  });

  it("returns conflict when cancellation loses an optimistic concurrency race", async () => {
    setupState.conflictNextUpdate();
    const response = await DELETE(new Request("http://localhost/api/student/demands/id", { method: "DELETE" }), routeContext());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("STUDENT_DEMAND_CONFLICT");
    expect(mocks.syncStudentDemandAggregate).not.toHaveBeenCalled();
  });

  it("requires an active Student session", async () => {
    mocks.requireActiveRole.mockRejectedValueOnce(new mocks.AuthorizationError("Sign in is required.", 401, "UNAUTHENTICATED"));
    const response = await DELETE(new Request("http://localhost/api/student/demands/id", { method: "DELETE" }), routeContext());
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.getMongoDb).not.toHaveBeenCalled();
  });
});
