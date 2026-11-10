import "server-only";

import { ACCOUNT_STATUS, USER_COLLECTION, USER_ROLE } from "./auth-contracts.js";
import { toObjectId } from "./mongo-ids.js";
import { getMongoDb } from "./mongodb.js";

export const STUDENT_APPROVAL_ERROR = Object.freeze({
  INVALID_ID: "INVALID_STUDENT_ID",
  NOT_FOUND: "STUDENT_NOT_FOUND",
  WRONG_ROLE: "STUDENT_WRONG_ROLE",
  NOT_PENDING: "STUDENT_NOT_PENDING",
});

export class StudentApprovalError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "StudentApprovalError";
    this.code = code;
    this.status = status;
  }
}

const SAFE_STUDENT_PROJECTION = Object.freeze({
  _id: 1,
  name: 1,
  email: 1,
  role: 1,
  status: 1,
  hostelId: 1,
  createdAt: 1,
  updatedAt: 1,
});

function safeStudent(user) {
  return {
    id: user._id.toString(),
    name: user.name ?? "",
    email: user.email ?? "",
    status: user.status,
    hostelId: user.hostelId ?? null,
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
  };
}

function notFound() {
  return new StudentApprovalError("Student account not found.", STUDENT_APPROVAL_ERROR.NOT_FOUND, 404);
}

function assertExpectedHostelId(value) {
  if (value === undefined) return undefined;
  try {
    return toObjectId(value, "hostelId").toHexString();
  } catch {
    throw new StudentApprovalError(
      "A valid server-authorized Hostel scope is required.",
      "INVALID_HOSTEL_SCOPE",
      400,
    );
  }
}

/**
 * Change a pending Student's decision with a single conditional MongoDB write.
 * `expectedHostelId`, when provided, must come from the authenticated caller's
 * server-side session, never from request data. Authorization is enforced by
 * the route before calling this data service.
 */
async function decideStudent(studentId, nextStatus, { expectedHostelId } = {}) {
  let id;
  try {
    id = toObjectId(studentId, "studentId");
  } catch {
    throw new StudentApprovalError(
      "Student ID must be a valid MongoDB ObjectId.",
      STUDENT_APPROVAL_ERROR.INVALID_ID,
      400,
    );
  }
  const hostelScope = assertExpectedHostelId(expectedHostelId);
  const db = await getMongoDb();
  const users = db.collection(USER_COLLECTION);
  const scopeFilter = hostelScope === undefined ? {} : { hostelId: hostelScope };
  const filter = {
    _id: id,
    role: USER_ROLE.STUDENT,
    status: ACCOUNT_STATUS.PENDING,
    ...scopeFilter,
  };
  const updatedAt = new Date();
  const result = await users.updateOne(filter, {
    $set: { status: nextStatus, updatedAt },
  });

  if (result.matchedCount !== 1) {
    const existing = await users.findOne(
      { _id: id },
      { projection: SAFE_STUDENT_PROJECTION },
    );
    // Scope-limited callers must not be able to distinguish an out-of-scope
    // account from an absent one.
    if (!existing || (hostelScope !== undefined && existing.hostelId !== hostelScope)) {
      throw notFound();
    }
    if (existing.role !== USER_ROLE.STUDENT) {
      throw new StudentApprovalError(
        "The requested account is not a Student.",
        STUDENT_APPROVAL_ERROR.WRONG_ROLE,
        409,
      );
    }
    throw new StudentApprovalError(
      "Only pending Student accounts can be approved or rejected.",
      STUDENT_APPROVAL_ERROR.NOT_PENDING,
      409,
    );
  }

  // The conditional update changes only status and updatedAt. The Hostel
  // association is read back and returned without being writable here.
  const updated = await users.findOne(
    { _id: id, role: USER_ROLE.STUDENT, status: nextStatus, ...scopeFilter },
    { projection: SAFE_STUDENT_PROJECTION },
  );
  if (!updated) throw notFound();
  return safeStudent(updated);
}

export function approveStudent(studentId, options) {
  return decideStudent(studentId, ACCOUNT_STATUS.ACTIVE, options);
}

export function rejectStudent(studentId, options) {
  return decideStudent(studentId, ACCOUNT_STATUS.REJECTED, options);
}
