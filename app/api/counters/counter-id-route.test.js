import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "bson";
import { USER_ROLE, ACCOUNT_STATUS } from "../../../lib/auth-contracts.js";

const {
  requireActiveRolesMock,
  getMongoDbMock,
  getMongoClientMock,
} = vi.hoisted(() => ({
  requireActiveRolesMock: vi.fn(),
  getMongoDbMock: vi.fn(),
  getMongoClientMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("../../../lib/mongodb.js", () => ({
  getMongoDb: getMongoDbMock,
  getMongoClient: getMongoClientMock,
}));

vi.mock("../../../lib/auth-authorization.js", () => ({
  requireActiveRoles: requireActiveRolesMock,
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message, status = 403, code = "FORBIDDEN") {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

const { PATCH } = await import("./[id]/route.js");

const counterId = new ObjectId("507f1f77bcf86cd799439011");
const hostelId = new ObjectId("507f1f77bcf86cd799439012");
const messId = new ObjectId("507f1f77bcf86cd799439013");

const activeAdmin = {
  id: "admin-1",
  role: USER_ROLE.SUPER_ADMIN,
  status: ACCOUNT_STATUS.ACTIVE,
};

const activeCounter = {
  _id: counterId,
  hostelId,
  messId,
  name: "Main Counter",
  code: "MAIN",
  defaultServingRatePerMinute: 4,
  status: "ACTIVE",
  createdAt: new Date(),
  updatedAt: new Date(),
};

let collections;
let sessionMock;
let dbMock;

function createRequest(body) {
  return new Request("http://localhost/api/counters/" + counterId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function setupDatabase({
  counter = activeCounter,
  hostel = { _id: hostelId, status: "ACTIVE" },
  mess = { _id: messId, hostelId, status: "ACTIVE" },
  queues = [],
  queueUpdateResult = { modifiedCount: 1 },
} = {}) {
  const findOneCounterMock = vi.fn().mockResolvedValue(counter);
  const updateCounterMock = vi.fn().mockResolvedValue({ modifiedCount: 1 });

  const findOneHostelMock = vi.fn().mockResolvedValue(hostel);
  const findOneMessMock = vi.fn().mockResolvedValue(mess);

  const queueToArrayMock = vi.fn().mockResolvedValue(queues);
  const queueFindMock = vi.fn().mockReturnValue({
    toArray: queueToArrayMock,
  });
  const updateQueueMock = vi.fn().mockResolvedValue(queueUpdateResult);
  const insertHistoryMock = vi.fn().mockResolvedValue({ insertedId: new ObjectId() });

  collections = {
    counters: {
      findOne: findOneCounterMock,
      updateOne: updateCounterMock,
    },
    hostels: {
      findOne: findOneHostelMock,
    },
    messes: {
      findOne: findOneMessMock,
    },
    queues: {
      find: queueFindMock,
      updateOne: updateQueueMock,
    },
    queueHistory: {
      insertOne: insertHistoryMock,
    },
  };

  dbMock = {
    collection: vi.fn((name) => {
      if (!collections[name]) {
        throw new Error("Unexpected collection: " + name);
      }
      return collections[name];
    }),
  };

  sessionMock = {
    withTransaction: vi.fn(async (callback) => callback()),
    endSession: vi.fn().mockResolvedValue(undefined),
  };

  getMongoDbMock.mockResolvedValue(dbMock);
  getMongoClientMock.mockResolvedValue({
    startSession: vi.fn(() => sessionMock),
  });

  return {
    findOneCounterMock,
    updateCounterMock,
    findOneHostelMock,
    findOneMessMock,
    queueFindMock,
    updateQueueMock,
    insertHistoryMock,
  };
}

describe("PATCH /api/counters/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActiveRolesMock.mockResolvedValue(activeAdmin);
  });

  it("rejects unauthenticated requests", async () => {
    requireActiveRolesMock.mockRejectedValue(
      Object.assign(new Error("Sign in is required."), {
        status: 401,
        code: "UNAUTHENTICATED",
      })
    );

    const response = await PATCH(createRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: counterId.toString() }),
    });

    expect(response.status).toBe(401);
    expect(getMongoDbMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid counter ID", async () => {
    const response = await PATCH(createRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: "invalid-id" }),
    });

    expect(response.status).toBe(400);
    expect(getMongoDbMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the counter does not exist", async () => {
    setupDatabase({ counter: null });

    const response = await PATCH(createRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: counterId.toString() }),
    });

    const result = await response.json();

    expect(response.status).toBe(404);
    expect(result.error.code).toBe("COUNTER_NOT_FOUND");
    expect(sessionMock.endSession).toHaveBeenCalled();
  });

  it("prevents a Mess Admin from updating another hostel's counter", async () => {
    requireActiveRolesMock.mockResolvedValue({
      id: "mess-admin-1",
      role: USER_ROLE.MESS_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      hostelId: new ObjectId("507f1f77bcf86cd799439099").toString(),
    });

    setupDatabase();

    const response = await PATCH(createRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: counterId.toString() }),
    });

    const result = await response.json();

    expect(response.status).toBe(403);
    expect(result.error.code).toBe("HOSTEL_SCOPE_REQUIRED");
  });

  it("prevents reactivation when the parent Hostel is inactive", async () => {
    setupDatabase({
      counter: { ...activeCounter, status: "INACTIVE" },
      hostel: null,
    });

    const response = await PATCH(createRequest({ status: "ACTIVE" }), {
      params: Promise.resolve({ id: counterId.toString() }),
    });

    const result = await response.json();

    expect(response.status).toBe(409);
    expect(result.error.code).toBe("PARENT_ENTITY_INACTIVE");
    expect(collections.counters.updateOne).not.toHaveBeenCalled();
  });

  it("prevents reactivation when the parent Mess is inactive", async () => {
    setupDatabase({
      counter: { ...activeCounter, status: "INACTIVE" },
      mess: null,
    });

    const response = await PATCH(createRequest({ status: "ACTIVE" }), {
      params: Promise.resolve({ id: counterId.toString() }),
    });

    const result = await response.json();

    expect(response.status).toBe(409);
    expect(result.error.code).toBe("PARENT_ENTITY_INACTIVE");
    expect(collections.counters.updateOne).not.toHaveBeenCalled();
  });

  it("updates counter details successfully", async () => {
    const mocks = setupDatabase();

    const response = await PATCH(createRequest({ name: "North Counter" }), {
      params: Promise.resolve({ id: counterId.toString() }),
    });

    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("North Counter");

    expect(mocks.updateCounterMock).toHaveBeenCalledWith(
      { _id: counterId },
      {
        $set: expect.objectContaining({
          name: "North Counter",
        }),
      },
      { session: sessionMock }
    );
  });

  it("closes active queues and records history when deactivating a counter", async () => {
    const queue = {
      _id: new ObjectId(),
      queueId: new ObjectId(),
      hostelId,
      messId,
      counterId,
      mealType: "LUNCH",
      sessionId: "session-1",
      peopleWaiting: 12,
      servingRatePerMinute: 4,
      estimatedWaitMinutes: 3,
      crowdLevel: "moderate",
      status: "busy",
      isOpen: true,
    };

    const mocks = setupDatabase({ queues: [queue] });

    const response = await PATCH(createRequest({ status: "INACTIVE" }), {
      params: Promise.resolve({ id: counterId.toString() }),
    });

    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.status).toBe("INACTIVE");

    expect(mocks.updateQueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: queue._id,
        isOpen: true,
        sessionId: "session-1",
      }),
      {
        $set: expect.objectContaining({
          isOpen: false,
          status: "closed",
        }),
      },
      { session: sessionMock }
    );

    expect(mocks.insertHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queueId: queue._id,
        sessionId: "session-1",
        isOpen: false,
        status: "closed",
        updatedBy: activeAdmin.id,
      }),
      { session: sessionMock }
    );
  });

  it("returns 409 for a duplicate counter code", async () => {
    setupDatabase();

    collections.counters.updateOne.mockRejectedValue({
      code: 11000,
    });

    const response = await PATCH(createRequest({ code: "MAIN-2" }), {
      params: Promise.resolve({ id: counterId.toString() }),
    });

    const result = await response.json();

    expect(response.status).toBe(409);
    expect(result.error.code).toBe("DUPLICATE_COUNTER_CODE");
  });
});



