import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_ROLE } from "../../../../lib/auth-contracts.js";

const {
  requireActiveRoleMock,
  assignHostelMessAdminMock,
  listMessAdminsMock,
  readMessAdminStatusFilterMock,
  rejectPendingMessAdminMock,
  removeMessAdminAssignmentMock,
  requireHostelIdBodyMock,
} = vi.hoisted(() => ({
  requireActiveRoleMock: vi.fn(),
  assignHostelMessAdminMock: vi.fn(),
  listMessAdminsMock: vi.fn(),
  readMessAdminStatusFilterMock: vi.fn(),
  rejectPendingMessAdminMock: vi.fn(),
  removeMessAdminAssignmentMock: vi.fn(),
  requireHostelIdBodyMock: vi.fn((body) => body.hostelId),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/auth-authorization.js", () => ({
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message, status = 403, code = "FORBIDDEN") {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  requireActiveRole: requireActiveRoleMock,
}));
vi.mock("../../../../lib/mess-admin-assignments.js", () => ({
  assignHostelMessAdmin: assignHostelMessAdminMock,
}));
vi.mock("../../../../lib/super-admin-mess-admins.js", () => ({
  listMessAdmins: listMessAdminsMock,
  readMessAdminStatusFilter: readMessAdminStatusFilterMock,
  rejectPendingMessAdmin: rejectPendingMessAdminMock,
  removeMessAdminAssignment: removeMessAdminAssignmentMock,
  requireHostelIdBody: requireHostelIdBodyMock,
}));

const { GET } = await import("./route.js");
const { POST: assign } = await import("./[messAdminId]/assign/route.js");
const { POST: reject } = await import("./[messAdminId]/reject/route.js");
const { DELETE: remove } = await import("./[messAdminId]/assignment/route.js");

const actor = { id: "super-admin-id", role: USER_ROLE.SUPER_ADMIN };
const params = { params: Promise.resolve({ messAdminId: "507f1f77bcf86cd799439011" }) };

describe("Super Admin Mess Admin API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActiveRoleMock.mockResolvedValue(actor);
    requireHostelIdBodyMock.mockImplementation((body) => body.hostelId);
  });

  it("requires an active Super Admin before every endpoint operation", async () => {
    requireActiveRoleMock.mockRejectedValue(Object.assign(new Error("Super Admin only"), {
      status: 403,
      code: "ROLE_REQUIRED",
    }));

    const responses = await Promise.all([
      GET(new Request("http://localhost/api/admin/mess-admins")),
      assign(new Request("http://localhost/api/admin/mess-admins/id/assign", {
        method: "POST",
        body: JSON.stringify({ hostelId: "507f1f77bcf86cd799439011" }),
      }), params),
      reject(new Request("http://localhost/api/admin/mess-admins/id/reject", { method: "POST" }), params),
      remove(new Request("http://localhost/api/admin/mess-admins/id/assignment", {
        method: "DELETE",
        body: JSON.stringify({ hostelId: "507f1f77bcf86cd799439011" }),
      }), params),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ success: false, error: { code: "ROLE_REQUIRED" } });
    }
    expect(requireActiveRoleMock).toHaveBeenCalledTimes(4);
    expect(listMessAdminsMock).not.toHaveBeenCalled();
    expect(assignHostelMessAdminMock).not.toHaveBeenCalled();
    expect(rejectPendingMessAdminMock).not.toHaveBeenCalled();
    expect(removeMessAdminAssignmentMock).not.toHaveBeenCalled();
  });

  it("passes the optional status filter to the safe list service", async () => {
    readMessAdminStatusFilterMock.mockReturnValue("PENDING");
    listMessAdminsMock.mockResolvedValue([{ id: "mess-admin-id", status: "PENDING" }]);

    const response = await GET(new Request("http://localhost/api/admin/mess-admins?status=PENDING"));

    expect(response.status).toBe(200);
    expect(listMessAdminsMock).toHaveBeenCalledWith("PENDING");
    expect(await response.json()).toMatchObject({ success: true, data: [{ id: "mess-admin-id" }] });
  });

  it("delegates assignment using the route ID and only the validated Hostel ID", async () => {
    requireHostelIdBodyMock.mockImplementation((body) => {
      if (Object.keys(body).length !== 1 || typeof body.hostelId !== "string") {
        throw Object.assign(new Error("Provide only a valid hostelId."), { status: 400, code: "INVALID_BODY" });
      }
      return body.hostelId;
    });
    assignHostelMessAdminMock.mockResolvedValue({ hostelId: "hostel-id", messAdminId: "admin-id" });

    const response = await assign(new Request("http://localhost/api/admin/mess-admins/id/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostelId: "507f1f77bcf86cd799439012" }),
    }), params);

    expect(assignHostelMessAdminMock).toHaveBeenCalledWith({
      hostelId: "507f1f77bcf86cd799439012",
      messAdminId: "507f1f77bcf86cd799439011",
    });
    expect(response.status).toBe(200);
  });

  it("rejects assignment bodies containing client-supplied role or status", async () => {
    requireHostelIdBodyMock.mockImplementation((body) => {
      if (Object.keys(body).length !== 1 || typeof body.hostelId !== "string") {
        throw Object.assign(new Error("Provide only a valid hostelId."), { status: 400, code: "INVALID_BODY" });
      }
      return body.hostelId;
    });

    const response = await assign(new Request("http://localhost/api/admin/mess-admins/id/assign", {
      method: "POST",
      body: JSON.stringify({ hostelId: "507f1f77bcf86cd799439012", role: "SUPER_ADMIN", status: "ACTIVE" }),
    }), params);

    expect(response.status).toBe(400);
    expect(assignHostelMessAdminMock).not.toHaveBeenCalled();
  });

  it("delegates rejection and assignment removal to their guarded services", async () => {
    rejectPendingMessAdminMock.mockResolvedValue({ id: "admin-id", status: "REJECTED" });
    removeMessAdminAssignmentMock.mockResolvedValue({ id: "admin-id", status: "ACTIVE", hostelId: null });

    const rejection = await reject(new Request("http://localhost/api/admin/mess-admins/id/reject", {
      method: "POST",
    }), params);
    const removal = await remove(new Request("http://localhost/api/admin/mess-admins/id/assignment", {
      method: "DELETE",
      body: JSON.stringify({ hostelId: "507f1f77bcf86cd799439013" }),
    }), params);

    expect(rejectPendingMessAdminMock).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
    expect(removeMessAdminAssignmentMock).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      "507f1f77bcf86cd799439013",
    );
    expect(rejection.status).toBe(200);
    expect(removal.status).toBe(200);
  });
});
