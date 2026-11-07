
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { USER_ROLE, ACCOUNT_STATUS } from "../../../../../lib/auth-contracts.js";

const { requireActiveRolesMock, getMongoDbMock } = vi.hoisted(() => ({
  requireActiveRolesMock: vi.fn(),
  getMongoDbMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("../../../../../lib/mongodb.js", () => ({
  getMongoDb: getMongoDbMock,
  getMongoClient: vi.fn(),
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

const { GET } = await import("./route.js");

const activeAdmin = {
  id: "admin-1",
  role: USER_ROLE.SUPER_ADMIN,
  status: ACCOUNT_STATUS.ACTIVE,
};

const queueId = new ObjectId();
const hostelId = new ObjectId();

function createRequest(url) {
  return new Request(url);
}

function setupDatabase() {
  const findOneMock = vi.fn().mockResolvedValue({
    _id: queueId,
    hostelId,
  });

  const toArrayMock = vi.fn().mockResolvedValue([]);
  const limitMock = vi.fn().mockReturnValue({ toArray: toArrayMock });
  const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
  const sortMock = vi.fn().mockReturnValue({ skip: skipMock });
  const findMock = vi.fn().mockReturnValue({ sort: sortMock });
  const countDocumentsMock = vi.fn().mockResolvedValue(0);

  const db = {
    collection: vi.fn((name) => {
      if (name === "queues") {
        return { findOne: findOneMock };
      }

      if (name === "queueHistory") {
        return {
          find: findMock,
          countDocuments: countDocumentsMock,
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    }),
  };

  getMongoDbMock.mockResolvedValue(db);

  return {
    findMock,
    countDocumentsMock,
    findOneMock,
  };
}

describe("GET /api/queues/[id]/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActiveRolesMock.mockResolvedValue(activeAdmin);
  });

  it("includes the complete selected IST date in the upper date boundary", async () => {
    const { findMock, countDocumentsMock } = setupDatabase();

    const response = await GET(
      createRequest(
        "http://localhost/api/queues/test/history?to=2026-11-07"
      ),
      { params: { id: queueId.toString() } }
    );

    expect(response.status).toBe(200);

    const filter = findMock.mock.calls[0][0];

    expect(filter.recordedAt.$lt).toEqual(
      new Date("2026-11-07T18:30:00.000Z")
    );

    expect(filter.recordedAt.$lte).toBeUndefined();

    expect(countDocumentsMock).toHaveBeenCalledWith(filter);
  });

  it("rejects an invalid date before connecting to MongoDB", async () => {
    const response = await GET(
      createRequest(
        "http://localhost/api/queues/test/history?to=2026-02-30"
      ),
      { params: { id: queueId.toString() } }
    );

    expect(response.status).toBe(400);

    const result = await response.json();

    expect(result.success).toBe(false);
    expect(result.error.code).toBe("INVALID_TO_DATE");
    expect(getMongoDbMock).not.toHaveBeenCalled();
  });
});
