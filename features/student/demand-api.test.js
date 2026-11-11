import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelStudentDemand,
  createStudentDemand,
  getCurrentStudentDemands,
  getActiveStudentMesses,
  getIndiaServiceDate,
  getStudentDemandHistory,
  resolveActiveMessSelection,
  StudentDemandApiError,
  toExpectedArrivalAt,
  updateStudentDemand,
} from "./demand-api.js";

const now = new Date("2026-11-10T18:00:00.000Z");
const sample = { mealType: "LUNCH", portion: "REGULAR", expectedArrivalAt: "2026-11-10T18:30:00+05:30" };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function successfulResponse(data = {}) {
  return new Response(JSON.stringify({ success: true, data, message: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Student demand API client", () => {
  it("generates arrival timestamps for the India service date with +05:30 offset", () => {
    expect(getIndiaServiceDate(now)).toBe("2026-11-10");
    expect(toExpectedArrivalAt("18:30", now)).toBe("2026-11-10T18:30:00+05:30");
    expect(() => toExpectedArrivalAt("25:61", now)).toThrow("Choose a valid expected arrival time.");
  });

  it("crosses the India service-date boundary at midnight IST, not UTC midnight", () => {
    const beforeMidnightIst = new Date("2026-06-15T18:29:59.999Z");
    const midnightIst = new Date("2026-06-15T18:30:00.000Z");
    expect(getIndiaServiceDate(beforeMidnightIst)).toBe("2026-06-15");
    expect(getIndiaServiceDate(midnightIst)).toBe("2026-06-16");
    expect(toExpectedArrivalAt("00:05", midnightIst)).toBe("2026-06-16T00:05:00+05:30");
  });

  it("posts only meal selection fields and never sends Student or Hostel identity", async () => {
    fetch.mockResolvedValueOnce(successfulResponse({ id: "demand-id" }));
    await createStudentDemand(sample);
    const [path, options] = fetch.mock.calls[0];
    expect(path).toBe("/api/student/demands");
    expect(options).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(JSON.parse(options.body)).toEqual(sample);
  });

  it("includes the selected Mess only when provided", async () => {
    fetch.mockResolvedValueOnce(successfulResponse());
    await createStudentDemand({ ...sample, messId: "trusted-ui-option" });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ...sample, messId: "trusted-ui-option" });
  });

  it("automatically chooses a single active Mess and rejects stale selections among multiple Messes", () => {
    const first = { id: "mess-one", name: "One", code: "ONE" };
    const second = { id: "mess-two", name: "Two", code: "TWO" };
    expect(resolveActiveMessSelection([first], "stale-id")).toBe("mess-one");
    expect(resolveActiveMessSelection([first, second], "mess-two")).toBe("mess-two");
    expect(resolveActiveMessSelection([first, second], "inactive-mess")).toBe("");
    expect(resolveActiveMessSelection([], "mess-one")).toBe("");
  });

  it("patches an existing demand with only its editable fields", async () => {
    fetch.mockResolvedValueOnce(successfulResponse({ id: "demand-id" }));
    await updateStudentDemand("demand-id", { ...sample, messId: "mess-id" });
    expect(fetch.mock.calls[0][0]).toBe("/api/student/demands/demand-id");
    expect(fetch.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ...sample, messId: "mess-id" });
  });

  it("deletes the selected demand without sending a body", async () => {
    fetch.mockResolvedValueOnce(successfulResponse({ id: "demand-id", status: "CANCELLED" }));
    await cancelStudentDemand("demand-id / one");
    expect(fetch.mock.calls[0][0]).toBe("/api/student/demands/demand-id%20%2F%20one");
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("loads only today's active records through the paginated history API", async () => {
    fetch.mockResolvedValueOnce(successfulResponse({ demands: [], pagination: {} }));
    await getCurrentStudentDemands({ serviceDate: "2026-11-10" });
    expect(fetch.mock.calls[0][0]).toBe("/api/student/demands/history?serviceDate=2026-11-10&status=ACTIVE&limit=50&page=1");
  });

  it("loads Student-scoped active Mess options without sending identity fields", async () => {
    fetch.mockResolvedValueOnce(successfulResponse({ messes: [] }));
    await getActiveStudentMesses();
    expect(fetch.mock.calls[0][0]).toBe("/api/student/messes");
    expect(fetch.mock.calls[0][1].method).toBe("GET");
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("requests history pagination and optional filters", async () => {
    fetch.mockResolvedValueOnce(successfulResponse({ demands: [], pagination: {} }));
    await getStudentDemandHistory({ page: 2, limit: 10, status: "CANCELLED", serviceDate: "2026-11-09" });
    expect(fetch.mock.calls[0][0]).toBe("/api/student/demands/history?page=2&limit=10&status=CANCELLED&serviceDate=2026-11-09");
  });

  it("surfaces safe API errors including expired sessions and conflicts", async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      success: false,
      error: { code: "DUPLICATE_STUDENT_DEMAND", message: "Already exists." },
    }), { status: 409 }));
    await expect(createStudentDemand(sample)).rejects.toMatchObject({
      name: "StudentDemandApiError", status: 409, code: "DUPLICATE_STUDENT_DEMAND", message: "Already exists.",
    });

    fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Sign in is required." },
    }), { status: 401 }));
    await expect(getStudentDemandHistory()).rejects.toMatchObject({
      status: 401, code: "UNAUTHENTICATED", message: "Your session has expired. Sign in again to continue.",
    });
  });

  it("normalizes network failures into a useful message", async () => {
    fetch.mockRejectedValueOnce(new Error("private network details"));
    await expect(createStudentDemand(sample)).rejects.toMatchObject({
      name: "StudentDemandApiError",
      message: "We could not connect. Check your connection and try again.",
    });
  });
});
