import { describe, expect, it } from "vitest";
import { getIndiaServiceDate } from "./india-service-date.js";

describe("getIndiaServiceDate", () => {
  it("returns the same IST date before the UTC date changes in India", () => {
    expect(getIndiaServiceDate(new Date("2026-11-07T18:29:59.000Z")))
      .toBe("2026-11-07");
  });

  it("returns the next IST date at the UTC-to-IST boundary", () => {
    expect(getIndiaServiceDate(new Date("2026-11-07T18:30:00.000Z")))
      .toBe("2026-11-08");
  });

  it("handles UTC times that fall on the next calendar day in India", () => {
    expect(getIndiaServiceDate(new Date("2026-11-07T20:00:00.000Z")))
      .toBe("2026-11-08");
  });
});