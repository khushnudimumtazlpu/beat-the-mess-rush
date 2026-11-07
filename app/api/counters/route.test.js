
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

const { GET, POST } = await import("./route.js");

const hostelId = new ObjectId("507f1f77bcf86cd799439012");
const messId = new ObjectId("507f1f77bcf86cd799439013");
const counterId = new ObjectId("507f1f77bcf86cd799439014");

const activeAdmin = {
  id: "admin-1",
  role: USER_ROLE.SUPER_ADMIN,
  status: ACCOUNT_STATUS.ACTIVE,
};

const activeMessAdmin = {
  id: "mess-admin-1",
  role: USER_ROLE.MESS_ADMIN,
  status: ACCOUNT_STATUS.ACTIVE,
  hostelId: hostelId.toString(),
};

const activeStudent = {
  id: "student-1",
  role: USER_ROLE.STUDENT,
  status: ACCOUNT_STATUS.ACTIVE,
  hostelId: hostelId.toString(),
};

const activeMess = {
  _id: messId,
  hostelId,
  status: "ACTIVE",
};

const activeHostel = {
  _id: hostelId,
  status: "ACTIVE",
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
let mocks;

function createRequest(url = "http://localhost/api/counters", body) {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined
      ? {}
      : {
          body:
            typeof body === "string"
              ? body
              : JSON.stringify(body),
        }),
  });
}

function setupDatabase({
  hostel = activeHostel,
  mess = activeMess,
  counters = [activeCounter],
} = {}) {
  const findOneHostelMock = vi.fn().mockResolvedValue(hostel);
  const findOneMessMock = vi.fn().mockResolvedValue(mess);
  const insertCounterMock = vi.fn().mockResolvedValue({
    insertedId: counterId,
  });

  const counterToArrayMock = vi.fn().mockResolvedValue(counters);
  const counterSortMock = vi.fn().mockReturnValue({
    toArray: counterToArrayMock,
  });
  const counterFindMock = vi.fn().mockReturnValue({
    sort: counterSortMock,
  });

  const messToArrayMock = vi.fn().mockResolvedValue(
    mess ? [mess] : []
  );
  const messProjectMock = vi.fn().mockReturnValue({
    toArray: messToArrayMock,
  });
  const messFindMock = vi.fn().mockReturnValue({
    project: messProjectMock,
  });

  collections = {
    hostels: {
      findOne: findOneHostelMock,
    },
    messes: {
      findOne: findOneMessMock,
      find: messFindMock,
    },
    counters: {
      find: counterFindMock,
      insertOne: insertCounterMock,
    },
  };

  const dbMock = {
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

  const startSessionMock = vi.fn(() => sessionMock);

  getMongoDbMock.mockResolvedValue(dbMock);
  getMongoClientMock.mockResolvedValue({
    startSession: startSessionMock,
  });

  mocks = {
    findOneHostelMock,
    findOneMessMock,
    insertCounterMock,
    counterFindMock,
    messFindMock,
    startSessionMock,
  };

  return mocks;
}

describe("GET /api/counters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActiveRolesMock.mockResolvedValue(activeAdmin);
  });

  it("retrieves counters for Super Admin", async () => {
    setupDatabase();

    const response = await GET(createRequest());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(counterId.toString());
    expect(mocks.counterFindMock).toHaveBeenCalledWith({});
  });

  it("restricts Mess Admin retrieval to their hostel", async () => {
    setupDatabase();
    requireActiveRolesMock.mockResolvedValue(activeMessAdmin);

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.counterFindMock).toHaveBeenCalledWith({
      hostelId,
    });
  });

  it("restricts students to counters under active hostels and messes", async () => {
    setupDatabase();
    requireActiveRolesMock.mockResolvedValue(activeStudent);

    const response = await GET(createRequest());

    expect(response.status).toBe(200);

    expect(mocks.findOneHostelMock).toHaveBeenCalledWith({
      _id: hostelId,
      status: "ACTIVE",
    });

    expect(mocks.messFindMock).toHaveBeenCalledWith({
      hostelId,
      status: "ACTIVE",
    });

    expect(mocks.counterFindMock).toHaveBeenCalledWith({
      hostelId,
      status: "ACTIVE",
      messId: { $in: [messId] },
    });
  });

  it("returns no counters when the student's hostel is inactive", async () => {
    setupDatabase({ hostel: null });
    requireActiveRolesMock.mockResolvedValue(activeStudent);

    const response = await GET(createRequest());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data).toEqual([]);
    expect(mocks.counterFindMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid status filter", async () => {
    const response = await GET(
      createRequest("http://localhost/api/counters?status=UNKNOWN")
    );

    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error.code).toBe("INVALID_STATUS");
    expect(getMongoDbMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid mess ID", async () => {
    const response = await GET(
      createRequest("http://localhost/api/counters?messId=invalid")
    );

    expect(response.status).toBe(400);
    expect(getMongoDbMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/counters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActiveRolesMock.mockResolvedValue(activeAdmin);
  });

  it("creates a counter inside a transaction", async () => {
    setupDatabase();

    const response = await POST(
      createRequest(undefined, {
        messId: messId.toString(),
        name: "North Counter",
        code: "north",
        defaultServingRatePerMinute: 5,
      })
    );

    const result = await response.json();

    // console.log("COUNTER POST RESPONSE:", response.status, result);

    expect(response.status).toBe(201);
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("North Counter");
    expect(result.data.code).toBe("NORTH");

    expect(sessionMock.withTransaction).toHaveBeenCalledOnce();

    expect(mocks.insertCounterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostelId,
        messId,
        name: "North Counter",
        code: "NORTH",
        status: "ACTIVE",
      }),
      { session: sessionMock }
    );

    expect(sessionMock.endSession).toHaveBeenCalledOnce();
  });

  it("rejects creation when the mess is inactive", async () => {
    setupDatabase({ mess: null });

    const response = await POST(
      createRequest(undefined, {
        messId: messId.toString(),
        name: "North Counter",
        code: "NORTH",
        defaultServingRatePerMinute: 5,
      })
    );

    const result = await response.json();

    expect(response.status).toBe(404);
    expect(result.error.code).toBe("MESS_NOT_FOUND");
    expect(mocks.insertCounterMock).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledOnce();
  });

  it("rejects creation when the hostel is inactive", async () => {
    setupDatabase({ hostel: null });

    const response = await POST(
      createRequest(undefined, {
        messId: messId.toString(),
        name: "North Counter",
        code: "NORTH",
        defaultServingRatePerMinute: 5,
      })
    );

    const result = await response.json();

    expect(response.status).toBe(409);
    expect(result.error.code).toBe("HOSTEL_INACTIVE");
    expect(mocks.insertCounterMock).not.toHaveBeenCalled();
  });

  it("prevents Mess Admin from creating a counter in another hostel", async () => {
    setupDatabase();

    requireActiveRolesMock.mockResolvedValue({
      ...activeMessAdmin,
      hostelId: new ObjectId("507f1f77bcf86cd799439099").toString(),
    });

    const response = await POST(
      createRequest(undefined, {
        messId: messId.toString(),
        name: "North Counter",
        code: "NORTH",
        defaultServingRatePerMinute: 5,
      })
    );

    const result = await response.json();

    expect(response.status).toBe(403);
    expect(result.error.code).toBe("HOSTEL_SCOPE_REQUIRED");
    expect(mocks.insertCounterMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid serving rate", async () => {
    const response = await POST(
      createRequest(undefined, {
        messId: messId.toString(),
        name: "North Counter",
        code: "NORTH",
        defaultServingRatePerMinute: -1,
      })
    );

    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error.code).toBe("INVALID_SERVING_RATE");
    expect(getMongoDbMock).not.toHaveBeenCalled();
  });

  it("returns 409 for a duplicate counter code", async () => {
    setupDatabase();

    mocks.insertCounterMock.mockRejectedValue({
      code: 11000,
    });

    const response = await POST(
      createRequest(undefined, {
        messId: messId.toString(),
        name: "North Counter",
        code: "NORTH",
        defaultServingRatePerMinute: 5,
      })
    );

    const result = await response.json();

    expect(response.status).toBe(409);
    expect(result.error.code).toBe("DUPLICATE_COUNTER_CODE");
    expect(sessionMock.endSession).toHaveBeenCalledOnce();
  });
});