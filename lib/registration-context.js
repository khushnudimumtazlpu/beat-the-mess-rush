import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { USER_ROLE } from "./auth-contracts.js";
import { isValidObjectIdHex } from "./mongo-ids.js";

// Next.js can load the registration route and the cached Better Auth instance
// through separate server module graphs. Keep one request-local storage
// instance across those graphs so the auth hook observes the same intent.
const globalForRegistrationContext = globalThis;
const registrationIntentStorageKey = Symbol.for("rushless.registrationIntentStorage");

export function getRegistrationIntentStorage() {
  return globalForRegistrationContext[registrationIntentStorageKey]
    ?? (globalForRegistrationContext[registrationIntentStorageKey] = new AsyncLocalStorage());
}
const PUBLIC_REGISTRATION_ROLES = new Set([USER_ROLE.STUDENT, USER_ROLE.MESS_ADMIN]);

export function withRegistrationIntent(accountType, callback, options = {}) {
  if (!PUBLIC_REGISTRATION_ROLES.has(accountType)) {
    throw new TypeError("Only Student and Mess Admin registration is allowed.");
  }

  if (
    accountType === USER_ROLE.STUDENT &&
    options.hostelId !== undefined &&
    options.hostelId !== null &&
    !isValidObjectIdHex(options.hostelId)
  ) {
    throw new TypeError("Student registration requires a validated Hostel ID.");
  }
  if (accountType === USER_ROLE.MESS_ADMIN && options.hostelId !== undefined && options.hostelId !== null) {
    throw new TypeError("Mess Admin registration cannot include a Hostel ID.");
  }

  const intent = Object.freeze({
    accountType,
    ...(accountType === USER_ROLE.STUDENT && options.hostelId
      ? { hostelId: options.hostelId.toLowerCase() }
      : {}),
  });
  return getRegistrationIntentStorage().run(intent, callback);
}

export function getRegistrationIntent() {
  return getRegistrationIntentStorage().getStore() ?? null;
}
