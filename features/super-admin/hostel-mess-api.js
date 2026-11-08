const VALID_MEAL_TYPES = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"];

export class AdminRequestError extends Error {
  constructor(message, { code = "REQUEST_FAILED", status = 500 } = {}) {
    super(message);
    this.name = "AdminRequestError";
    this.code = code;
    this.status = status;
  }
}

export async function requestAdminApi(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new AdminRequestError("Could not connect. Check your connection and try again.", {
      code: "NETWORK_ERROR",
      status: 0,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AdminRequestError("The server returned an unreadable response.", {
      status: response.status,
    });
  }

  if (!response.ok || payload?.success !== true) {
    const code = payload?.error?.code ?? "REQUEST_FAILED";
    const message = code === "DUPLICATE_CODE"
      ? "That code is already in use. Choose a different code."
      : payload?.error?.message ?? "The request could not be completed. Try again.";
    throw new AdminRequestError(message, { code, status: response.status });
  }

  return payload.data;
}

export function validateHostelInput(values) {
  const errors = {};
  const name = values.name.trim();
  const code = values.code.trim().toUpperCase();
  const description = values.description.trim();

  if (name.length < 2 || name.length > 80) errors.name = "Use 2 to 80 characters.";
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) errors.code = "Use 3 to 20 letters, numbers, or hyphens.";
  if (description.length > 250) errors.description = "Use no more than 250 characters.";

  return errors;
}

export function validateMessInput(values) {
  const errors = validateHostelInput(values);
  if (!Array.isArray(values.mealTypes) || values.mealTypes.length === 0) {
    errors.mealTypes = "Select at least one meal type.";
  } else if (
    values.mealTypes.some((mealType) => !VALID_MEAL_TYPES.includes(mealType)) ||
    new Set(values.mealTypes).size !== values.mealTypes.length
  ) {
    errors.mealTypes = "Choose valid, unique meal types.";
  }
  return errors;
}

export function getAdminRequestMessage(error) {
  if (error instanceof AdminRequestError) return error.message;
  return "Something went wrong. Please try again.";
}
