import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { USER_ROLE } from "./auth-contracts.js";

const registrationIntentStorage = new AsyncLocalStorage();
const PUBLIC_REGISTRATION_ROLES = new Set([USER_ROLE.STUDENT, USER_ROLE.MESS_ADMIN]);

export function withRegistrationIntent(accountType, callback) {
  if (!PUBLIC_REGISTRATION_ROLES.has(accountType)) {
    throw new TypeError("Only Student and Mess Admin registration is allowed.");
  }
  return registrationIntentStorage.run(Object.freeze({ accountType }), callback);
}

export function getRegistrationIntent() {
  return registrationIntentStorage.getStore() ?? null;
}
