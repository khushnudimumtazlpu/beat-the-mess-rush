import { describe, expect, it } from "vitest";
import { readLoginCredentials, resolveLoginOutcome } from "./login-workflow.js";
import { ACCOUNT_STATUS, USER_ROLE } from "../../lib/auth-contracts.js";

describe("login workflow response handling", () => {
  it("reads browser-autofilled form values at submit time", () => {
    const formData = new FormData();
    formData.set("email", "  student@example.test ");
    formData.set("password", "autofilled-password");

    expect(readLoginCredentials(formData)).toEqual({
      email: "student@example.test",
      password: "autofilled-password",
    });
  });

  it("routes a successfully authenticated pending Student to approval", () => {
    const outcome = resolveLoginOutcome({
      data: {
        user: { role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.PENDING },
      },
    });

    expect(outcome).toEqual({ type: "redirect", destination: "/pending" });
  });

  it("keeps incorrect credentials generic and does not navigate", () => {
    expect(resolveLoginOutcome({
      error: { code: "INVALID_EMAIL_OR_PASSWORD" },
    })).toEqual({ type: "error", message: "We couldn't sign you in with those details." });
  });

  it("routes an active Student to the Student dashboard", () => {
    expect(resolveLoginOutcome({
      data: { user: { role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.ACTIVE } },
    })).toEqual({ type: "redirect", destination: "/student" });
  });

  it.each([ACCOUNT_STATUS.REJECTED, ACCOUNT_STATUS.SUSPENDED])(
    "routes a %s Student to access denied",
    (status) => {
      expect(resolveLoginOutcome({
        data: { user: { role: USER_ROLE.STUDENT, status } },
      })).toEqual({ type: "redirect", destination: "/access-denied" });
    },
  );

  it.each([
    [USER_ROLE.MESS_ADMIN, "/queue"],
    [USER_ROLE.SUPER_ADMIN, "/admin"],
  ])("keeps %s role-based login destination", (role, destination) => {
    expect(resolveLoginOutcome({
      data: { user: { role, status: ACCOUNT_STATUS.ACTIVE } },
    })).toEqual({ type: "redirect", destination });
  });

  it("does not mistake an origin error for invalid credentials", () => {
    expect(resolveLoginOutcome({ error: { code: "INVALID_ORIGIN" } })).toEqual({
      type: "error",
      message: "Sign-in is unavailable from this address. Refresh the page and try again.",
    });
  });
});
