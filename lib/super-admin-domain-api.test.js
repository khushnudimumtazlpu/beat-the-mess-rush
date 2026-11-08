import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_ROLE } from "./auth-contracts.js";

const { requireActiveRoleMock } = vi.hoisted(() => ({ requireActiveRoleMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./auth-authorization.js", () => ({
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message, status, code) { super(message); this.status = status; this.code = code; }
  },
  requireActiveRole: requireActiveRoleMock,
}));

const { withSuperAdminApi } = await import("./super-admin-domain-api.js");

describe("Super Admin API authorization wrapper", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the active Super Admin role before executing the operation", async () => {
    const actor = { id: "admin-1", role: USER_ROLE.SUPER_ADMIN };
    requireActiveRoleMock.mockResolvedValue(actor);
    const action = vi.fn(async (user) => Response.json({ id: user.id }));
    const response = await withSuperAdminApi(action);
    expect(requireActiveRoleMock).toHaveBeenCalledWith(USER_ROLE.SUPER_ADMIN);
    expect(action).toHaveBeenCalledWith(actor);
    expect(await response.json()).toEqual({ id: "admin-1" });
  });

  it("returns authorization errors without running protected work", async () => {
    requireActiveRoleMock.mockRejectedValue(Object.assign(new Error("Super Admin only"), { status: 403, code: "ROLE_REQUIRED" }));
    const action = vi.fn();
    const response = await withSuperAdminApi(action);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "ROLE_REQUIRED" } });
    expect(action).not.toHaveBeenCalled();
  });

  it("returns an unauthenticated response before protected work", async () => {
    requireActiveRoleMock.mockRejectedValue(Object.assign(new Error("Sign in required"), { status: 401, code: "UNAUTHENTICATED" }));
    const action = vi.fn();
    const response = await withSuperAdminApi(action);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "UNAUTHENTICATED" } });
    expect(action).not.toHaveBeenCalled();
  });
});
