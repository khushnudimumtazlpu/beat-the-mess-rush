import { describe, expect, it } from "vitest";
import { homeForUser, safeInternalPath } from "./auth-redirects.js";
import { ACCOUNT_STATUS, USER_ROLE } from "./auth-contracts.js";

describe("authentication redirects", () => {
  it("accepts only safe internal callback paths", () => {
    expect(safeInternalPath("/student/meals?next=1")).toBe("/student/meals?next=1");
    expect(safeInternalPath("//outside.example")).toBe("/student");
    expect(safeInternalPath("https://outside.example")).toBe("/student");
    expect(safeInternalPath("/login")).toBe("/student");
  });

  it("sends active accounts to their role entry point", () => {
    expect(homeForUser({ role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.ACTIVE })).toBe("/student");
    expect(homeForUser({ role: USER_ROLE.MESS_ADMIN, status: ACCOUNT_STATUS.ACTIVE })).toBe("/queue");
    expect(homeForUser({ role: USER_ROLE.SUPER_ADMIN, status: ACCOUNT_STATUS.ACTIVE })).toBe("/queue");
    expect(homeForUser({ role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.REJECTED })).toBe("/access-denied");
  });
});
