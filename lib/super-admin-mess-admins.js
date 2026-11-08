import "server-only";

import {
  ACCOUNT_STATUS,
  USER_COLLECTION,
  USER_ROLE,
} from "./auth-contracts.js";
import { toObjectId } from "./mongo-ids.js";
import { getMongoDb } from "./mongodb.js";
import { AdminApiError } from "./super-admin-domain-api.js";

const SAFE_USER_PROJECTION = Object.freeze({
  _id: 1,
  name: 1,
  email: 1,
  status: 1,
  hostelId: 1,
  createdAt: 1,
  updatedAt: 1,
});

function formatMessAdmin(user) {
  return {
    id: user._id.toString(),
    name: user.name ?? "",
    email: user.email ?? "",
    status: user.status ?? null,
    hostelId: user.hostelId ?? null,
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
  };
}

function validateStatus(status) {
  if (status !== undefined && !Object.values(ACCOUNT_STATUS).includes(status)) {
    throw new AdminApiError("Status filter is not supported.", 400, "INVALID_STATUS_FILTER");
  }
}

export function readMessAdminStatusFilter(request) {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => key !== "status")) {
    throw new AdminApiError("Only the status filter is supported.", 400, "INVALID_QUERY");
  }

  const statuses = url.searchParams.getAll("status");
  if (statuses.length > 1) {
    throw new AdminApiError("Provide only one status filter.", 400, "INVALID_STATUS_FILTER");
  }

  const status = statuses[0];
  validateStatus(status);
  return status;
}

export function requireHostelIdBody(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    typeof body.hostelId !== "string"
  ) {
    throw new AdminApiError("Provide only a valid hostelId.", 400, "INVALID_BODY");
  }

  // Validate at the boundary while preserving the lowercase/uppercase hex value
  // contract expected by the Better Auth user field and assignment helper.
  toObjectId(body.hostelId, "hostelId");
  return body.hostelId;
}

export async function listMessAdmins(status) {
  validateStatus(status);
  const filter = { role: USER_ROLE.MESS_ADMIN };
  if (status !== undefined) filter.status = status;

  const db = await getMongoDb();
  const users = await db.collection(USER_COLLECTION)
    .find(filter)
    .project(SAFE_USER_PROJECTION)
    .sort({ createdAt: -1, _id: 1 })
    .toArray();

  return users.map(formatMessAdmin);
}

export async function rejectPendingMessAdmin(messAdminId) {
  const id = toObjectId(messAdminId, "messAdminId");
  const db = await getMongoDb();
  const users = db.collection(USER_COLLECTION);
  const result = await users.updateOne(
    { _id: id, role: USER_ROLE.MESS_ADMIN, status: ACCOUNT_STATUS.PENDING },
    { $set: { status: ACCOUNT_STATUS.REJECTED, updatedAt: new Date() } },
  );

  if (result.matchedCount !== 1) {
    const existing = await users.findOne(
      { _id: id, role: USER_ROLE.MESS_ADMIN },
      { projection: { _id: 1, status: 1 } },
    );
    if (!existing) {
      throw new AdminApiError("Mess Admin request not found.", 404, "MESS_ADMIN_NOT_FOUND");
    }
    throw new AdminApiError(
      "Only pending Mess Admin requests can be rejected.",
      409,
      "MESS_ADMIN_NOT_PENDING",
    );
  }

  const rejected = await users.findOne(
    { _id: id, role: USER_ROLE.MESS_ADMIN },
    { projection: SAFE_USER_PROJECTION },
  );
  if (!rejected) {
    throw new AdminApiError("Mess Admin request not found.", 404, "MESS_ADMIN_NOT_FOUND");
  }
  return formatMessAdmin(rejected);
}

export async function removeMessAdminAssignment(messAdminId, hostelId) {
  const userId = toObjectId(messAdminId, "messAdminId");
  const hostelObjectId = toObjectId(hostelId, "hostelId");
  const hostelIdValue = hostelObjectId.toHexString();
  const db = await getMongoDb();
  const users = db.collection(USER_COLLECTION);

  // This is an atomic compare-and-set on one Better Auth user document. It
  // cannot create another assigned admin, and refuses to clear a changed
  // assignment. The unique partial index remains owned by the shared helper.
  const result = await users.updateOne(
    {
      _id: userId,
      role: USER_ROLE.MESS_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      hostelId: hostelIdValue,
    },
    { $set: { hostelId: null, updatedAt: new Date() } },
  );

  if (result.matchedCount !== 1) {
    const existing = await users.findOne(
      { _id: userId, role: USER_ROLE.MESS_ADMIN },
      { projection: { _id: 1, status: 1, hostelId: 1 } },
    );
    if (!existing) {
      throw new AdminApiError("Mess Admin account not found.", 404, "MESS_ADMIN_NOT_FOUND");
    }
    if (existing.status !== ACCOUNT_STATUS.ACTIVE) {
      throw new AdminApiError("Only an active Mess Admin assignment can be removed.", 409, "MESS_ADMIN_NOT_ACTIVE");
    }
    throw new AdminApiError(
      "The Mess Admin is not currently assigned to the specified Hostel.",
      409,
      "ASSIGNMENT_MISMATCH",
    );
  }

  const updated = await users.findOne(
    { _id: userId, role: USER_ROLE.MESS_ADMIN },
    { projection: SAFE_USER_PROJECTION },
  );
  if (!updated) {
    throw new AdminApiError("Mess Admin account not found.", 404, "MESS_ADMIN_NOT_FOUND");
  }
  return formatMessAdmin(updated);
}
