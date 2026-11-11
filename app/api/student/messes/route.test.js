import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listActiveStudentMesses: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message, status = 403, code = "FORBIDDEN") {
      super(message);
      this.name = "AuthorizationError";
      this.status = status;
      this.code = code;
    }
  },
  StudentDemandError: class StudentDemandError extends Error {
    constructor(message, code, status = 400) {
      super(message);
      this.name = "StudentDemandError";
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/auth-authorization.js", () => ({ AuthorizationError: mocks.AuthorizationError }));
vi.mock("../../../../lib/student-demands.js", () => ({
  StudentDemandError: mocks.StudentDemandError,
  listActiveStudentMesses: mocks.listActiveStudentMesses,
}));

const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/student/messes", () => {
  it("returns only the safe active Mess choices from the session-scoped service", async () => {
    mocks.listActiveStudentMesses.mockResolvedValueOnce([
      { id: "507f1f77bcf86cd799439013", name: "North Mess", code: "NORTH" },
    ]);
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { messes: [{ id: "507f1f77bcf86cd799439013", name: "North Mess", code: "NORTH" }] },
      message: "Active Messes retrieved successfully.",
    });
    expect(mocks.listActiveStudentMesses).toHaveBeenCalledOnce();
  });

  it("preserves established unauthenticated and inactive Student responses", async () => {
    mocks.listActiveStudentMesses.mockRejectedValueOnce(
      new mocks.AuthorizationError("Sign in is required.", 401, "UNAUTHENTICATED"),
    );
    const unauthenticated = await GET();
    expect(unauthenticated.status).toBe(401);

    mocks.listActiveStudentMesses.mockRejectedValueOnce(
      new mocks.AuthorizationError("Your account is awaiting approval.", 403, "PENDING_APPROVAL"),
    );
    const pending = await GET();
    expect(pending.status).toBe(403);
    expect((await pending.json()).error.code).toBe("PENDING_APPROVAL");
  });

  it("returns only safe typed errors and hides unexpected database details", async () => {
    mocks.listActiveStudentMesses.mockRejectedValueOnce(
      new mocks.StudentDemandError("The Student's Hostel is unavailable.", "STUDENT_HOSTEL_UNAVAILABLE", 403),
    );
    const inactiveHostel = await GET();
    expect(inactiveHostel.status).toBe(403);
    expect((await inactiveHostel.json()).error.code).toBe("STUDENT_HOSTEL_UNAVAILABLE");

    mocks.listActiveStudentMesses.mockRejectedValueOnce(new Error("private database details"));
    const failed = await GET();
    expect(failed.status).toBe(500);
    expect((await failed.json()).error.message).toBe("An unexpected server error occurred.");
  });
});
