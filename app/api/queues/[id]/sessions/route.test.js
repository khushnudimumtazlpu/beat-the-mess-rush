
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ObjectId } from "mongodb";
import { USER_ROLE, ACCOUNT_STATUS, HOSTEL_COLLECTION, MESS_COLLECTION } from "../../../../../lib/auth-contracts.js";
import {
  COUNTER_COLLECTION,
  QUEUE_COLLECTION,
  QUEUE_HISTORY_COLLECTION,
} from "../../../../../lib/domain-contracts.js";

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

vi.mock("../../../../../lib/mongodb.js", () => ({
  getMongoDb: getMongoDbMock,
  getMongoClient: getMongoClientMock,
}));

vi.mock("../../../../../lib/auth-authorization.js", () => ({
  requireActiveRoles: requireActiveRolesMock,
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message, status = 403, code = "FORBIDDEN") {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

const { POST } = await import("./route.js");

const activeAdmin = {
  id: "admin-1",
  role: USER_ROLE.SUPER_ADMIN,
  status: ACCOUNT_STATUS.ACTIVE,
};

const queueId = new ObjectId();
const hostelId = new ObjectId();
const messId = new ObjectId();
const counterId = new ObjectId();

function createRequest() {
  return new Request(
    `http://localhost/api/queues/${queueId}/sessions`,
    { method: "POST" }
  );
}

function setupDatabase() {
  const queue = {
    _id: queueId,
    hostelId,
    messId,
    counterId,
    mealType: "LUNCH",
    peopleWaiting: 5,
    servingRatePerMinute: 2,
    isOpen: false,
    sessionId: "previous-session",
    serviceDate: "2026-11-07",
    createdAt: new Date("2026-11-07T10:00:00.000Z"),
    updatedAt: new Date("2026-11-07T10:00:00.000Z"),
  };

  const counter = {
    _id: counterId,
    defaultServingRatePerMinute: 2,
  };

  const updateOneMock = vi.fn().mockResolvedValue({
    matchedCount: 1,
  });

  const insertOneMock = vi.fn().mockResolvedValue({
    acknowledged: true,
  });

  const db = {
    collection: vi.fn((name) => {
      if (name === QUEUE_COLLECTION) {
        return {
          findOne: vi.fn().mockResolvedValue(queue),
          updateOne: updateOneMock,
        };
      }

      if (name === COUNTER_COLLECTION) {
        return {
          findOne: vi.fn().mockResolvedValue(counter),
        };
      }

      if (name === HOSTEL_COLLECTION) {
        return {
          findOne: vi.fn().mockResolvedValue({
            _id: hostelId,
            status: "ACTIVE",
          }),
        };
      }

      if (name === MESS_COLLECTION) {
        return {
          findOne: vi.fn().mockResolvedValue({
            _id: messId,
            hostelId,
            status: "ACTIVE",
          }),
        };
      }

      if (name === QUEUE_HISTORY_COLLECTION) {
        return { insertOne: insertOneMock };
      }

      throw new Error(`Unexpected collection: ${name}`);
    }),
  };

  const transactionSession = {
    withTransaction: vi.fn(async (callback) => callback()),
    endSession: vi.fn().mockResolvedValue(undefined),
  };

  const startSessionMock = vi.fn().mockReturnValue(transactionSession);

  getMongoDbMock.mockResolvedValue(db);
  getMongoClientMock.mockResolvedValue({
    startSession: startSessionMock,
  });

  return {
    updateOneMock,
    insertOneMock,
    transactionSession,
  };
}

describe("POST /api/queues/[id]/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireActiveRolesMock.mockResolvedValue(activeAdmin);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T20:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the Asia/Kolkata service date when starting a new session", async () => {
    const {
      updateOneMock,
      insertOneMock,
      transactionSession,
    } = setupDatabase();

    const response = await POST(createRequest(), {
      params: { id: queueId.toString() },
    });

    expect(response.status).toBe(201);

    const updateCall = updateOneMock.mock.calls[0];

    expect(updateCall[1].$set).toEqual(
      expect.objectContaining({
        serviceDate: "2026-11-08",
        peopleWaiting: 0,
        isOpen: true,
      })
    );

    expect(insertOneMock).toHaveBeenCalledTimes(1);
    expect(transactionSession.endSession).toHaveBeenCalled();
  });
});
