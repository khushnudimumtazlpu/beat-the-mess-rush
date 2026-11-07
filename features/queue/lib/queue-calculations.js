import {
  QUEUE_CROWD_LEVELS,
  QUEUE_STATUSES,
  DEFAULT_CROWD_THRESHOLDS,
} from "../../../lib/domain-contracts.js";

// Re-export shared constants to preserve existing imports.
export const CROWD_LEVELS = QUEUE_CROWD_LEVELS;
export const CROWD_THRESHOLDS = DEFAULT_CROWD_THRESHOLDS;
export { QUEUE_STATUSES };

// Validate queue length.
export function validateWaitingCount(peopleWaiting) {
  if (!Number.isInteger(peopleWaiting) || peopleWaiting < 0) {
    throw new Error("People waiting must be a non-negative integer.");
  }
}

// Validate serving rate.
export function validateServingRate(servingRatePerMinute) {
  if (
    typeof servingRatePerMinute !== "number" ||
    !Number.isFinite(servingRatePerMinute) ||
    servingRatePerMinute <= 0
  ) {
    throw new Error("Serving rate must be a positive number.");
  }
}

// Calculate estimated waiting time in minutes.
export function calculateWaitingTime(
  peopleWaiting,
  servingRatePerMinute
) {
  validateWaitingCount(peopleWaiting);
  validateServingRate(servingRatePerMinute);

  return Math.ceil(peopleWaiting / servingRatePerMinute);
}

// Determine crowd level using shared thresholds.
export function getCrowdLevel(peopleWaiting) {
  validateWaitingCount(peopleWaiting);

  if (peopleWaiting <= CROWD_THRESHOLDS.LOW) {
    return CROWD_LEVELS.LOW;
  }

  if (peopleWaiting <= CROWD_THRESHOLDS.MODERATE) {
    return CROWD_LEVELS.MODERATE;
  }

  if (peopleWaiting <= CROWD_THRESHOLDS.HIGH) {
    return CROWD_LEVELS.HIGH;
  }

  return CROWD_LEVELS.VERY_HIGH;
}

// Determine operational queue status.
export function getQueueStatus(peopleWaiting, isOpen = true) {
  validateWaitingCount(peopleWaiting);

  if (typeof isOpen !== "boolean") {
    throw new Error("Queue availability must be boolean.");
  }

  if (!isOpen) {
    return QUEUE_STATUSES.CLOSED;
  }

  if (peopleWaiting <= CROWD_THRESHOLDS.LOW) {
    return QUEUE_STATUSES.NORMAL;
  }

  if (peopleWaiting <= CROWD_THRESHOLDS.HIGH) {
    return QUEUE_STATUSES.BUSY;
  }

  return QUEUE_STATUSES.CRITICAL;
}

// Calculate all queue metrics.
export function calculateQueueMetrics(queue) {
  if (!queue || typeof queue !== "object" || Array.isArray(queue)) {
    throw new Error("Valid queue data is required.");
  }

  const {
    peopleWaiting,
    servingRatePerMinute,
    isOpen = true,
  } = queue;

  return {
    peopleWaiting,
    estimatedWaitMinutes: calculateWaitingTime(
      peopleWaiting,
      servingRatePerMinute
    ),
    crowdLevel: getCrowdLevel(peopleWaiting),
    status: getQueueStatus(peopleWaiting, isOpen),
    isOpen,
  };
}
