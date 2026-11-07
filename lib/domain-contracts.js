
export const COUNTER_COLLECTION = "counters";
export const QUEUE_COLLECTION = "queues";
export const QUEUE_HISTORY_COLLECTION = "queueHistory";

export const MEAL_TYPES = Object.freeze({
  BREAKFAST: "BREAKFAST",
  LUNCH: "LUNCH",
  SNACKS: "SNACKS",
  DINNER: "DINNER",
});

export const QUEUE_CROWD_LEVELS = Object.freeze({
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
  VERY_HIGH: "veryHigh",
});

export const QUEUE_STATUSES = Object.freeze({
  NORMAL: "normal",
  BUSY: "busy",
  CRITICAL: "critical",
  CLOSED: "closed",
});

export const DEFAULT_CROWD_THRESHOLDS = Object.freeze({
  LOW: 8,
  MODERATE: 20,
  HIGH: 35,
});

export function isAllowedValue(value, allowedValues) {
  return Object.values(allowedValues).includes(value);
}
