import { describe, expect, it, vi } from "vitest";
import { loadActiveHostels, registrationSuccessDetails, submitRegistrationRequest } from "./registration-form.jsx";

const validValues = {
  name: "  Campus Member  ",
  email: "  CAMPUS@EXAMPLE.TEST ",
  password: "a-secure-test-password",
  accountType: "STUDENT",
  hostelId: "507f1f77bcf86cd799439011",
};

describe("registration form request workflow", () => {
  it("explains that duplicate emails do not convert existing accounts", () => {
    const studentMessage = registrationSuccessDetails("STUDENT");
    const messAdminMessage = registrationSuccessDetails("MESS_ADMIN");

    expect(studentMessage).toContain("If this email is already registered, its existing account is not changed.");
    expect(studentMessage).toContain("Student request remains pending");
    expect(messAdminMessage).toContain("If this email is already registered, its existing account is not changed.");
    expect(messAdminMessage).toContain("Super Admin approves and assigns a Hostel");
  });

  it("loads available Hostel options using the public endpoint response contract", async () => {
    const fetchRequest = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { id: "hostel-a", name: "North Hostel" },
          { id: "hostel-b", name: "South Hostel" },
        ],
      }),
    });

    await expect(loadActiveHostels(fetchRequest)).resolves.toEqual({
      ok: true,
      hostels: [
        { id: "hostel-a", name: "North Hostel" },
        { id: "hostel-b", name: "South Hostel" },
      ],
    });
    expect(fetchRequest).toHaveBeenCalledWith("/api/registration/hostels", {
      method: "GET",
      cache: "no-store",
      signal: undefined,
    });
  });

  it("returns an empty list for the no-active-Hostels state", async () => {
    const fetchRequest = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    await expect(loadActiveHostels(fetchRequest)).resolves.toEqual({ ok: true, hostels: [] });
  });

  it("handles Hostel endpoint and network errors safely", async () => {
    const apiFailure = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: { message: "Hostels are temporarily unavailable." } }),
    });
    await expect(loadActiveHostels(apiFailure)).resolves.toEqual({
      ok: false,
      message: "Hostels are temporarily unavailable.",
    });
    await expect(loadActiveHostels(vi.fn().mockRejectedValue(new Error("private details")))).resolves.toMatchObject({
      ok: false,
      message: "Active Hostels are unavailable right now. Please try again.",
    });
  });

  it("submits the selected Hostel with the supported Student fields and handles the pending response", async () => {
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
      hostelId: "507f1f77bcf86cd799439011",
    });
    expect(options.body).not.toMatch(/role|status/);
  });

  it("blocks Student submission when no Hostel is selected", async () => {
    const fetchRequest = vi.fn();

    await expect(submitRegistrationRequest({ ...validValues, hostelId: "" }, fetchRequest)).resolves.toEqual({
      ok: false,
      message: "Select an active Hostel before creating a Student account.",
    });
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("keeps Mess Admin registration on its original four-field contract", async () => {
    const fetchRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ success: true, data: { accountType: "MESS_ADMIN", status: "PENDING" } }),
    });
    const values = { ...validValues, accountType: "MESS_ADMIN", hostelId: "ignored-client-value" };

    await expect(submitRegistrationRequest(values, fetchRequest)).resolves.toEqual({
      ok: true,
      accountType: "MESS_ADMIN",
    });
    expect(JSON.parse(fetchRequest.mock.calls[0][1].body)).toEqual({
      name: "Campus Member",
      email: "campus@example.test",
      password: "a-secure-test-password",
      accountType: "MESS_ADMIN",
    });
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
