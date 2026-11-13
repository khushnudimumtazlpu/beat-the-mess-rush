import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { ACCOUNT_STATUS, USER_ROLE } from "../../../../lib/auth-contracts.js";

const { requireActiveRoleMock, getMongoDbMock, approveStudentMock, rejectStudentMock } = vi.hoisted(() => ({
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
const STUDENT_ID = new ObjectId();
const OTHER_HOSTEL_ID = new ObjectId();
const actor = { id: ADMIN_ID.toHexString(), role: USER_ROLE.SUPER_ADMIN, status: ACCOUNT_STATUS.ACTIVE };

function createHarness({ currentAdmin = { _id: ADMIN_ID }, students = [], hostels = [] } = {}) {
  const users = {
    findOne: vi.fn(async (filter) => (
      filter._id?.equals?.(ADMIN_ID) &&
      filter.role === USER_ROLE.SUPER_ADMIN &&
      filter.status === ACCOUNT_STATUS.ACTIVE
        ? currentAdmin
        : null
    )),
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
  const hostelCollection = {
    find: vi.fn((filter) => {
      const cursor = {
        toArray: vi.fn(async () => {
          if (filter?._id?.$in) {
            return hostels.filter((h) => filter._id.$in.some((id) => id.equals(h._id)));
          }
          return hostels;
        }),
      };
      return cursor;
    }),
  };
  getMongoDbMock.mockResolvedValue({
    collection: vi.fn((name) => (name === "hostels" ? hostelCollection : users)),
  });
  requireActiveRoleMock.mockResolvedValue(actor);
  return Object.assign(users, { hostelCollection });
}

function student(hostelId, overrides = {}) {
  return {
    _id: new ObjectId(),
    name: "Student Example",
    email: "student@example.test",
    role: USER_ROLE.STUDENT,
    status: ACCOUNT_STATUS.PENDING,
    hostelId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    password: "must-not-leak",
    account: { password: "must-not-leak" },
    ...overrides,
  };
}

const routeParams = { params: Promise.resolve({ studentId: STUDENT_ID.toHexString() }) };

describe("Super Admin Student approval routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createHarness();
    approveStudentMock.mockResolvedValue({
      id: STUDENT_ID.toHexString(), name: "Student Example", email: "student@example.test",
      status: ACCOUNT_STATUS.ACTIVE, hostelId: new ObjectId().toHexString(),
    });
    rejectStudentMock.mockResolvedValue({
      id: STUDENT_ID.toHexString(), name: "Student Example", email: "student@example.test",
      status: ACCOUNT_STATUS.REJECTED, hostelId: new ObjectId().toHexString(),
    });
  });

  it("lists only pending Students globally across Hostels with safe fields", async () => {
    const hostelAStudent = student(new ObjectId().toHexString());
    const hostelBStudent = student(new ObjectId().toHexString());
    const users = createHarness({ students: [
      hostelAStudent,
      hostelBStudent,
      student(new ObjectId().toHexString(), { status: ACCOUNT_STATUS.ACTIVE }),
      student(new ObjectId().toHexString(), { role: USER_ROLE.MESS_ADMIN }),
    ] });

    const response = await GET(new Request("http://localhost/api/admin/students?hostelId=client-controlled"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requireActiveRoleMock).toHaveBeenCalledWith(USER_ROLE.SUPER_ADMIN);
    expect(users.find).toHaveBeenCalledWith({ role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.PENDING });
    expect(body.data.map((item) => item.id)).toEqual([
      hostelAStudent._id.toHexString(),
      hostelBStudent._id.toHexString(),
    ]);
    expect(body.data[0]).toEqual({
      id: hostelAStudent._id.toHexString(),
      name: "Student Example",
      email: "student@example.test",
      status: ACCOUNT_STATUS.PENDING,
      hostelId: hostelAStudent.hostelId,
      createdAt: hostelAStudent.createdAt.toISOString(),
      updatedAt: hostelAStudent.updatedAt.toISOString(),
    });
    expect(body.data[0]).not.toHaveProperty("password");
    expect(body.data[0]).not.toHaveProperty("account");
  });

  it("enriches pending Students with hostelName when available in HOSTEL_COLLECTION", async () => {
    const hostelId = new ObjectId();
    const hostelStudent = student(hostelId.toHexString());
    createHarness({
      students: [hostelStudent],
      hostels: [{ _id: hostelId, name: "Boys Hostel 1" }],
    });

    const response = await GET(new Request("http://localhost/api/admin/students"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      id: hostelStudent._id.toHexString(),
      hostelId: hostelId.toHexString(),
      hostelName: "Boys Hostel 1",
    });
  });

  it.each([
    ["unauthenticated", 401, "UNAUTHENTICATED"],
    ["Student", 403, "ROLE_REQUIRED"],
    ["Mess Admin", 403, "ROLE_REQUIRED"],
    ["pending Super Admin", 403, "PENDING_APPROVAL"],
    ["rejected Super Admin", 403, "ACCOUNT_INACTIVE"],
    ["suspended Super Admin", 403, "ACCOUNT_INACTIVE"],
  ])("blocks %s callers on every endpoint", async (_label, status, code) => {
    requireActiveRoleMock.mockRejectedValue(new AuthorizationError("Access denied.", status, code));
    const responses = await Promise.all([
      GET(),
      approve(new Request("http://localhost/api/admin/students/id/approve", { method: "POST" }), routeParams),
      reject(new Request("http://localhost/api/admin/students/id/reject", { method: "POST" }), routeParams),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ success: false, error: { code } });
    }
    expect(requireActiveRoleMock).toHaveBeenCalledTimes(3);
    expect(getMongoDbMock).not.toHaveBeenCalled();
    expect(approveStudentMock).not.toHaveBeenCalled();
    expect(rejectStudentMock).not.toHaveBeenCalled();
  });

  it("checks the Super Admin session ID, role, and status against the current user record", async () => {
    const users = createHarness({ currentAdmin: null });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(users.findOne).toHaveBeenCalledWith({
      _id: ADMIN_ID,
      role: USER_ROLE.SUPER_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
    }, { projection: { _id: 1 } });
    expect(users.find).not.toHaveBeenCalled();
  });

  it("rejects an invalid server-side Super Admin ID without querying users", async () => {
    createHarness();
    requireActiveRoleMock.mockResolvedValue({ ...actor, id: "not-an-object-id" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(getMongoDbMock).not.toHaveBeenCalled();
  });

  it("approves and rejects through the shared service without passing Hostel scope", async () => {
    const hostileBody = JSON.stringify({ hostelId: OTHER_HOSTEL_ID.toHexString() });
    const approved = await approve(new Request("http://localhost/api/admin/students/id/approve?hostelId=elsewhere", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: hostileBody,
    }), routeParams);
    const rejected = await reject(new Request("http://localhost/api/admin/students/id/reject", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: hostileBody,
    }), routeParams);

    expect(approveStudentMock).toHaveBeenCalledWith(STUDENT_ID.toHexString());
    expect(rejectStudentMock).toHaveBeenCalledWith(STUDENT_ID.toHexString());
    expect(approved.status).toBe(200);
    expect(rejected.status).toBe(200);
    expect((await approved.json()).data.status).toBe(ACCOUNT_STATUS.ACTIVE);
    expect((await rejected.json()).data.status).toBe(ACCOUNT_STATUS.REJECTED);
  });

  it.each([
    ["invalid Student ID", "INVALID_STUDENT_ID", 400],
    ["missing Student", "STUDENT_NOT_FOUND", 404],
    ["wrong account role", "STUDENT_WRONG_ROLE", 409],
    ["non-pending Student", "STUDENT_NOT_PENDING", 409],
  ])("maps the shared service's %s error", async (_label, code, status) => {
    approveStudentMock.mockRejectedValue(new StudentApprovalError("Safe error message.", code, status));
    const response = await approve(
      new Request("http://localhost/api/admin/students/id/approve", { method: "POST" }),
      routeParams,
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ success: false, error: { code, message: "Safe error message." } });
  });

  it("returns a generic error for unexpected internal failures with status/code fields", async () => {
    approveStudentMock.mockRejectedValue(Object.assign(new Error("private database details"), {
      status: 418,
      code: "INTERNAL_DETAIL",
    }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await approve(
      new Request("http://localhost/api/admin/students/id/approve", { method: "POST" }),
      routeParams,
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected server error occurred." },
    });
    errorSpy.mockRestore();
  });

  it("returns a generic error if session validation throws an unexpected status/code error", async () => {
    requireActiveRoleMock.mockRejectedValue(Object.assign(new Error("private auth backend details"), {
      status: 418,
      code: "INTERNAL_AUTH_DETAIL",
    }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected server error occurred." },
    });
    expect(getMongoDbMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
