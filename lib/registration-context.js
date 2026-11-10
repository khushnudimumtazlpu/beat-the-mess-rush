import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { USER_ROLE } from "./auth-contracts.js";
import { isValidObjectIdHex } from "./mongo-ids.js";

const registrationIntentStorage = new AsyncLocalStorage();
const PUBLIC_REGISTRATION_ROLES = new Set([USER_ROLE.STUDENT, USER_ROLE.MESS_ADMIN]);

export function withRegistrationIntent(accountType, callback, options = {}) {
  if (!PUBLIC_REGISTRATION_ROLES.has(accountType)) {
    throw new TypeError("Only Student and Mess Admin registration is allowed.");
  }

  if (accountType === USER_ROLE.STUDENT && !isValidObjectIdHex(options.hostelId)) {
    throw new TypeError("Student registration requires a validated Hostel ID.");
  }
  if (accountType === USER_ROLE.MESS_ADMIN && options.hostelId !== undefined) {
    throw new TypeError("Mess Admin registration cannot include a Hostel ID.");
  }

  const intent = Object.freeze({
    accountType,
    ...(accountType === USER_ROLE.STUDENT ? { hostelId: options.hostelId.toLowerCase() } : {}),
  });
  return registrationIntentStorage.run(intent, callback);
}

export function getRegistrationIntent() {
  return registrationIntentStorage.getStore() ?? null;
}
