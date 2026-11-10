import "server-only";

import { AuthorizationError, requireActiveRole } from "../../../../lib/auth-authorization.js";
import { ACCOUNT_STATUS, HOSTEL_COLLECTION, USER_COLLECTION, USER_ROLE } from "../../../../lib/auth-contracts.js";
import { isValidObjectIdHex, toObjectId } from "../../../../lib/mongo-ids.js";
import { getMongoDb } from "../../../../lib/mongodb.js";
import { StudentApprovalError } from "../../../../lib/student-approvals.js";

export class MessAdminStudentApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "MessAdminStudentApiError";
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

/**
 * Authenticate the current active Mess Admin, then verify their assignment
 * against the current Better Auth user document and active Hostel record.
 * The returned scope is derived exclusively from the authenticated session.
 */
export async function getMessAdminStudentContext() {
  const actor = await requireActiveRole(USER_ROLE.MESS_ADMIN);
  if (!isValidObjectIdHex(actor?.id) || !isValidObjectIdHex(actor?.hostelId)) {
    throw new MessAdminStudentApiError(
      "An active Hostel assignment is required to manage Students.",
      403,
      "MESS_ADMIN_ASSIGNMENT_REQUIRED",
    );
  }

  const userId = toObjectId(actor.id, "userId");
  const hostelObjectId = toObjectId(actor.hostelId, "hostelId");
  const hostelId = hostelObjectId.toHexString();
  const db = await getMongoDb();
  const currentAdmin = await db.collection(USER_COLLECTION).findOne(
    {
      _id: userId,
      role: USER_ROLE.MESS_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      hostelId,
    },
    { projection: { _id: 1 } },
  );

  if (!currentAdmin) {
    throw new MessAdminStudentApiError(
      "The active Mess Admin Hostel assignment could not be verified.",
      403,
      "MESS_ADMIN_ASSIGNMENT_INVALID",
    );
  }

  const activeHostel = await db.collection(HOSTEL_COLLECTION).findOne(
    { _id: hostelObjectId, status: "ACTIVE" },
    { projection: { _id: 1 } },
  );
  if (!activeHostel) {
    throw new MessAdminStudentApiError(
      "Student approvals are unavailable for this Hostel.",
      403,
      "HOSTEL_INACTIVE",
    );
  }

  return { actor, db, hostelId };
}

export async function withMessAdminStudentApi(action) {
  try {
    const context = await getMessAdminStudentContext();
    return await action(context);
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof StudentApprovalError ||
      error instanceof MessAdminStudentApiError
    ) {
      return apiError(error.message, error.code, error.status);
    }

    console.error("Mess Admin Student API error:", error);
    return apiError("An unexpected server error occurred.", "INTERNAL_SERVER_ERROR", 500);
  }
}

export const SAFE_STUDENT_LIST_PROJECTION = Object.freeze({
  _id: 1,
  name: 1,
  email: 1,
  status: 1,
  hostelId: 1,
  createdAt: 1,
  updatedAt: 1,
});

export function formatPendingStudent(student) {
  return {
    id: student._id.toString(),
    name: student.name ?? "",
    email: student.email ?? "",
    status: student.status,
    hostelId: student.hostelId ?? null,
    createdAt: student.createdAt ?? null,
    updatedAt: student.updatedAt ?? null,
  };
}
