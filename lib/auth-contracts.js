/**
 * Shared RushLess authentication values and storage contract.
 *
 * The installed Mongo adapter stores Better Auth's user `id` as MongoDB
 * `_id` (ObjectId by default) and returns it to the app as a hex string.
 * Better Auth custom fields such as role, status, and hostelId are ordinary
 * values: this schema declares them as strings, and the Mongo adapter does
 * not convert them to ObjectIds. Keep hostelId as a canonical ObjectId hex
 * string in both Better Auth and future domain documents, or cast it at the
 * database boundary when a domain collection uses ObjectId `_id` values.
 */

export const USER_ROLE = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  MESS_ADMIN: "MESS_ADMIN",
  STUDENT: "STUDENT",
});

export const ACCOUNT_STATUS = Object.freeze({
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
});

export const USER_COLLECTION = "user";
// These plural names match the default collections for future Mongoose
// Hostel and Mess models; Better Auth's user collection remains `user`.
export const HOSTEL_COLLECTION = "hostels";
export const MESS_COLLECTION = "messes";

export const ROLE_VALUES = Object.freeze(Object.values(USER_ROLE));
export const STATUS_VALUES = Object.freeze(Object.values(ACCOUNT_STATUS));

export function isActiveUser(user) {
  return Boolean(user && user.status === ACCOUNT_STATUS.ACTIVE);
}

export function hasRole(user, role) {
  return Boolean(user && user.role === role);
}

export function hasHostelScope(user, hostelId) {
  return Boolean(
    user &&
      typeof user.hostelId === "string" &&
      typeof hostelId === "string" &&
      user.hostelId === hostelId,
  );
}
