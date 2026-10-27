
/**
 * Queue calculation utilities.
 * Crowd thresholds are initial demo rules, not real mess capacity limits.
 */

export function calculateWaitingTime(
  peopleWaiting,
  servingRatePerMinute
) {
  if (
    !Number.isInteger(peopleWaiting) ||
    peopleWaiting < 0
  ) {
    throw new Error(
      "People waiting must be a non-negative integer."
    );
  }

  if (
    typeof servingRatePerMinute !== "number" ||
    !Number.isFinite(servingRatePerMinute) ||
    servingRatePerMinute <= 0
  ) {
    throw new Error(
      "Serving rate must be a positive number."
    );
  }

  return Math.ceil(
    peopleWaiting / servingRatePerMinute
  );
}

export function getCrowdLevel(peopleWaiting) {
  if (
    !Number.isInteger(peopleWaiting) ||
    peopleWaiting < 0
  ) {
    throw new Error(
      "People waiting must be a non-negative integer."
    );
  }

  if (peopleWaiting <= 8) return "low";
  if (peopleWaiting <= 20) return "moderate";
  if (peopleWaiting <= 35) return "high";

  return "veryHigh";
}

export function calculateQueueMetrics(queue) {
  return {
    estimatedWaitMinutes: calculateWaitingTime(
      queue.peopleWaiting,
      queue.servingRatePerMinute
    ),
    status: getCrowdLevel(queue.peopleWaiting),
  };
}
