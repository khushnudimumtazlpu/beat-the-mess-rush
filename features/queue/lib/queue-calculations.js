
/**
 * Queue Calculation Utilities
 *
 * Handles:
 * 1. Queue status calculation
 * 2. Crowd-level calculation
 * 3. Estimated waiting-time calculation
 * 4. Combined queue metrics
 *
 * Crowd thresholds are initial demo rules,
 * not real mess capacity limits.
 */

// -----------------------------------------
// 1. QUEUE STATUS AND CROWD-LEVEL CONSTANTS
// -----------------------------------------

export const CROWD_LEVELS = {
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
  VERY_HIGH: "veryHigh",
};

export const QUEUE_STATUSES = {
  OPEN: "open",
  NORMAL: "normal",
  BUSY: "busy",
  CRITICAL: "critical",
  CLOSED: "closed",
};

// Initial demo thresholds
export const CROWD_THRESHOLDS = {
  LOW: 8,
  MODERATE: 20,
  HIGH: 35,
};

// -----------------------------------------
// 2. INPUT VALIDATION
// -----------------------------------------

export function validateWaitingCount(peopleWaiting) {
  if (
    !Number.isInteger(peopleWaiting) ||
    peopleWaiting < 0
  ) {
    throw new Error(
      "People waiting must be a non-negative integer."
    );
  }
}

export function validateServingRate(servingRatePerMinute) {
  if (
    typeof servingRatePerMinute !== "number" ||
    !Number.isFinite(servingRatePerMinute) ||
    servingRatePerMinute <= 0
  ) {
    throw new Error(
      "Serving rate must be a positive number."
    );
  }
}

// -----------------------------------------
// 3. WAITING-TIME CALCULATION
// -----------------------------------------

/**
 * Calculates estimated waiting time in minutes.
 *
 * Formula:
 * Waiting Time = People Waiting / Serving Rate
 *
 * Example:
 * 20 people / 4 people per minute = 5 minutes
 */

export function calculateWaitingTime(
  peopleWaiting,
  servingRatePerMinute
) {
  validateWaitingCount(peopleWaiting);
  validateServingRate(servingRatePerMinute);

  return Math.ceil(
    peopleWaiting / servingRatePerMinute
  );
}

// -----------------------------------------
// 4. CROWD-LEVEL CALCULATION
// -----------------------------------------

/**
 * Determines crowd level based on people waiting.
 *
 * 0-8    = Low
 * 9-20   = Moderate
 * 21-35  = High
 * Above 35 = Very High
 */

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

// -----------------------------------------
// 5. QUEUE STATUS CALCULATION
// -----------------------------------------

/**
 * Determines operational queue status.
 *
 * Closed queue = Closed
 * 0-8          = Normal
 * 9-35         = Busy
 * Above 35     = Critical
 */

export function getQueueStatus(
  peopleWaiting,
  isOpen = true
) {
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

// -----------------------------------------
// 6. COMBINED QUEUE METRICS
// -----------------------------------------

/**
 * Returns all calculated metrics for a queue.
 *
 * Required queue properties:
 * peopleWaiting
 * servingRatePerMinute
 *
 * Optional:
 * isOpen (defaults to true)
 */

export function calculateQueueMetrics(queue) {
  if (!queue || typeof queue !== "object") {
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
