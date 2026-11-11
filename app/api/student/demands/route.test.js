import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => ({
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
vi.mock("../../../../lib/auth-contracts.js", () => ({
  HOSTEL_COLLECTION: "hostels",
  MESS_COLLECTION: "messes",
}));
vi.mock("../../../../lib/auth-authorization.js", () => ({
  AuthorizationError: mocks.AuthorizationError,
}));
vi.mock("../../../../lib/mongodb.js", () => ({
  getMongoDb: mocks.getMongoDb,
  getMongoClient: mocks.getMongoClient,
}));
vi.mock("../../../../lib/student-demands.js", () => ({
  STUDENT_DEMAND_COLLECTION: "student_demands",
  StudentDemandError: mocks.StudentDemandError,
  createStudentDemandDocument: mocks.createStudentDemandDocument,
  validateStudentDemandSelection: mocks.validateStudentDemandSelection,
  ensureStudentDemandIndexes: mocks.ensureStudentDemandIndexes,
}));
vi.mock("../../../../features/kitchen/services/kitchen-db_akk.js", () => ({
  ensureKitchenDemandRecord: mocks.ensureKitchenDemandRecord,
  syncStudentDemandAggregate: mocks.syncStudentDemandAggregate,
}));

const { POST } = await import("./route.js");

const STUDENT_ID = new ObjectId("507f1f77bcf86cd799439011");
const HOSTEL_ID = new ObjectId("507f1f77bcf86cd799439012");
const MESS_ID = new ObjectId("507f1f77bcf86cd799439013");
const DEMAND_ID = new ObjectId("507f1f77bcf86cd799439014");
const demandDocument = () => ({
  studentId: STUDENT_ID,
  hostelId: HOSTEL_ID,
  messId: MESS_ID,
  mealType: "LUNCH",
  slotId: "lunch",
  serviceDate: "2026-06-15",
  portion: "LARGE",
  portionWeight: 1.5,
  expectedArrivalAt: "2026-06-15T18:30:00+05:30",
  status: "ACTIVE",
  createdAt: new Date("2026-06-15T12:00:00.000Z"),
  updatedAt: new Date("2026-06-15T12:00:00.000Z"),
  cancelledAt: null,
});

function request(body = {
  mealType: "LUNCH",
  portion: "LARGE",
  expectedArrivalAt: "2026-06-15T18:30:00+05:30",
}) {
  return new Request("http://localhost:3000/api/student/demands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupDatabase({ existing = [], hostelActive = true, messActive = true } = {}) {
  const demandRecords = [...existing];
  const callOrder = [];
  const db = {
    collection: vi.fn((name) => {
      if (name === "student_demands") {
        return {
          findOne: vi.fn(async (filter) => demandRecords.find((record) =>
            record.studentId.equals(filter.studentId) &&
            record.serviceDate === filter.serviceDate && record.slotId === filter.slotId,
          ) ?? null),
          insertOne: vi.fn(async (document) => {
            if (demandRecords.some((record) =>
              record.studentId.equals(document.studentId) &&
              record.serviceDate === document.serviceDate && record.slotId === document.slotId,
            )) {
              throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
            }
            demandRecords.push({ ...document, _id: DEMAND_ID });
            callOrder.push("insertDemand");
            return { insertedId: DEMAND_ID };
          }),
        };
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
      const before = demandRecords.length;
      callOrder.push("transaction");
      try {
        return await callback();
      } catch (error) {
        demandRecords.splice(before);
        throw error;
      }
    }),
    endSession: vi.fn(async () => {}),
  };
  const client = { startSession: vi.fn(() => session) };
  mocks.getMongoDb.mockResolvedValue(db);
  mocks.getMongoClient.mockResolvedValue(client);
  return { db, session, client, demandRecords, callOrder };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateStudentDemandSelection.mockImplementation(() => ({}));
  mocks.createStudentDemandDocument.mockImplementation(async () => demandDocument());
  mocks.ensureStudentDemandIndexes.mockImplementation(async () => { setupState.callOrder.push("studentIndexes"); });
  mocks.ensureKitchenDemandRecord.mockImplementation(async () => { setupState.callOrder.push("kitchenPreinit"); });
  mocks.syncStudentDemandAggregate.mockResolvedValue({});
  setupState = setupDatabase();
});

let setupState;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/student/demands", () => {
  it("creates the individual demand and synchronizes Kitchen aggregate in one transaction", async () => {
    const response = await POST(request({
      mealType: "LUNCH",
      portion: "LARGE",
      expectedArrivalAt: "2026-06-15T18:30:00+05:30",
      messId: MESS_ID.toHexString(),
    }));

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json).toMatchObject({
      success: true,
      data: {
        id: DEMAND_ID.toHexString(),
        messId: MESS_ID.toHexString(),
        serviceDate: "2026-06-15",
        slotId: "lunch",
        portionWeight: 1.5,
      },
    });
    expect(json.data).not.toHaveProperty("studentId");
    expect(json.data).not.toHaveProperty("hostelId");
    expect(mocks.validateStudentDemandSelection).toHaveBeenCalledWith({
      mealType: "LUNCH",
      portion: "LARGE",
      expectedArrivalAt: "2026-06-15T18:30:00+05:30",
    });
    expect(mocks.createStudentDemandDocument).toHaveBeenCalledWith({
      selectedMessId: MESS_ID.toHexString(),
      selection: {
        mealType: "LUNCH",
        portion: "LARGE",
        expectedArrivalAt: "2026-06-15T18:30:00+05:30",
      },
    });
    expect(mocks.ensureKitchenDemandRecord).toHaveBeenCalledWith({
      hostelId: HOSTEL_ID.toHexString(),
      messId: MESS_ID.toHexString(),
      date: "2026-06-15",
      slotId: "lunch",
    });
    expect(mocks.syncStudentDemandAggregate).toHaveBeenCalledWith({
      hostelId: HOSTEL_ID.toHexString(),
      messId: MESS_ID.toHexString(),
      date: "2026-06-15",
      slotId: "lunch",
      portionDelta: 1.5,
    }, { session: setupState.session });
    expect(setupState.session.withTransaction).toHaveBeenCalledOnce();
    expect(setupState.callOrder).toEqual(["studentIndexes", "kitchenPreinit", "transaction", "insertDemand"]);
    expect(setupState.session.endSession).toHaveBeenCalledOnce();
  });

  it("rejects malformed input and server-owned identity fields before persistence", async () => {
    const response = await POST(request({
      mealType: "LUNCH",
      portion: "LARGE",
      expectedArrivalAt: "2026-06-15T18:30:00+05:30",
      hostelId: HOSTEL_ID.toHexString(),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_FIELDS");
    expect(mocks.createStudentDemandDocument).not.toHaveBeenCalled();
    expect(mocks.getMongoDb).not.toHaveBeenCalled();
  });

  it("rejects unsupported meal values before touching persistence", async () => {
    mocks.validateStudentDemandSelection.mockImplementationOnce(() => {
      throw new mocks.StudentDemandError("Meal type is invalid.", "INVALID_DEMAND_SELECTION", 400);
    });
    const response = await POST(request({
      mealType: "BRUNCH", portion: "REGULAR", expectedArrivalAt: "2026-06-15T18:30:00+05:30",
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_DEMAND_SELECTION");
    expect(mocks.createStudentDemandDocument).not.toHaveBeenCalled();
  });

  it("returns the established authorization error for unauthenticated or inactive Student access", async () => {
    mocks.createStudentDemandDocument.mockRejectedValueOnce(
      new mocks.AuthorizationError("Sign in is required.", 401, "UNAUTHENTICATED"),
    );
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.getMongoDb).not.toHaveBeenCalled();
  });

  it("returns a validation error for inactive or cross-Hostel Mess selection", async () => {
    mocks.createStudentDemandDocument.mockRejectedValueOnce(
      new mocks.StudentDemandError("The selected Mess is unavailable for this Hostel.", "MESS_UNAVAILABLE", 400),
    );
    const response = await POST(request({
      mealType: "LUNCH", portion: "REGULAR", expectedArrivalAt: "2026-06-15T18:30:00+05:30", messId: MESS_ID.toHexString(),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("MESS_UNAVAILABLE");
    expect(mocks.getMongoDb).not.toHaveBeenCalled();
  });

  it("returns conflict for an existing Student/date/slot identity without syncing Kitchen", async () => {
    setupState = setupDatabase({ existing: [{
      studentId: STUDENT_ID,
      serviceDate: "2026-06-15",
      slotId: "lunch",
      _id: DEMAND_ID,
    }] });

    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("DUPLICATE_STUDENT_DEMAND");
    expect(mocks.ensureKitchenDemandRecord).not.toHaveBeenCalled();
    expect(setupState.session.withTransaction).not.toHaveBeenCalled();
  });

  it("maps a concurrent unique-index collision to a duplicate conflict", async () => {
    setupState = setupDatabase();
    const collection = setupState.db.collection("student_demands");
    collection.insertOne.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: 11000 }));
    setupState.db.collection = vi.fn((name) => {
      if (name === "student_demands") return collection;
      if (name === "hostels") return { findOne: vi.fn(async () => ({ _id: HOSTEL_ID })) };
      if (name === "messes") return { findOne: vi.fn(async () => ({ _id: MESS_ID })) };
      throw new Error(`Unexpected collection ${name}`);
    });

    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("DUPLICATE_STUDENT_DEMAND");
    expect(mocks.syncStudentDemandAggregate).not.toHaveBeenCalled();
    expect(setupState.demandRecords).toHaveLength(0);
  });

  it("rolls back the Student demand when Kitchen aggregate synchronization fails", async () => {
    mocks.syncStudentDemandAggregate.mockRejectedValueOnce(new Error("private database failure"));
    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected server error occurred." },
    });
    expect(setupState.demandRecords).toHaveLength(0);
    expect(setupState.session.endSession).toHaveBeenCalledOnce();
  });

  it("rechecks active Hostel/Mess in the transaction and does not insert when unavailable", async () => {
    setupState = setupDatabase({ messActive: false });
    const response = await POST(request());

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("MESS_UNAVAILABLE");
    expect(setupState.demandRecords).toHaveLength(0);
    expect(mocks.syncStudentDemandAggregate).not.toHaveBeenCalled();
  });

  it("does not insert when the authenticated Student's Hostel is inactive in the transaction", async () => {
    setupState = setupDatabase({ hostelActive: false });
    const response = await POST(request());

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("STUDENT_HOSTEL_UNAVAILABLE");
    expect(setupState.demandRecords).toHaveLength(0);
    expect(mocks.syncStudentDemandAggregate).not.toHaveBeenCalled();
  });

  it("returns a generic server failure if Kitchen pre-initialization fails before opening a transaction", async () => {
    mocks.ensureKitchenDemandRecord.mockRejectedValueOnce(new Error("private kitchen details"));
    const response = await POST(request());

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe("An unexpected server error occurred.");
    expect(setupState.session.withTransaction).not.toHaveBeenCalled();
  });
});
