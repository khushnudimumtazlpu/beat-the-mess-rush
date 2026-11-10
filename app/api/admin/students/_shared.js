import "server-only";

import { apiError } from "../../../../lib/super-admin-domain-api.js";
import { AuthorizationError, requireActiveRole } from "../../../../lib/auth-authorization.js";
import { ACCOUNT_STATUS, USER_COLLECTION, USER_ROLE } from "../../../../lib/auth-contracts.js";
import { isValidObjectIdHex, toObjectId } from "../../../../lib/mongo-ids.js";
import { getMongoDb } from "../../../../lib/mongodb.js";
import { StudentApprovalError } from "../../../../lib/student-approvals.js";

export class SuperAdminStudentApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "SuperAdminStudentApiError";
    this.status = status;
    this.code = code;
  }
}

export const SAFE_STUDENT_PROJECTION = Object.freeze({
  _id: 1,
  name: 1,
  email: 1,
  status: 1,
  hostelId: 1,
  createdAt: 1,
  updatedAt: 1,
});

export function formatStudent(student) {
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

/** Reuse the established Super Admin session guard and verify its identity against current storage. */
export function withSuperAdminStudentApi(action) {
  return (async () => {
    try {
      const actor = await requireActiveRole(USER_ROLE.SUPER_ADMIN);
      if (!isValidObjectIdHex(actor?.id)) {
        throw new SuperAdminStudentApiError(
          "The Super Admin identity could not be verified.",
          403,
          "SUPER_ADMIN_IDENTITY_INVALID",
        );
      }

      const db = await getMongoDb();
      const currentAdmin = await db.collection(USER_COLLECTION).findOne(
        {
          _id: toObjectId(actor.id, "userId"),
          role: USER_ROLE.SUPER_ADMIN,
          status: ACCOUNT_STATUS.ACTIVE,
        },
        { projection: { _id: 1 } },
      );
      if (!currentAdmin) {
        throw new SuperAdminStudentApiError(
          "The active Super Admin account could not be verified.",
          403,
          "SUPER_ADMIN_IDENTITY_INVALID",
        );
      }

      return await action({ actor, db });
    } catch (error) {
      if (
        error instanceof AuthorizationError ||
        error instanceof StudentApprovalError ||
        error instanceof SuperAdminStudentApiError
      ) {
        return apiError(error.message, error.code, error.status);
      }

      console.error("Super Admin Student API error:", error);
      return apiError("An unexpected server error occurred.", "INTERNAL_SERVER_ERROR", 500);
    }
  })();
}
