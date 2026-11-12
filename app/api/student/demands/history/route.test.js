import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => ({
  requireActiveRole: vi.fn(),
  getMongoDb: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message, status = 403, code = "FORBIDDEN") {
      super(message);
      this.name = "AuthorizationError";
      this.status = status;
      this.code = code;
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
vi.mock("../../../../../lib/mongodb.js", () => ({ getMongoDb: mocks.getMongoDb }));
vi.mock("../../../../../lib/student-demands.js", () => ({
  STUDENT_DEMAND_COLLECTION: "student_demands",
  STUDENT_DEMAND_STATUS: { ACTIVE: "ACTIVE", CANCELLED: "CANCELLED" },
}));

const { GET } = await import("./route.js");

const STUDENT_ID = new ObjectId("507f1f77bcf86cd799439011");
const OTHER_STUDENT_ID = new ObjectId("507f1f77bcf86cd799439015");
const HOSTEL_ID = new ObjectId("507f1f77bcf86cd799439012");
const OTHER_HOSTEL_ID = new ObjectId("507f1f77bcf86cd799439016");
const MESS_ID = new ObjectId("507f1f77bcf86cd799439013");
const OTHER_MESS_ID = new ObjectId("507f1f77bcf86cd799439017");

function record(overrides = {}) {
  return {
    _id: new ObjectId(),
    studentId: STUDENT_ID,
    hostelId: HOSTEL_ID,
    messId: MESS_ID,
    mealType: "LUNCH",
    slotId: "lunch",
    serviceDate: "2026-11-10",
    portion: "REGULAR",
    portionWeight: 1,
    expectedArrivalAt: "2026-11-10T12:30:00+05:30",
    status: "ACTIVE",
    createdAt: new Date("2026-11-10T06:00:00.000Z"),
    updatedAt: new Date("2026-11-10T06:00:00.000Z"),
    cancelledAt: null,
    password: "must-not-leak",
    sessionToken: "must-not-leak",
    ...overrides,
  };
}

function equal(actual, expected) {
  if (expected instanceof ObjectId) return actual instanceof ObjectId && actual.equals(expected);
  if (expected && typeof expected === "object" && Array.isArray(expected.$in)) {
    return expected.$in.some((item) => equal(actual, item));
  }
  return actual === expected;
}

function matches(document, filter) {
  return Object.entries(filter).every(([key, expected]) => equal(document[key], expected));
}

function setup({ demands = [], messes = [{ _id: MESS_ID, hostelId: HOSTEL_ID, name: "North Mess", code: "NM" }], hostelActive = true } = {}) {
  const cursorCalls = { sort: vi.fn(), skip: vi.fn(), limit: vi.fn() };
  const demandFind = vi.fn((filter) => {
    let results = demands.filter((item) => matches(item, filter));
    return {
      sort(sortSpec) {
        cursorCalls.sort(sortSpec);
        results = [...results].sort((left, right) => {
          for (const [field, direction] of Object.entries(sortSpec)) {
            const a = left[field];
            const b = right[field];
            const compared = a instanceof Date && b instanceof Date
              ? a.getTime() - b.getTime()
              : a instanceof ObjectId && b instanceof ObjectId
                ? a.toHexString().localeCompare(b.toHexString())
                : String(a).localeCompare(String(b));
            if (compared) return compared * direction;
          }
          return 0;
        });
        return this;
      },
      skip(offset) { cursorCalls.skip(offset); results = results.slice(offset); return this; },
      limit(amount) { cursorCalls.limit(amount); results = results.slice(0, amount); return this; },
      toArray: vi.fn(async () => results),
    };
  });
  const demandCollection = {
    countDocuments: vi.fn(async (filter) => demands.filter((item) => matches(item, filter)).length),
    find: demandFind,
  };
  const db = {
    collection: vi.fn((name) => {
      if (name === "hostels") return { findOne: vi.fn(async () => (hostelActive ? { _id: HOSTEL_ID } : null)) };
      if (name === "student_demands") return demandCollection;
      if (name === "messes") {
        return {
          find: vi.fn((filter) => ({
            toArray: vi.fn(async () => messes.filter((item) =>
              filter._id.$in.some((id) => item._id.equals(id)) && item.hostelId.equals(filter.hostelId),
            )),
          })),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
  };
  mocks.getMongoDb.mockResolvedValue(db);
  return { db, demandCollection, demandFind, cursorCalls };
}

function request(query = "") {
  return new Request(`http://localhost:3000/api/student/demands/history${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireActiveRole.mockResolvedValue({
    id: STUDENT_ID.toHexString(),
    role: "STUDENT",
    status: "ACTIVE",
    hostelId: HOSTEL_ID.toHexString(),
  });
});

describe("GET /api/student/demands/history", () => {
  it("returns active and cancelled demand history with safe Mess details", async () => {
    setup({ demands: [
      record({ serviceDate: "2026-11-09", status: "CANCELLED", cancelledAt: new Date("2026-11-09T09:00:00Z") }),
      record({ serviceDate: "2026-11-10", status: "ACTIVE" }),
    ] });

    const response = await GET(request());
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      data: {
        demands: [
          { serviceDate: "2026-11-10", status: "ACTIVE", mess: { id: MESS_ID.toHexString(), name: "North Mess", code: "NM" } },
          { serviceDate: "2026-11-09", status: "CANCELLED", cancelledAt: "2026-11-09T09:00:00.000Z" },
        ],
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasNextPage: false },
      },
    });
    expect(json.data.demands[0]).not.toHaveProperty("studentId");
    expect(json.data.demands[0]).not.toHaveProperty("hostelId");
    expect(json.data.demands[0]).not.toHaveProperty("portionWeight");
    expect(json.data.demands[0]).not.toHaveProperty("password");
    expect(json.data.demands[0]).not.toHaveProperty("sessionToken");
  });

  it("returns an empty paginated result when the Student has no history", async () => {
    setup();
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      success: true,
      data: { demands: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false } },
    });
  });

  it("scopes history queries to the authenticated Student and Hostel, ignoring supplied scope parameters", async () => {
    const own = record();
    const { demandCollection } = setup({ demands: [
      own,
      record({ studentId: OTHER_STUDENT_ID }),
      record({ hostelId: OTHER_HOSTEL_ID }),
    ] });
    const response = await GET(request(`?studentId=${OTHER_STUDENT_ID}&hostelId=${OTHER_HOSTEL_ID}`));
    const json = await response.json();

    expect(json.data.demands).toHaveLength(1);
    expect(json.data.demands[0].id).toBe(own._id.toHexString());
    const filter = demandCollection.countDocuments.mock.calls[0][0];
    expect(filter).toEqual({ studentId: STUDENT_ID, hostelId: HOSTEL_ID });
  });

  it("supports validated page, limit, status, and serviceDate filters with bounded stable sorting", async () => {
    const { demandFind, cursorCalls } = setup({ demands: [record({ serviceDate: "2026-11-10" })] });
    const response = await GET(request("?page=1&limit=1&status=ACTIVE&serviceDate=2026-11-10"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.pagination).toMatchObject({ page: 1, limit: 1, total: 1, totalPages: 1 });
    expect(demandFind).toHaveBeenCalledWith({
      studentId: STUDENT_ID,
      hostelId: HOSTEL_ID,
      status: "ACTIVE",
      serviceDate: "2026-11-10",
    });
    expect(cursorCalls.sort).toHaveBeenCalledWith({ serviceDate: -1, createdAt: -1, _id: -1 });
    expect(cursorCalls.skip).toHaveBeenCalledWith(0);
    expect(cursorCalls.limit).toHaveBeenCalledWith(1);
  });

  it("returns the next page with consistent metadata", async () => {
    setup({ demands: [
      record({ serviceDate: "2026-11-08" }),
      record({ serviceDate: "2026-11-09" }),
      record({ serviceDate: "2026-11-10" }),
    ] });
    const response = await GET(request("?page=2&limit=1"));
    const json = await response.json();

    expect(json.data.demands).toHaveLength(1);
    expect(json.data.demands[0].serviceDate).toBe("2026-11-09");
    expect(json.data.pagination).toMatchObject({
      page: 2, limit: 1, total: 3, totalPages: 3, hasPreviousPage: true, hasNextPage: true,
    });
  });

  it.each([
    "?page=0",
    "?page=1.5",
    "?page=10001",
    "?limit=51",
    "?limit=-1",
    "?status=PENDING",
    "?serviceDate=2026-02-30",
    "?page=1&page=2",
  ])("rejects invalid history query %s", async (query) => {
    setup();
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_HISTORY_QUERY");
    expect(mocks.getMongoDb).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and non-active Student sessions", async () => {
    setup();
    mocks.requireActiveRole.mockRejectedValueOnce(new mocks.AuthorizationError("Sign in is required.", 401, "UNAUTHENTICATED"));
    const unauthenticated = await GET(request());
    expect(unauthenticated.status).toBe(401);

    mocks.requireActiveRole.mockRejectedValueOnce(new mocks.AuthorizationError("Your account is awaiting approval.", 403, "PENDING_APPROVAL"));
    const pending = await GET(request());
    expect(pending.status).toBe(403);
    expect((await pending.json()).error.code).toBe("PENDING_APPROVAL");
  });

  it("does not return history when the authenticated Student's Hostel is inactive", async () => {
    const { db } = setup({ demands: [record()], hostelActive: false });
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("STUDENT_HOSTEL_UNAVAILABLE");
    expect(db.collection).toHaveBeenCalledTimes(1);
  });

  it("returns only the Mess identity if its historical Mess record is no longer present", async () => {
    setup({ demands: [record({ messId: OTHER_MESS_ID })], messes: [] });
    const response = await GET(request());
    expect((await response.json()).data.demands[0].mess).toEqual({
      id: OTHER_MESS_ID.toHexString(), name: null, code: null,
    });
  });
});
