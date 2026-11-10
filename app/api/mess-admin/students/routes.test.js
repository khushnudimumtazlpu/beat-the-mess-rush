import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { ACCOUNT_STATUS, USER_ROLE } from "../../../../lib/auth-contracts.js";

const {
  requireActiveRoleMock,
  getMongoDbMock,
  approveStudentMock,
  rejectStudentMock,
} = vi.hoisted(() => ({
  requireActiveRoleMock: vi.fn(),
  getMongoDbMock: vi.fn(),
  approveStudentMock: vi.fn(),
  rejectStudentMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/auth-authorization.js", () => ({
  requireActiveRole: requireActiveRoleMock,
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));
vi.mock("../../../../lib/mongodb.js", () => ({ getMongoDb: getMongoDbMock }));
vi.mock("../../../../lib/student-approvals.js", () => ({
  approveStudent: approveStudentMock,
  rejectStudent: rejectStudentMock,
  StudentApprovalError: class StudentApprovalError extends Error {
    constructor(message, code, status) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

const { AuthorizationError } = await import("../../../../lib/auth-authorization.js");
const { StudentApprovalError } = await import("../../../../lib/student-approvals.js");

const { GET } = await import("./route.js");
const { POST: approve } = await import("./[studentId]/approve/route.js");
const { POST: reject } = await import("./[studentId]/reject/route.js");

const ADMIN_ID = new ObjectId();
const HOSTEL_ID = new ObjectId();
const STUDENT_ID = new ObjectId();
const OTHER_HOSTEL_ID = new ObjectId();

function createHarness({ actor = {
  id: ADMIN_ID.toHexString(),
  role: USER_ROLE.MESS_ADMIN,
  status: ACCOUNT_STATUS.ACTIVE,
  hostelId: HOSTEL_ID.toHexString(),
}, currentAdmin = { _id: ADMIN_ID }, activeHostel = { _id: HOSTEL_ID }, students = [] } = {}) {
  const users = {
    findOne: vi.fn(async (filter) => {
      if (filter._id?.equals?.(ADMIN_ID)) return currentAdmin;
      return null;
    }),
    find: vi.fn((filter) => {
      let projection;
      const cursor = {
        project(value) { projection = value; return cursor; },
        sort: vi.fn(() => cursor),
        toArray: vi.fn(async () => students
          .filter((student) => Object.entries(filter).every(([key, value]) => student[key] === value))
          .map((student) => Object.fromEntries(Object.keys(projection)
            .filter((key) => projection[key] && student[key] !== undefined)
            .map((key) => [key, student[key]])))),
      };
      return cursor;
    }),
  };
  const hostels = { findOne: vi.fn(async () => activeHostel) };
  getMongoDbMock.mockResolvedValue({
    collection: vi.fn((name) => name === "user" ? users : hostels),
  });
  requireActiveRoleMock.mockResolvedValue(actor);
  return { users, hostels };
}

function safeStudent(status) {
  return {
    id: STUDENT_ID.toHexString(),
    name: "Student Example",
    email: "student@example.test",
    status,
    hostelId: HOSTEL_ID.toHexString(),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

const params = { params: Promise.resolve({ studentId: STUDENT_ID.toHexString() }) };

describe("Mess Admin Student approval routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createHarness();
    approveStudentMock.mockResolvedValue(safeStudent(ACCOUNT_STATUS.ACTIVE));
    rejectStudentMock.mockResolvedValue(safeStudent(ACCOUNT_STATUS.REJECTED));
  });

  it("lists only pending Students in the authenticated Admin's Hostel with safe fields", async () => {
    const student = {
      _id: STUDENT_ID,
      name: "Student Example",
      email: "student@example.test",
      role: USER_ROLE.STUDENT,
      status: ACCOUNT_STATUS.PENDING,
      hostelId: HOSTEL_ID.toHexString(),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      password: "must-not-leak",
      account: { password: "must-not-leak" },
    };
    const { users } = createHarness({ students: [student] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requireActiveRoleMock).toHaveBeenCalledWith(USER_ROLE.MESS_ADMIN);
    expect(users.find).toHaveBeenCalledWith({
      role: USER_ROLE.STUDENT,
      status: ACCOUNT_STATUS.PENDING,
      hostelId: HOSTEL_ID.toHexString(),
    });
    expect(body.data[0]).toEqual({
      id: STUDENT_ID.toHexString(),
      name: "Student Example",
      email: "student@example.test",
      status: ACCOUNT_STATUS.PENDING,
      hostelId: HOSTEL_ID.toHexString(),
      createdAt: student.createdAt.toISOString(),
      updatedAt: student.updatedAt.toISOString(),
    });
    expect(body.data[0]).not.toHaveProperty("password");
    expect(body.data[0]).not.toHaveProperty("account");
  });

  it.each([
    ["unauthenticated", { status: 401, code: "UNAUTHENTICATED" }],
    ["wrong role", { status: 403, code: "ROLE_REQUIRED" }],
    ["pending admin", { status: 403, code: "PENDING_APPROVAL" }],
    ["rejected admin", { status: 403, code: "ACCOUNT_INACTIVE" }],
    ["suspended admin", { status: 403, code: "ACCOUNT_INACTIVE" }],
  ])("blocks %s callers before database or approval access", async (_label, error) => {
    requireActiveRoleMock.mockRejectedValue(new AuthorizationError("Access denied.", error.status, error.code));
    const responses = await Promise.all([
      GET(),
      approve(new Request("http://localhost/api/mess-admin/students/id/approve", { method: "POST" }), params),
      reject(new Request("http://localhost/api/mess-admin/students/id/reject", { method: "POST" }), params),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(error.status);
      expect(await response.json()).toMatchObject({ success: false, error: { code: error.code } });
    }
    expect(requireActiveRoleMock).toHaveBeenCalledTimes(3);
    expect(getMongoDbMock).not.toHaveBeenCalled();
    expect(approveStudentMock).not.toHaveBeenCalled();
    expect(rejectStudentMock).not.toHaveBeenCalled();
  });

  it("requires a valid assigned Hostel and verifies the assignment against current records", async () => {
    createHarness({ actor: { id: ADMIN_ID.toHexString(), role: USER_ROLE.MESS_ADMIN, status: ACCOUNT_STATUS.ACTIVE } });
    let response = await GET();
    expect(response.status).toBe(403);

    createHarness({ actor: {
      id: ADMIN_ID.toHexString(), role: USER_ROLE.MESS_ADMIN, status: ACCOUNT_STATUS.ACTIVE,
      hostelId: "not-an-object-id",
    } });
    response = await GET();
    expect(response.status).toBe(403);

    const invalidAssignment = createHarness({ currentAdmin: null });
    response = await GET();
    expect(response.status).toBe(403);
    expect(invalidAssignment.users.findOne).toHaveBeenCalledWith({
      _id: ADMIN_ID,
      role: USER_ROLE.MESS_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      hostelId: HOSTEL_ID.toHexString(),
    }, { projection: { _id: 1 } });

    createHarness({ activeHostel: null });
    response = await GET();
    expect(response.status).toBe(403);
  });

  it("approves and rejects through the shared service with only session-derived Hostel scope", async () => {
    approveStudentMock.mockResolvedValue(safeStudent(ACCOUNT_STATUS.ACTIVE));
    rejectStudentMock.mockResolvedValue(safeStudent(ACCOUNT_STATUS.REJECTED));
    const hostileBody = JSON.stringify({ hostelId: OTHER_HOSTEL_ID.toHexString() });

    const approved = await approve(new Request("http://localhost/api/mess-admin/students/id/approve?hostelId=elsewhere", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: hostileBody,
    }), params);
    const rejected = await reject(new Request("http://localhost/api/mess-admin/students/id/reject", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: hostileBody,
    }), params);

    expect(approveStudentMock).toHaveBeenCalledWith(STUDENT_ID.toHexString(), {
      expectedHostelId: HOSTEL_ID.toHexString(),
    });
    expect(rejectStudentMock).toHaveBeenCalledWith(STUDENT_ID.toHexString(), {
      expectedHostelId: HOSTEL_ID.toHexString(),
    });
    expect(approved.status).toBe(200);
    expect(rejected.status).toBe(200);
    expect(requireActiveRoleMock).toHaveBeenCalledWith(USER_ROLE.MESS_ADMIN);
    expect(await approved.json()).toMatchObject({ success: true, data: { status: ACCOUNT_STATUS.ACTIVE } });
    expect(await rejected.json()).toMatchObject({ success: true, data: { status: ACCOUNT_STATUS.REJECTED } });
  });

  it.each([
    ["invalid Student ID", "INVALID_STUDENT_ID", 400],
    ["missing Student", "STUDENT_NOT_FOUND", 404],
    ["Student in another Hostel", "STUDENT_NOT_FOUND", 404],
    ["wrong account role", "STUDENT_WRONG_ROLE", 409],
    ["already decided Student", "STUDENT_NOT_PENDING", 409],
  ])("maps shared-service errors for %s safely", async (_label, code, status) => {
    approveStudentMock.mockRejectedValue(new StudentApprovalError("Safe public error.", code, status));
    const response = await approve(
      new Request("http://localhost/api/mess-admin/students/id/approve", { method: "POST" }),
      params,
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ success: false, error: { code, message: "Safe public error." } });
  });

  it("does not return internal error details", async () => {
    approveStudentMock.mockRejectedValue(Object.assign(new Error("mongodb://secret-host/password"), {
      status: 418,
      code: "INTERNAL_DETAIL",
    }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await approve(
      new Request("http://localhost/api/mess-admin/students/id/approve", { method: "POST" }),
      params,
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected server error occurred." },
    });
    errorSpy.mockRestore();
  });
});
