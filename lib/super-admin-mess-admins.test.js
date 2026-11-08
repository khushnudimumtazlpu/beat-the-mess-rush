import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { ACCOUNT_STATUS, USER_ROLE } from "./auth-contracts.js";

const { getMongoDbMock, requireActiveRoleMock } = vi.hoisted(() => ({
  getMongoDbMock: vi.fn(),
  requireActiveRoleMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./mongodb.js", () => ({ getMongoDb: getMongoDbMock }));
vi.mock("./auth-authorization.js", () => ({
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message, status = 403, code = "FORBIDDEN") {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  requireActiveRole: requireActiveRoleMock,
}));

const {
  listMessAdmins,
  rejectPendingMessAdmin,
  removeMessAdminAssignment,
  readMessAdminStatusFilter,
  requireHostelIdBody,
} = await import("./super-admin-mess-admins.js");
const { withSuperAdminApi } = await import("./super-admin-domain-api.js");

const PENDING_ID = new ObjectId();
const ACTIVE_ID = new ObjectId();
const OTHER_ID = new ObjectId();
const HOSTEL_ID = new ObjectId();

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (actual instanceof ObjectId && expected instanceof ObjectId) return actual.equals(expected);
    return actual?.toString() === expected?.toString();
  });
}

function createHarness(users = []) {
  const state = { users };
  const collection = {
    find: vi.fn((filter) => {
      let projection = null;
      const cursor = {
        project(value) { projection = value; return cursor; },
        sort: vi.fn(() => cursor),
        toArray: vi.fn(async () => state.users
          .filter((user) => matches(user, filter))
          .map((user) => projection
            ? Object.fromEntries(Object.keys(projection).filter((key) => projection[key] && user[key] !== undefined).map((key) => [key, user[key]]))
            : user)),
      };
      return cursor;
    }),
    findOne: vi.fn(async (filter) => state.users.find((user) => matches(user, filter)) ?? null),
    updateOne: vi.fn(async (filter, update) => {
      const user = state.users.find((record) => matches(record, filter));
      if (!user) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(user, update.$set ?? {});
      return { matchedCount: 1, modifiedCount: 1 };
    }),
  };
  getMongoDbMock.mockResolvedValue({ collection: (name) => {
    if (name !== "user") throw new Error(`Unexpected collection ${name}`);
    return collection;
  } });
  return { state, collection };
}

function user(_id, { role = USER_ROLE.MESS_ADMIN, status = ACCOUNT_STATUS.PENDING, hostelId = null } = {}) {
  return {
    _id,
    name: "Campus Admin",
    email: "admin@example.test",
    role,
    status,
    hostelId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    password: "must-not-leak",
    sessionToken: "must-not-leak",
    verificationToken: "must-not-leak",
    account: { password: "must-not-leak" },
  };
}

describe("Super Admin Mess Admin management services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActiveRoleMock.mockResolvedValue({ id: "super-admin-id", role: USER_ROLE.SUPER_ADMIN });
  });

  it("lists only Mess Admins and returns only the approved safe fields", async () => {
    const admin = user(PENDING_ID);
    const h = createHarness([
      admin,
      user(OTHER_ID, { role: USER_ROLE.STUDENT }),
    ]);

    const records = await listMessAdmins();

    expect(h.collection.find).toHaveBeenCalledWith({ role: USER_ROLE.MESS_ADMIN });
    expect(records).toEqual([{
      id: PENDING_ID.toHexString(),
      name: "Campus Admin",
      email: "admin@example.test",
      status: ACCOUNT_STATUS.PENDING,
      hostelId: null,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    }]);
    expect(Object.keys(records[0]).sort()).toEqual([
      "createdAt", "email", "hostelId", "id", "name", "status", "updatedAt",
    ]);
    expect(records[0]).not.toHaveProperty("password");
    expect(records[0]).not.toHaveProperty("sessionToken");
    expect(records[0]).not.toHaveProperty("verificationToken");
  });

  it("filters Mess Admins by a validated account status", async () => {
    const h = createHarness([
      user(PENDING_ID),
      user(ACTIVE_ID, { status: ACCOUNT_STATUS.ACTIVE, hostelId: HOSTEL_ID.toHexString() }),
    ]);

    const records = await listMessAdmins(ACCOUNT_STATUS.ACTIVE);

    expect(h.collection.find).toHaveBeenCalledWith({
      role: USER_ROLE.MESS_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
    });
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(ACTIVE_ID.toHexString());
  });

  it("rejects unsupported status filters and unknown query parameters", async () => {
    createHarness();
    await expect(listMessAdmins("ROOT")).rejects.toMatchObject({ code: "INVALID_STATUS_FILTER", status: 400 });
    expect(() => readMessAdminStatusFilter(new Request("http://localhost/api/admin/mess-admins?role=STUDENT")))
      .toThrow(/Only the status filter/);
    expect(() => readMessAdminStatusFilter(new Request("http://localhost/api/admin/mess-admins?status=PENDING&status=ACTIVE")))
      .toThrow(/only one status/);
  });

  it("requires assignment requests to contain only a valid Hostel ObjectId", () => {
    expect(requireHostelIdBody({ hostelId: HOSTEL_ID.toHexString() })).toBe(HOSTEL_ID.toHexString());
    expect(() => requireHostelIdBody({ hostelId: HOSTEL_ID.toHexString(), status: "ACTIVE" })).toThrow(/only a valid hostelId/);
    expect(() => requireHostelIdBody({ hostelId: "not-an-id" })).toThrow(/valid MongoDB ObjectId/);
  });

  it("rejects only a pending Mess Admin and returns its updated safe record", async () => {
    const admin = user(PENDING_ID);
    const h = createHarness([admin]);

    const result = await rejectPendingMessAdmin(PENDING_ID.toHexString());

    expect(h.collection.updateOne).toHaveBeenCalledWith(
      { _id: PENDING_ID, role: USER_ROLE.MESS_ADMIN, status: ACCOUNT_STATUS.PENDING },
      { $set: expect.objectContaining({ status: ACCOUNT_STATUS.REJECTED, updatedAt: expect.any(Date) }) },
    );
    expect(result.status).toBe(ACCOUNT_STATUS.REJECTED);
    expect(result).not.toHaveProperty("password");
  });

  it.each([
    ACCOUNT_STATUS.ACTIVE,
    ACCOUNT_STATUS.SUSPENDED,
    ACCOUNT_STATUS.REJECTED,
  ])("does not reject a Mess Admin whose status is %s", async (status) => {
    const h = createHarness([user(PENDING_ID, { status })]);

    await expect(rejectPendingMessAdmin(PENDING_ID.toHexString())).rejects.toMatchObject({
      code: "MESS_ADMIN_NOT_PENDING",
      status: 409,
    });
    expect(h.collection.updateOne).toHaveBeenCalledOnce();
    expect(h.state.users[0].status).toBe(status);
  });

  it("rejects a non-Mess-Admin account and invalid account IDs", async () => {
    const h = createHarness([user(PENDING_ID, { role: USER_ROLE.STUDENT })]);
    await expect(rejectPendingMessAdmin(PENDING_ID.toHexString())).rejects.toMatchObject({ code: "MESS_ADMIN_NOT_FOUND" });
    await expect(rejectPendingMessAdmin("bad-id")).rejects.toThrow(/valid MongoDB ObjectId/);
    expect(h.collection.updateOne).toHaveBeenCalledOnce();
    expect(h.state.users[0].status).toBe(ACCOUNT_STATUS.PENDING);
  });

  it("removes only the specified active assignment and keeps the account active", async () => {
    const admin = user(ACTIVE_ID, { status: ACCOUNT_STATUS.ACTIVE, hostelId: HOSTEL_ID.toHexString() });
    const h = createHarness([admin]);

    const result = await removeMessAdminAssignment(ACTIVE_ID.toHexString(), HOSTEL_ID.toHexString());

    expect(h.collection.updateOne).toHaveBeenCalledWith(
      {
        _id: ACTIVE_ID,
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: HOSTEL_ID.toHexString(),
      },
      { $set: { hostelId: null, updatedAt: expect.any(Date) } },
    );
    expect(result).toMatchObject({ status: ACCOUNT_STATUS.ACTIVE, hostelId: null });
  });

  it("does not remove another Hostel assignment or a non-active account", async () => {
    const otherHostel = new ObjectId().toHexString();
    const assignedElsewhere = user(ACTIVE_ID, { status: ACCOUNT_STATUS.ACTIVE, hostelId: otherHostel });
    const pending = user(PENDING_ID, { hostelId: HOSTEL_ID.toHexString() });
    const h = createHarness([assignedElsewhere, pending]);

    await expect(removeMessAdminAssignment(ACTIVE_ID.toHexString(), HOSTEL_ID.toHexString()))
      .rejects.toMatchObject({ code: "ASSIGNMENT_MISMATCH", status: 409 });
    await expect(removeMessAdminAssignment(PENDING_ID.toHexString(), HOSTEL_ID.toHexString()))
      .rejects.toMatchObject({ code: "MESS_ADMIN_NOT_ACTIVE", status: 409 });
    expect(assignedElsewhere.hostelId).toBe(otherHostel);
    expect(pending.hostelId).toBe(HOSTEL_ID.toHexString());
  });

  it("preserves a competing Hostel reassignment and returns a conflict", async () => {
    const hostelBId = new ObjectId().toHexString();
    const admin = user(ACTIVE_ID, {
      status: ACCOUNT_STATUS.ACTIVE,
      hostelId: HOSTEL_ID.toHexString(),
    });
    const h = createHarness([admin]);
    h.collection.updateOne.mockImplementationOnce(async (filter, update) => {
      // Simulate a competing assignment completing immediately before the
      // conditional removal write is evaluated by MongoDB.
      admin.hostelId = hostelBId;
      const current = h.state.users.find((record) => matches(record, filter));
      if (!current) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(current, update.$set ?? {});
      return { matchedCount: 1, modifiedCount: 1 };
    });

    const response = await withSuperAdminApi(() => (
      removeMessAdminAssignment(ACTIVE_ID.toHexString(), HOSTEL_ID.toHexString())
    ));

    expect(h.collection.updateOne).toHaveBeenCalledWith(
      {
        _id: ACTIVE_ID,
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: HOSTEL_ID.toHexString(),
      },
      { $set: { hostelId: null, updatedAt: expect.any(Date) } },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "ASSIGNMENT_MISMATCH" },
    });
    expect(admin).toMatchObject({ status: ACCOUNT_STATUS.ACTIVE, hostelId: hostelBId });
  });

  it("reports missing Mess Admin accounts and rejects malformed IDs", async () => {
    const h = createHarness([]);
    await expect(removeMessAdminAssignment(ACTIVE_ID.toHexString(), HOSTEL_ID.toHexString()))
      .rejects.toMatchObject({ code: "MESS_ADMIN_NOT_FOUND", status: 404 });
    await expect(removeMessAdminAssignment("bad-id", HOSTEL_ID.toHexString()))
      .rejects.toThrow(/valid MongoDB ObjectId/);
    expect(h.collection.updateOne).toHaveBeenCalledOnce();
  });
});
