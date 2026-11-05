import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_STATUS, USER_ROLE } from "./auth-contracts.js";

const { getAuthMock, headersMock, redirectMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  headersMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./auth.js", () => ({ getAuth: getAuthMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const {
  authorizeRouteRoles,
  requireActiveRole,
  requireActiveRoles,
  requireHostelRole,
} = await import("./auth-authorization.js");

function setSession(user) {
  const getSession = vi.fn().mockResolvedValue(user ? { user } : null);
  getAuthMock.mockResolvedValue({ api: { getSession } });
  return getSession;
}

describe("server-side authorization guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ cookie: "session=present" }));
    redirectMock.mockImplementation((url) => {
      throw new Error(`redirect:${url}`);
    });
  });

  it("rejects unauthenticated requests and checks the request session", async () => {
    const getSession = setSession(null);

    await expect(requireActiveRole(USER_ROLE.STUDENT)).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });

  it("redirects unauthenticated route access to login with a local callback", async () => {
    setSession(null);

    await expect(authorizeRouteRoles([USER_ROLE.STUDENT], "/student")).rejects.toThrow(
      "redirect:/login?callbackUrl=%2Fstudent",
    );
    expect(redirectMock).toHaveBeenCalledWith("/login?callbackUrl=%2Fstudent");
  });

  it("sends pending accounts only to the approval page", async () => {
    setSession({ role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.PENDING });

    await expect(authorizeRouteRoles([USER_ROLE.STUDENT], "/student")).rejects.toThrow(
      "redirect:/pending",
    );
    expect(redirectMock).toHaveBeenCalledWith("/pending");
  });

  it.each([ACCOUNT_STATUS.REJECTED, ACCOUNT_STATUS.SUSPENDED])(
    "sends %s accounts away from protected routes",
    async (status) => {
      setSession({ role: USER_ROLE.STUDENT, status });

      await expect(authorizeRouteRoles([USER_ROLE.STUDENT], "/student")).rejects.toThrow(
        "redirect:/access-denied",
      );
    },
  );

  it.each([
    ACCOUNT_STATUS.PENDING,
    ACCOUNT_STATUS.REJECTED,
    ACCOUNT_STATUS.SUSPENDED,
  ])("rejects an account with status %s", async (status) => {
    setSession({ role: USER_ROLE.STUDENT, status });

    await expect(requireActiveRole(USER_ROLE.STUDENT)).rejects.toMatchObject({
      status: 403,
      code: status === ACCOUNT_STATUS.PENDING ? "PENDING_APPROVAL" : "ACCOUNT_INACTIVE",
    });
  });

  it("rejects an active account with the wrong role", async () => {
    setSession({ role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.ACTIVE });

    await expect(requireActiveRole(USER_ROLE.MESS_ADMIN)).rejects.toMatchObject({
      status: 403,
      code: "ROLE_REQUIRED",
    });
  });

  it("accepts one of the explicitly allowed active roles", async () => {
    const admin = { id: "admin-1", role: USER_ROLE.SUPER_ADMIN, status: ACCOUNT_STATUS.ACTIVE };
    setSession(admin);

    await expect(
      requireActiveRoles([USER_ROLE.MESS_ADMIN, USER_ROLE.SUPER_ADMIN]),
    ).resolves.toBe(admin);
  });

  it("rejects a Mess Admin request for another hostel", async () => {
    setSession({
      id: "admin-1",
      role: USER_ROLE.MESS_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      hostelId: "hostel-a",
    });

    await expect(requireHostelRole(USER_ROLE.MESS_ADMIN, "hostel-b")).rejects.toMatchObject({
      status: 403,
      code: "HOSTEL_SCOPE_REQUIRED",
    });
  });

  it("allows a Mess Admin only in the assigned hostel", async () => {
    const admin = {
      id: "admin-1",
      role: USER_ROLE.MESS_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      hostelId: "hostel-a",
    };
    setSession(admin);

    await expect(requireHostelRole(USER_ROLE.MESS_ADMIN, "hostel-a")).resolves.toBe(admin);
  });
});
