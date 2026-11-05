import { describe, expect, it } from "vitest";
import { ACCOUNT_STATUS, USER_ROLE, hasHostelScope, hasRole, isActiveUser } from "./auth-contracts.js";

describe("RushLess auth contracts", () => {
  it("recognizes only active accounts for protected access", () => {
    expect(isActiveUser({ status: ACCOUNT_STATUS.ACTIVE })).toBe(true);
    expect(isActiveUser({ status: ACCOUNT_STATUS.PENDING })).toBe(false);
    expect(isActiveUser(null)).toBe(false);
  });

  it("matches role and exact hostel scope", () => {
    const admin = {
      role: USER_ROLE.MESS_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      hostelId: "hostel-a",
    };

    expect(hasRole(admin, USER_ROLE.MESS_ADMIN)).toBe(true);
    expect(hasRole(admin, USER_ROLE.SUPER_ADMIN)).toBe(false);
    expect(hasHostelScope(admin, "hostel-a")).toBe(true);
    expect(hasHostelScope(admin, "hostel-b")).toBe(false);
    expect(hasHostelScope({ ...admin, hostelId: null }, "hostel-a")).toBe(false);
  });
});
