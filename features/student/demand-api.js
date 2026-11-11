const HISTORY_PATH = "/api/student/demands/history";
const DEMANDS_PATH = "/api/student/demands";
const STUDENT_SCOPE_ERROR_CODES = new Set([
  "INVALID_STUDENT_DEMAND_IDENTITY",
  "INVALID_STUDENT_SCOPE",
  "STUDENT_HOSTEL_UNAVAILABLE",
]);

export function isStudentScopeError(error) {
  return STUDENT_SCOPE_ERROR_CODES.has(error?.code);
}

export function getStudentWorkspaceStatus({ isLoading, isMessLoading, loadError, messLoadError }) {
  if (isLoading || isMessLoading) return { label: "Checking account access", tone: "lavender" };
  if (isStudentScopeError(loadError) || isStudentScopeError(messLoadError)) {
    return { label: "Account setup needed", tone: "coral" };
  }
  const error = loadError ?? messLoadError;
  if (!error) return { label: "Account ready", tone: "teal" };
  if (error.status === 401) return { label: "Sign in again", tone: "coral" };
  return { label: "Connection needs attention", tone: "coral" };
}

export class StudentDemandApiError extends Error {
  constructor(message, { status = 0, code = "REQUEST_FAILED" } = {}) {
    super(message);
    this.name = "StudentDemandApiError";
    this.status = status;
    this.code = code;
  }
}

export async function requestStudentApi(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      ...(body === undefined ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new StudentDemandApiError("We could not connect. Check your connection and try again.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new StudentDemandApiError("The server returned an unreadable response.", { status: response.status });
  }

  if (!response.ok || payload?.success !== true) {
    const code = payload?.error?.code ?? "REQUEST_FAILED";
    const message = response.status === 401
      ? "Your session has expired. Sign in again to continue."
      : payload?.error?.message ?? "We could not complete that request. Try again.";
    throw new StudentDemandApiError(message, { status: response.status, code });
  }

  return payload.data;
}

export function getIndiaServiceDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function toExpectedArrivalAt(time, now = new Date()) {
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new TypeError("Choose a valid expected arrival time.");
  }
  return `${getIndiaServiceDate(now)}T${time}:00+05:30`;
}

export function getCurrentStudentDemands({ serviceDate, signal }) {
  const params = new URLSearchParams({ serviceDate, status: "ACTIVE", limit: "50", page: "1" });
  return requestStudentApi(`${HISTORY_PATH}?${params}`, { signal });
}

export function getActiveStudentMesses({ signal } = {}) {
  return requestStudentApi("/api/student/messes", { signal });
}

export function resolveActiveMessSelection(messes, preferredMessId) {
  if (!Array.isArray(messes) || messes.length === 0) return "";
  if (messes.length === 1) return messes[0].id;
  return messes.some((mess) => mess.id === preferredMessId) ? preferredMessId : "";
}

export function createStudentDemand({ mealType, portion, expectedArrivalAt, messId }) {
  return requestStudentApi(DEMANDS_PATH, {
    method: "POST",
    body: {
      mealType,
      portion,
      expectedArrivalAt,
      ...(messId ? { messId } : {}),
    },
  });
}

export function updateStudentDemand(demandId, { mealType, portion, expectedArrivalAt, messId }) {
  return requestStudentApi(`${DEMANDS_PATH}/${encodeURIComponent(demandId)}`, {
    method: "PATCH",
    body: {
      mealType,
      portion,
      expectedArrivalAt,
      ...(messId ? { messId } : {}),
    },
  });
}

export function cancelStudentDemand(demandId) {
  return requestStudentApi(`${DEMANDS_PATH}/${encodeURIComponent(demandId)}`, { method: "DELETE" });
}

export function getStudentDemandHistory({ page = 1, limit = 10, status, serviceDate, signal } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set("status", status);
  if (serviceDate) params.set("serviceDate", serviceDate);
  return requestStudentApi(`${HISTORY_PATH}?${params}`, { signal });
}
