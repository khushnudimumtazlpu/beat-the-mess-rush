import "server-only";

import { AuthorizationError, requireActiveRole } from "./auth-authorization.js";
import { USER_ROLE } from "./auth-contracts.js";

export class AdminApiError extends Error {
  constructor(message, status = 400, code = "INVALID_INPUT") {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

export function apiSuccess(data, message = "Request successful.", status = 200) {
  return Response.json({ success: true, data, message }, { status });
}

export function apiError(message, code, status) {
  return Response.json({ success: false, error: { code, message } }, { status });
}

export async function withSuperAdminApi(action) {
  try {
    const actor = await requireActiveRole(USER_ROLE.SUPER_ADMIN);
    return await action(actor);
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof AdminApiError ||
      (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 && typeof error?.code === "string")
    ) {
      return apiError(error.message, error.code, error.status);
    }
    if (error instanceof TypeError) {
      return apiError(error.message, "INVALID_INPUT", 400);
    }
    if (error?.code === 11000) {
      return apiError("A record with this code already exists.", "DUPLICATE_CODE", 409);
    }
    console.error("Super Admin API error:", error);
    return apiError("An unexpected server error occurred.", "INTERNAL_SERVER_ERROR", 500);
  }
}

export async function readJsonObject(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new AdminApiError("Request body must contain valid JSON.", 400, "INVALID_JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AdminApiError("Request body must be a JSON object.", 400, "INVALID_BODY");
  }
  return body;
}
