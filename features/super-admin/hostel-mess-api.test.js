import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestAdminApi,
  validateHostelInput,
  validateMessInput,
} from "./hostel-mess-api.js";

afterEach(() => vi.unstubAllGlobals());

describe("Hostel and Mess frontend API helpers", () => {
  it("returns data from the shared success envelope without caching", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [{ id: "hostel-1" }], message: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestAdminApi("/api/admin/hostels")).resolves.toEqual([{ id: "hostel-1" }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/hostels", expect.objectContaining({ cache: "no-store" }));
  });

  it("explains duplicate-code conflicts from the API contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: { code: "DUPLICATE_CODE", message: "duplicate" } }),
    }));

    await expect(requestAdminApi("/api/admin/hostels", { method: "POST", body: { name: "North", code: "NTH" } }))
      .rejects.toMatchObject({
        name: "AdminRequestError",
        code: "DUPLICATE_CODE",
        status: 409,
        message: "That code is already in use. Choose a different code.",
      });
  });

  it("validates Hostel code and description constraints used by the API", () => {
    expect(validateHostelInput({ name: "North Hall", code: "n", description: "x".repeat(251) })).toMatchObject({
      code: "Use 3 to 20 letters, numbers, or hyphens.",
      description: "Use no more than 250 characters.",
    });
    expect(validateHostelInput({ name: "North Hall", code: "nth-1", description: "" })).toEqual({});
  });

  it("requires one or more supported, unique meal types", () => {
    const base = { name: "North Mess", code: "NTH-M", description: "" };
    expect(validateMessInput({ ...base, mealTypes: [] })).toHaveProperty("mealTypes");
    expect(validateMessInput({ ...base, mealTypes: ["BREAKFAST", "BREAKFAST"] })).toHaveProperty("mealTypes");
    expect(validateMessInput({ ...base, mealTypes: ["BREAKFAST", "DINNER"] })).not.toHaveProperty("mealTypes");
  });

  it("returns a controlled network error when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(requestAdminApi("/api/admin/hostels")).rejects.toMatchObject({
      name: "AdminRequestError",
      code: "NETWORK_ERROR",
      status: 0,
    });
  });
});
