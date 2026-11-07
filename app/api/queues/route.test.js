
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import {
  USER_ROLE,
  ACCOUNT_STATUS,
  HOSTEL_COLLECTION,
  MESS_COLLECTION,
} from "../../../lib/auth-contracts.js";
import {
  COUNTER_COLLECTION,
  QUEUE_COLLECTION,
  QUEUE_HISTORY_COLLECTION,
} from "../../../lib/domain-contracts.js";

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

const { GET, POST } = await import("./route.js");

const activeStudent = {
  id: "student-1",
  role: USER_ROLE.STUDENT,
  status: ACCOUNT_STATUS.ACTIVE,
  hostelId: "507f1f77bcf86cd799439011",
};

const activeAdmin = {
  id: "admin-1",
  role: USER_ROLE.SUPER_ADMIN,
  status: ACCOUNT_STATUS.ACTIVE,
};

const testIds = {
  hostelId: new ObjectId("507f1f77bcf86cd799439011"),
  messId: new ObjectId("507f1f77bcf86cd799439012"),
  counterId: new ObjectId("507f1f77bcf86cd799439013"),
};

function createRequest(url, body) {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined
      ? {
          body:
            typeof body === "string"
              ? body
              : JSON.stringify(body),
        }
      : {}),
  });
}

function setupQueueFindMock(queues = []) {
  const toArrayMock = vi.fn().mockResolvedValue(queues);
  const sortMock = vi.fn().mockReturnValue({
    toArray: toArrayMock,
  });
  const findMock = vi.fn().mockReturnValue({
    sort: sortMock,
  });

  getMongoDbMock.mockResolvedValue({
    collection: vi.fn().mockReturnValue({
      find: findMock,
    }),
  });

  return { findMock, sortMock, toArrayMock };
}


function setupStudentQueueFindMock({
  queues = [],
  hostel = { _id: testIds.hostelId, status: "ACTIVE" },
  messes = [{ _id: testIds.messId }],
  counters = [{ _id: testIds.counterId }],
} = {}) {
  const hostelFindOneMock = vi.fn().mockResolvedValue(hostel);

  const messToArrayMock = vi.fn().mockResolvedValue(messes);
  const messProjectMock = vi.fn().mockReturnValue({
    toArray: messToArrayMock,
  });
  const messFindMock = vi.fn().mockReturnValue({
    project: messProjectMock,
  });

  const counterToArrayMock = vi.fn().mockResolvedValue(counters);
  const counterProjectMock = vi.fn().mockReturnValue({
    toArray: counterToArrayMock,
  });
  const counterFindMock = vi.fn().mockReturnValue({
    project: counterProjectMock,
  });

  const queueToArrayMock = vi.fn().mockResolvedValue(queues);
  const queueSortMock = vi.fn().mockReturnValue({
    toArray: queueToArrayMock,
  });
  const queueFindMock = vi.fn().mockReturnValue({
    sort: queueSortMock,
  });

  const collections = {
    [HOSTEL_COLLECTION]: { findOne: hostelFindOneMock },
    [MESS_COLLECTION]: { find: messFindMock },
    [COUNTER_COLLECTION]: { find: counterFindMock },
    [QUEUE_COLLECTION]: { find: queueFindMock },
  };

  getMongoDbMock.mockResolvedValue({
    collection: vi.fn((name) => {
      if (!collections[name]) {
        throw new Error(`Unexpected collection: ${name}`);
      }
      return collections[name];
    }),
  });

  return {
    hostelFindOneMock,
    messFindMock,
    messProjectMock,
    counterFindMock,
    counterProjectMock,
    queueFindMock,
    queueSortMock,
    queueToArrayMock,
  };
}

function createTransientTransactionError() {
  const error = new Error("Simulated transient transaction conflict.");

  error.errorLabels = ["TransientTransactionError"];
  error.hasErrorLabel = (label) =>
    error.errorLabels.includes(label);

  return error;
}

// Creates a Queue creation transaction environment.
// failedEntity can be "counter", "mess", or "hostel".
// beforeRetry can modify collection responses before a retry.
function setupQueueCreationTransaction(
  failedEntity = null,
  { beforeRetry } = {}
) {
  let collections;
  let transactionAttempts = 0;

  const session = {
    withTransaction: vi.fn(async (callback) => {
      const maxAttempts = 2;

      while (transactionAttempts < maxAttempts) {
        transactionAttempts += 1;

        try {
          await callback();
          return;
        } catch (error) {
          const isTransient =
            error.hasErrorLabel?.("TransientTransactionError");

          if (!isTransient || transactionAttempts >= maxAttempts) {
            throw error;
          }

          if (beforeRetry) {
            await beforeRetry({
              collections,
              transactionAttempts,
            });
          }
        }
      }
    }),

    endSession: vi.fn().mockResolvedValue(undefined),
  };

  const counter = {
    _id: testIds.counterId,
    hostelId: testIds.hostelId,
    messId: testIds.messId,
    status: "ACTIVE",
    defaultServingRatePerMinute: 2,
  };

  const hostel = {
    _id: testIds.hostelId,
    status: "ACTIVE",
  };

  const mess = {
    _id: testIds.messId,
    hostelId: testIds.hostelId,
    status: "ACTIVE",
  };

  const counterCollection = {
    findOne: vi.fn().mockResolvedValue(counter),
    updateOne: vi.fn().mockResolvedValue({
      matchedCount: failedEntity === "counter" ? 0 : 1,
      modifiedCount: failedEntity === "counter" ? 0 : 1,
    }),
  };

  const messCollection = {
    findOne: vi.fn().mockResolvedValue(mess),
    updateOne: vi.fn().mockResolvedValue({
      matchedCount: failedEntity === "mess" ? 0 : 1,
      modifiedCount: failedEntity === "mess" ? 0 : 1,
    }),
  };

  const hostelCollection = {
    findOne: vi.fn().mockResolvedValue(hostel),
    updateOne: vi.fn().mockResolvedValue({
      matchedCount: failedEntity === "hostel" ? 0 : 1,
      modifiedCount: failedEntity === "hostel" ? 0 : 1,
    }),
  };

  const queueCollection = {
    insertOne: vi.fn().mockResolvedValue({
      acknowledged: true,
    }),
  };

  const historyCollection = {
    insertOne: vi.fn().mockResolvedValue({
      acknowledged: true,
    }),
  };

  collections = {
    [COUNTER_COLLECTION]: counterCollection,
    [MESS_COLLECTION]: messCollection,
    [HOSTEL_COLLECTION]: hostelCollection,
    [QUEUE_COLLECTION]: queueCollection,
    [QUEUE_HISTORY_COLLECTION]: historyCollection,
  };

  const db = {
    collection: vi.fn((name) => {
      const collection = collections[name];

      if (!collection) {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return collection;
    }),
  };

  getMongoDbMock.mockResolvedValue(db);

  getMongoClientMock.mockResolvedValue({
    startSession: vi.fn(() => session),
  });

  return {
    session,
    db,
    collections,
    counterCollection,
    messCollection,
    hostelCollection,
    queueCollection,
    historyCollection,
  };
}

describe("Queue API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/queues", () => {
    it("rejects requests when authorization fails", async () => {
      requireActiveRolesMock.mockRejectedValue(
        Object.assign(new Error("Sign in is required."), {
          status: 401,
          code: "UNAUTHENTICATED",
        })
      );

      const response = await GET(
        createRequest("http://localhost/api/queues")
      );

      expect(response.status).toBe(401);

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("UNAUTHENTICATED");
      expect(getMongoDbMock).not.toHaveBeenCalled();
    });

    it("restricts students to open queues under active hostels, messes, and counters", async () => {
      const queues = [
        {
          _id: { toString: () => "queue-1" },
          hostelId: testIds.hostelId,
          messId: testIds.messId,
          counterId: testIds.counterId,
          mealType: "LUNCH",
          peopleWaiting: 5,
          servingRatePerMinute: 2,
          isOpen: true,
          sessionId: "session-1",
          serviceDate: "2026-11-06",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mocks = setupStudentQueueFindMock({ queues });
      requireActiveRolesMock.mockResolvedValue(activeStudent);

      const response = await GET(
        createRequest("http://localhost/api/queues")
      );

      expect(response.status).toBe(200);
      expect(mocks.hostelFindOneMock).toHaveBeenCalledWith({
        _id: expect.any(Object),
        status: "ACTIVE",
      });
      expect(mocks.messFindMock).toHaveBeenCalledWith({
        hostelId: expect.any(Object),
        status: "ACTIVE",
      });
      expect(mocks.counterFindMock).toHaveBeenCalledWith({
        hostelId: expect.any(Object),
        messId: { $in: [testIds.messId] },
        status: "ACTIVE",
      });
      expect(mocks.queueFindMock).toHaveBeenCalledWith({
        hostelId: expect.any(Object),
        messId: { $in: [testIds.messId] },
        counterId: { $in: [testIds.counterId] },
        isOpen: true,
      });

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].mealType).toBe("LUNCH");
    });

    it("returns no student queues when the hostel is inactive", async () => {
      const mocks = setupStudentQueueFindMock({ hostel: null });
      requireActiveRolesMock.mockResolvedValue(activeStudent);

      const response = await GET(
        createRequest("http://localhost/api/queues")
      );
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data).toEqual([]);
      expect(mocks.messFindMock).not.toHaveBeenCalled();
      expect(mocks.counterFindMock).not.toHaveBeenCalled();
      expect(mocks.queueFindMock).not.toHaveBeenCalled();
    });

    it("returns no student queues when there are no active messes", async () => {
      const mocks = setupStudentQueueFindMock({ messes: [] });
      requireActiveRolesMock.mockResolvedValue(activeStudent);

      const response = await GET(
        createRequest("http://localhost/api/queues")
      );
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data).toEqual([]);
      expect(mocks.counterFindMock).not.toHaveBeenCalled();
      expect(mocks.queueFindMock).not.toHaveBeenCalled();
    });

    it("returns no student queues when there are no active counters", async () => {
      const mocks = setupStudentQueueFindMock({ counters: [] });
      requireActiveRolesMock.mockResolvedValue(activeStudent);

      const response = await GET(
        createRequest("http://localhost/api/queues")
      );
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data).toEqual([]);
      expect(mocks.queueFindMock).not.toHaveBeenCalled();
    });

    it("does not expose queues for a requested inactive mess", async () => {
      const mocks = setupStudentQueueFindMock({
        messes: [{ _id: testIds.messId }],
      });
      requireActiveRolesMock.mockResolvedValue(activeStudent);

      const response = await GET(
        createRequest(
          `http://localhost/api/queues?messId=507f1f77bcf86cd799439099`
        )
      );
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data).toEqual([]);
      expect(mocks.counterFindMock).not.toHaveBeenCalled();
      expect(mocks.queueFindMock).not.toHaveBeenCalled();
    });

    it("does not expose queues for a requested inactive counter", async () => {
      const mocks = setupStudentQueueFindMock({ counters: [] });
      requireActiveRolesMock.mockResolvedValue(activeStudent);

      const response = await GET(
        createRequest(
          `http://localhost/api/queues?counterId=507f1f77bcf86cd799439099`
        )
      );
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data).toEqual([]);
      expect(mocks.counterFindMock).toHaveBeenCalledWith({
        hostelId: expect.any(Object),
        messId: { $in: [testIds.messId] },
        status: "ACTIVE",
        _id: expect.any(Object),
      });
      expect(mocks.queueFindMock).not.toHaveBeenCalled();
    });

    it("applies a valid status filter directly to the MongoDB query", async () => {
      requireActiveRolesMock.mockResolvedValue(activeAdmin);

      const { findMock } = setupQueueFindMock([]);

      const response = await GET(
        createRequest("http://localhost/api/queues?status=busy")
      );

      expect(response.status).toBe(200);
      expect(findMock).toHaveBeenCalledWith({
        status: "busy",
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("rejects an invalid queue status before connecting to MongoDB", async () => {
      requireActiveRolesMock.mockResolvedValue(activeAdmin);

      const response = await GET(
        createRequest("http://localhost/api/queues?status=invalid")
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("INVALID_QUEUE_STATUS");
      expect(getMongoDbMock).not.toHaveBeenCalled();
    });

    it("rejects an invalid meal type", async () => {
      requireActiveRolesMock.mockResolvedValue(activeStudent);

      const response = await GET(
        createRequest("http://localhost/api/queues?mealType=INVALID")
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.error.code).toBe("INVALID_MEAL_TYPE");
      expect(getMongoDbMock).not.toHaveBeenCalled();
    });

    it("rejects an invalid counter ID", async () => {
      requireActiveRolesMock.mockResolvedValue(activeStudent);

      const response = await GET(
        createRequest("http://localhost/api/queues?counterId=invalid")
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.error.code).toBe("INVALID_INPUT");
      expect(getMongoDbMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/queues", () => {
    beforeEach(() => {
      requireActiveRolesMock.mockResolvedValue(activeAdmin);
    });

    it("rejects malformed JSON", async () => {
      const response = await POST(
        createRequest("http://localhost/api/queues", "{invalid-json")
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.error.code).toBe("INVALID_JSON");
      expect(getMongoDbMock).not.toHaveBeenCalled();
    });

    it("rejects an array instead of a JSON object", async () => {
      const response = await POST(
        createRequest("http://localhost/api/queues", [
          "counter-1",
          "LUNCH",
        ])
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.error.code).toBe("INVALID_BODY");
    });

    it("requires counterId and mealType", async () => {
      const response = await POST(
        createRequest("http://localhost/api/queues", {})
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.error.code).toBe("MISSING_REQUIRED_FIELDS");
      expect(getMongoDbMock).not.toHaveBeenCalled();
    });

    it("rejects an unsupported meal type", async () => {
      const response = await POST(
        createRequest("http://localhost/api/queues", {
          counterId: testIds.counterId.toString(),
          mealType: "BRUNCH",
        })
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.error.code).toBe("INVALID_MEAL_TYPE");
    });

    it("rejects a non-positive serving rate", async () => {
      const response = await POST(
        createRequest("http://localhost/api/queues", {
          counterId: testIds.counterId.toString(),
          mealType: "LUNCH",
          servingRatePerMinute: 0,
        })
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.error.code).toBe("INVALID_SERVING_RATE");
    });

    it("increments all three entity versions and inserts Queue and history atomically", async () => {
      const setup = setupQueueCreationTransaction();

      const response = await POST(
        createRequest("http://localhost/api/queues", {
          counterId: testIds.counterId.toString(),
          mealType: "LUNCH",
        })
      );

      expect(response.status).toBe(201);

      const result = await response.json();
      expect(result.success).toBe(true);

      const { session } = setup;

      expect(setup.counterCollection.updateOne).toHaveBeenCalledWith(
        {
          _id: testIds.counterId,
          hostelId: testIds.hostelId,
          messId: testIds.messId,
          status: "ACTIVE",
        },
        { $inc: { queueMutationVersion: 1 } },
        { session }
      );

      expect(setup.messCollection.updateOne).toHaveBeenCalledWith(
        {
          _id: testIds.messId,
          hostelId: testIds.hostelId,
          status: "ACTIVE",
        },
        { $inc: { queueMutationVersion: 1 } },
        { session }
      );

      expect(setup.hostelCollection.updateOne).toHaveBeenCalledWith(
        {
          _id: testIds.hostelId,
          status: "ACTIVE",
        },
        { $inc: { queueMutationVersion: 1 } },
        { session }
      );

      expect(setup.queueCollection.insertOne).toHaveBeenCalledTimes(1);
      expect(setup.historyCollection.insertOne).toHaveBeenCalledTimes(1);

      expect(setup.queueCollection.insertOne.mock.calls[0][1]).toEqual({
        session,
      });

      expect(setup.historyCollection.insertOne.mock.calls[0][1]).toEqual({
        session,
      });

      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });

    it.each(["counter", "mess", "hostel"])(
      "aborts Queue creation when the %s guard matches zero documents",
      async (failedEntity) => {
        const setup = setupQueueCreationTransaction(failedEntity);

        const response = await POST(
          createRequest("http://localhost/api/queues", {
            counterId: testIds.counterId.toString(),
            mealType: "LUNCH",
          })
        );

        expect(response.status).toBe(409);

        const result = await response.json();

        expect(result.success).toBe(false);
        expect(result.error.code).toBe("PARENT_ENTITY_INACTIVE");

        expect(setup.queueCollection.insertOne).not.toHaveBeenCalled();
        expect(setup.historyCollection.insertOne).not.toHaveBeenCalled();

        expect(setup.session.endSession).toHaveBeenCalledTimes(1);
      }
    );

    it("retries a transient transaction conflict and succeeds", async () => {
      const setup = setupQueueCreationTransaction();

      setup.counterCollection.updateOne
        .mockRejectedValueOnce(createTransientTransactionError());

      const response = await POST(
        createRequest("http://localhost/api/queues", {
          counterId: testIds.counterId.toString(),
          mealType: "LUNCH",
        })
      );

      expect(response.status).toBe(201);

      expect(setup.session.withTransaction).toHaveBeenCalledTimes(1);

      // First attempt conflicts; the second attempt rechecks the Counter.
      expect(setup.counterCollection.updateOne).toHaveBeenCalledTimes(2);

      expect(setup.messCollection.updateOne).toHaveBeenCalledTimes(1);
      expect(setup.hostelCollection.updateOne).toHaveBeenCalledTimes(1);

      expect(setup.queueCollection.insertOne).toHaveBeenCalledTimes(1);
      expect(setup.historyCollection.insertOne).toHaveBeenCalledTimes(1);

      expect(setup.session.endSession).toHaveBeenCalledTimes(1);
    });

    it("aborts on retry when the Mess becomes inactive", async () => {
      const setup = setupQueueCreationTransaction(null, {
        beforeRetry: async ({ collections }) => {
          collections[MESS_COLLECTION].updateOne.mockResolvedValue({
            matchedCount: 0,
            modifiedCount: 0,
          });
        },
      });

      setup.counterCollection.updateOne
        .mockRejectedValueOnce(createTransientTransactionError());

      const response = await POST(
        createRequest("http://localhost/api/queues", {
          counterId: testIds.counterId.toString(),
          mealType: "LUNCH",
        })
      );

      expect(response.status).toBe(409);

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("PARENT_ENTITY_INACTIVE");

      expect(setup.counterCollection.updateOne).toHaveBeenCalledTimes(2);
      expect(setup.messCollection.updateOne).toHaveBeenCalledTimes(1);

      expect(setup.hostelCollection.updateOne).not.toHaveBeenCalled();

      expect(setup.queueCollection.insertOne).not.toHaveBeenCalled();
      expect(setup.historyCollection.insertOne).not.toHaveBeenCalled();

      expect(setup.session.endSession).toHaveBeenCalledTimes(1);
    });
  });
});
