import { describe, expect, it, vi } from "vitest";
import { submitRegistrationRequest } from "./registration-form.jsx";

const validValues = {
  name: "  Campus Member  ",
  email: "  CAMPUS@EXAMPLE.TEST ",
  password: "a-secure-test-password",
  accountType: "STUDENT",
};

describe("registration form request workflow", () => {
  it("submits only the supported registration fields and handles the pending response", async () => {
    const fetchRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ success: true, data: { accountType: "STUDENT", status: "PENDING" } }),
    });

    await expect(submitRegistrationRequest(validValues, fetchRequest)).resolves.toEqual({
      ok: true,
      accountType: "STUDENT",
    });

    expect(fetchRequest).toHaveBeenCalledOnce();
    const [url, options] = fetchRequest.mock.calls[0];
    expect(url).toBe("/api/registration");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(options.body)).toEqual({
      name: "Campus Member",
      email: "campus@example.test",
      password: "a-secure-test-password",
      accountType: "STUDENT",
    });
    expect(options.body).not.toMatch(/role|status|hostelId/);
  });

  it("does not send unsupported account types", async () => {
    const fetchRequest = vi.fn();

    await expect(submitRegistrationRequest({ ...validValues, accountType: "SUPER_ADMIN" }, fetchRequest)).resolves.toMatchObject({
      ok: false,
    });
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("shows the safe API validation message", async () => {
    const fetchRequest = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: { message: "Provide a valid email address." } }),
    });

    await expect(submitRegistrationRequest(validValues, fetchRequest)).resolves.toEqual({
      ok: false,
      message: "Provide a valid email address.",
    });
  });

  it("uses a generic error for failed network or malformed responses", async () => {
    await expect(submitRegistrationRequest(validValues, vi.fn().mockRejectedValue(new Error("private details")))).resolves.toEqual({
      ok: false,
      message: "Registration is unavailable right now. Please try again.",
    });

    await expect(submitRegistrationRequest(validValues, vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error("bad response"); } }))).resolves.toEqual({
      ok: false,
      message: "Registration is unavailable right now. Please try again.",
    });
  });
});
