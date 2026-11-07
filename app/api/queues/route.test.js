
import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_ROLE, ACCOUNT_STATUS } from "../../../lib/auth-contracts.js";

const { requireActiveRolesMock, getMongoDbMock } = vi.hoisted(() => ({
  requireActiveRolesMock: vi.fn(),
  getMongoDbMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("../../../lib/mongodb.js", () => ({
  getMongoDb: getMongoDbMock,
  getMongoClient: vi.fn(),
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

function createRequest(url, body) {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
}

function setupQueueFindMock(queues = []) {
  const toArrayMock = vi.fn().mockResolvedValue(queues);
  const sortMock = vi.fn().mockReturnValue({ toArray: toArrayMock });
  const findMock = vi.fn().mockReturnValue({ sort: sortMock });

  getMongoDbMock.mockResolvedValue({
    collection: vi.fn().mockReturnValue({
      find: findMock,
    }),
  });

  return { findMock, sortMock, toArrayMock };
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

    it("restricts student queue queries to their assigned hostel", async () => {
      const queues = [
        {
          _id: { toString: () => "queue-1" },
          hostelId: { toString: () => "507f1f77bcf86cd799439011" },
          messId: { toString: () => "mess-1" },
          counterId: { toString: () => "counter-1" },
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

      const { findMock } = setupQueueFindMock(queues);

      requireActiveRolesMock.mockResolvedValue(activeStudent);

      const response = await GET(
        createRequest("http://localhost/api/queues")
      );

      expect(response.status).toBe(200);

      expect(findMock).toHaveBeenCalledWith({
        hostelId: expect.any(Object),
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].mealType).toBe("LUNCH");
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
        createRequest(
          "http://localhost/api/queues?mealType=INVALID"
        )
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.error.code).toBe("INVALID_MEAL_TYPE");
      expect(getMongoDbMock).not.toHaveBeenCalled();
    });

    it("rejects an invalid counter ID", async () => {
      requireActiveRolesMock.mockResolvedValue(activeStudent);

      const response = await GET(
        createRequest(
          "http://localhost/api/queues?counterId=invalid"
        )
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
        createRequest(
          "http://localhost/api/queues",
          "{invalid-json"
        )
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.error.code).toBe("INVALID_JSON");
      expect(getMongoDbMock).not.toHaveBeenCalled();
    });

    it("rejects an array instead of a JSON object", async () => {
      const response = await POST(
        createRequest(
          "http://localhost/api/queues",
          ["counter-1", "LUNCH"]
        )
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
          counterId: "507f1f77bcf86cd799439011",
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
          counterId: "507f1f77bcf86cd799439011",
          mealType: "LUNCH",
          servingRatePerMinute: 0,
        })
      );

      expect(response.status).toBe(400);

      const result = await response.json();

      expect(result.error.code).toBe("INVALID_SERVING_RATE");
    });
  });
});
