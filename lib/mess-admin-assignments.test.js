import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { ACCOUNT_STATUS, USER_ROLE } from "./auth-contracts.js";

const { requireActiveRoleMock, getMongoClientMock, getMongoDbMock } = vi.hoisted(() => ({
  requireActiveRoleMock: vi.fn(),
  getMongoClientMock: vi.fn(),
  getMongoDbMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
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
vi.mock("./mongodb.js", () => ({
  getMongoClient: getMongoClientMock,
  getMongoDb: getMongoDbMock,
}));

const { assignHostelMessAdmin } = await import("./mess-admin-assignments.js");

const HOSTEL_ID = new ObjectId();
const ADMIN_ID = new ObjectId();
const PREVIOUS_ADMIN_ID = new ObjectId();
const ACTOR = {
  id: new ObjectId().toHexString(),
  role: USER_ROLE.SUPER_ADMIN,
  status: ACCOUNT_STATUS.ACTIVE,
};

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected && typeof expected === "object" && "$ne" in expected) {
      return actual?.toString() !== expected.$ne?.toString();
    }
    if (actual instanceof ObjectId && expected instanceof ObjectId) return actual.equals(expected);
    return actual?.toString() === expected?.toString();
  });
}

function createHarness({ users = [], hostels, failUpdateNumber, transactionError } = {}) {
  const state = {
    users,
    hostels: hostels ?? [{ _id: HOSTEL_ID }],
    updateCalls: 0,
  };
  const userCollection = {
    createIndex: vi.fn(async () => "one_active_mess_admin_per_hostel"),
    findOne: vi.fn(async (filter) => state.users.find((user) => matches(user, filter)) ?? null),
    updateOne: vi.fn(async (filter, update) => {
      state.updateCalls += 1;
      if (state.updateCalls === failUpdateNumber) throw new Error("simulated update failure");
      const user = state.users.find((item) => matches(item, filter));
      if (!user) return { matchedCount: 0 };
      Object.assign(user, update.$set ?? {});
      for (const key of Object.keys(update.$unset ?? {})) delete user[key];
      return { matchedCount: 1 };
    }),
  };
  const hostelCollection = {
    findOne: vi.fn(async (filter) => state.hostels.find((hostel) => matches(hostel, filter)) ?? null),
  };
  const collections = { user: userCollection, hostels: hostelCollection };
  const db = { collection: (name) => collections[name] };
  const session = {
    withTransaction: vi.fn(async (callback) => {
      if (transactionError) throw transactionError;
      const snapshot = state.users.map((user) => ({ ...user }));
      try {
        return await callback();
      } catch (error) {
        state.users.splice(0, state.users.length, ...snapshot);
        throw error;
      }
    }),
    endSession: vi.fn(async () => {}),
  };
  const client = { startSession: vi.fn(() => session) };

  getMongoClientMock.mockResolvedValue(client);
  getMongoDbMock.mockResolvedValue(db);
  requireActiveRoleMock.mockResolvedValue(ACTOR);

  return { state, userCollection, hostelCollection, session, client };
}

function admin(_id, { role = USER_ROLE.MESS_ADMIN, status = ACCOUNT_STATUS.PENDING, hostelId } = {}) {
  return { _id, role, status, ...(hostelId ? { hostelId } : {}) };
}

describe("assignHostelMessAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires the active Super Admin guard before assigning", async () => {
    createHarness();
    requireActiveRoleMock.mockRejectedValueOnce(
      Object.assign(new Error("active Super Admin required"), { status: 403, code: "ROLE_REQUIRED" }),
    );

    await expect(assignHostelMessAdmin({
      hostelId: HOSTEL_ID.toHexString(),
      messAdminId: ADMIN_ID.toHexString(),
    })).rejects.toMatchObject({ status: 403, code: "ROLE_REQUIRED" });
    expect(requireActiveRoleMock).toHaveBeenCalledWith(USER_ROLE.SUPER_ADMIN);
    expect(getMongoClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["hostelId", "not-an-object-id", ADMIN_ID.toHexString()],
    ["messAdminId", HOSTEL_ID.toHexString(), "not-an-object-id"],
  ])("rejects an invalid %s", async (_label, hostelId, messAdminId) => {
    const h = createHarness();
    await expect(assignHostelMessAdmin({ hostelId, messAdminId })).rejects.toThrow(/valid ObjectId/);
    expect(h.client.startSession).not.toHaveBeenCalled();
  });

  it("rejects a missing hostel and a missing target user", async () => {
    createHarness({ hostels: [] });
    await expect(assignHostelMessAdmin({
      hostelId: HOSTEL_ID.toHexString(),
      messAdminId: ADMIN_ID.toHexString(),
    })).rejects.toMatchObject({ code: "HOSTEL_NOT_FOUND" });

    createHarness({ users: [], hostels: [{ _id: HOSTEL_ID }] });
    await expect(assignHostelMessAdmin({
      hostelId: HOSTEL_ID.toHexString(),
      messAdminId: ADMIN_ID.toHexString(),
    })).rejects.toMatchObject({ code: "INVALID_MESS_ADMIN" });
  });

  it("requires the target account to have the MESS_ADMIN role", async () => {
    createHarness({ users: [admin(ADMIN_ID, { role: USER_ROLE.STUDENT })] });

    await expect(assignHostelMessAdmin({
      hostelId: HOSTEL_ID.toHexString(),
      messAdminId: ADMIN_ID.toHexString(),
    })).rejects.toMatchObject({ status: 400, code: "INVALID_MESS_ADMIN" });
  });

  it("reassigns the hostel and removes the previous admin's hostel assignment", async () => {
    const hostelId = HOSTEL_ID.toHexString();
    const previous = admin(PREVIOUS_ADMIN_ID, {
      status: ACCOUNT_STATUS.ACTIVE,
      hostelId,
    });
    const next = admin(ADMIN_ID);
    const h = createHarness({ users: [previous, next] });

    const result = await assignHostelMessAdmin({
      hostelId,
      messAdminId: ADMIN_ID.toHexString(),
    });

    expect(previous.hostelId).toBeNull();
    expect(previous.status).toBe(ACCOUNT_STATUS.ACTIVE);
    expect(next).toMatchObject({ status: ACCOUNT_STATUS.ACTIVE, hostelId });
    expect(result).toMatchObject({
      hostelId,
      messAdminId: ADMIN_ID.toHexString(),
      previousMessAdminId: PREVIOUS_ADMIN_ID.toHexString(),
      assignedBy: ACTOR.id,
    });
    expect(h.session.endSession).toHaveBeenCalledOnce();
  });

  it("rolls back the previous-admin update if the new assignment fails", async () => {
    const hostelId = HOSTEL_ID.toHexString();
    const previous = admin(PREVIOUS_ADMIN_ID, {
      status: ACCOUNT_STATUS.ACTIVE,
      hostelId,
    });
    const next = admin(ADMIN_ID);
    const h = createHarness({ users: [previous, next], failUpdateNumber: 2 });

    await expect(assignHostelMessAdmin({
      hostelId,
      messAdminId: ADMIN_ID.toHexString(),
    })).rejects.toThrow("simulated update failure");

    expect(h.state.users.find((user) => user._id.equals(PREVIOUS_ADMIN_ID)).hostelId).toBe(hostelId);
    const restoredNext = h.state.users.find((user) => user._id.equals(ADMIN_ID));
    expect(restoredNext).toMatchObject({ role: USER_ROLE.MESS_ADMIN, status: ACCOUNT_STATUS.PENDING });
    expect(restoredNext.hostelId).toBeUndefined();
    expect(h.session.endSession).toHaveBeenCalledOnce();
  });

  it("converts a duplicate active assignment conflict into a retryable authorization error", async () => {
    const h = createHarness({
      transactionError: Object.assign(new Error("duplicate key"), { code: 11000 }),
    });

    await expect(assignHostelMessAdmin({
      hostelId: HOSTEL_ID.toHexString(),
      messAdminId: ADMIN_ID.toHexString(),
    })).rejects.toMatchObject({
      status: 409,
      code: "HOSTEL_ADMIN_CONFLICT",
    });
    expect(h.session.endSession).toHaveBeenCalledOnce();
  });
});
