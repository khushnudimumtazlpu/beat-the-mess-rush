
import { describe, expect, it } from "vitest";
import {
  calculateWaitingTime,
  getCrowdLevel,
  calculateQueueMetrics,
} from "./queue-calculations";

describe("calculateWaitingTime", () => {
  it("calculates a whole-minute wait", () => {
    expect(calculateWaitingTime(32, 4)).toBe(8);
  });

  it("rounds up partial minutes", () => {
    expect(calculateWaitingTime(5, 2)).toBe(3);
  });

  it("returns zero for an empty queue", () => {
    expect(calculateWaitingTime(0, 4)).toBe(0);
  });

  it("rejects a zero service rate", () => {
    expect(() => calculateWaitingTime(10, 0)).toThrow();
  });

  it("rejects negative queue lengths", () => {
    expect(() => calculateWaitingTime(-1, 4)).toThrow();
  });
});

describe("getCrowdLevel", () => {
  it("classifies crowd levels at the boundaries", () => {
    expect(getCrowdLevel(8)).toBe("low");
    expect(getCrowdLevel(9)).toBe("moderate");
    expect(getCrowdLevel(20)).toBe("moderate");
    expect(getCrowdLevel(21)).toBe("high");
    expect(getCrowdLevel(35)).toBe("high");
    expect(getCrowdLevel(36)).toBe("veryHigh");
  });
});

describe("calculateQueueMetrics", () => {
  it("calculates both metrics from the queue data", () => {
    expect(
      calculateQueueMetrics({
        peopleWaiting: 12,
        servingRatePerMinute: 4,
      })
    ).toEqual({
      estimatedWaitMinutes: 3,
      status: "moderate",
    });
  });
});
