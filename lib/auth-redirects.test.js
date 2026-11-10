import { describe, expect, it } from "vitest";
import { homeForUser, loginDestinationForUser, safeInternalPath } from "./auth-redirects.js";
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
    expect(homeForUser({ role: USER_ROLE.SUPER_ADMIN, status: ACCOUNT_STATUS.ACTIVE })).toBe("/admin");
    expect(homeForUser({ role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.REJECTED })).toBe("/access-denied");
  });

  it("uses callbacks only when the newly signed-in role can access them", () => {
    const student = { role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.ACTIVE };
    const messAdmin = { role: USER_ROLE.MESS_ADMIN, status: ACCOUNT_STATUS.ACTIVE };
    const superAdmin = { role: USER_ROLE.SUPER_ADMIN, status: ACCOUNT_STATUS.ACTIVE };

    expect(loginDestinationForUser(student, "/admin")).toBe("/student");
    expect(loginDestinationForUser(student, "/student/meals")).toBe("/student/meals");
    expect(loginDestinationForUser(messAdmin, "/student/history")).toBe("/queue");
    expect(loginDestinationForUser(messAdmin, "/kitchen/production")).toBe("/kitchen/production");
    expect(loginDestinationForUser(superAdmin, "/admin/hostels")).toBe("/admin/hostels");
  });
});
