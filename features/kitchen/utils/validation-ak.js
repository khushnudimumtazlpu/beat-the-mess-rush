// ─── Validation Utility (ak) ──────────────────────────────────────────────────
// Simple, readable validators. Each returns null (valid) or an error string.

/** Required field — must not be empty string */
export function required(value, label = "This field") {
  if (!value || String(value).trim() === "") {
    return `${label} is required.`;
  }
  return null;
}

/** Must be a positive whole number ≥ 1 */
export function positiveInt(value, label = "Value") {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    return `${label} must be a whole number of at least 1.`;
  }
  return null;
}

/** Must be a positive number ≥ 0 (decimals allowed, e.g. 0.5 kg) */
export function positiveNumber(value, label = "Value") {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return `${label} must be a positive number.`;
  }
  return null;
}

/**
 * Validate a production log entry.
 * Returns an object of field → error string (empty object = valid).
 */
export function validateProduction({ dishId, actualPrepared, portionsServed }) {
  const errors = {};
  const e1 = required(dishId, "Dish");
  if (e1) errors.dishId = e1;

  const e2 = positiveInt(actualPrepared, "Actual portions prepared");
  if (e2) errors.actualPrepared = e2;

  const e3 = positiveInt(portionsServed, "Portions served");
  if (e3) errors.portionsServed = e3;

  // Logical: served cannot exceed prepared
  const prep = Number(actualPrepared);
  const served = Number(portionsServed);
  if (!errors.actualPrepared && !errors.portionsServed && served > prep) {
    errors.portionsServed = "Portions served cannot exceed portions prepared.";
  }

  return errors;
}

/**
 * Validate a waste log entry.
 * Returns an object of field → error string.
 */
export function validateWaste({ slotId, dishName, category, weightKg, reason }) {
  const errors = {};

  const e1 = required(slotId, "Meal slot");
  if (e1) errors.slotId = e1;

  const e2 = required(dishName, "Dish name");
  if (e2) errors.dishName = e2;

  const e3 = required(category, "Waste category");
  if (e3) errors.category = e3;

  const e4 = positiveNumber(weightKg, "Weight (kg)");
  if (e4) errors.weightKg = e4;

  // Weight can't be 0 — at least 0.1 kg
  if (!e4 && Number(weightKg) < 0.1) {
    errors.weightKg = "Weight must be at least 0.1 kg.";
  }

  const e5 = required(reason, "Reason");
  if (e5) errors.reason = e5;

  return errors;
}
