import "server-only";

import { ACCOUNT_STATUS, USER_COLLECTION, USER_ROLE } from "../../../../lib/auth-contracts.js";
import { apiSuccess } from "../../../../lib/super-admin-domain-api.js";
import { formatStudent, SAFE_STUDENT_PROJECTION, withSuperAdminStudentApi } from "./_shared.js";

export const runtime = "nodejs";

export function GET() {
  return withSuperAdminStudentApi(async ({ db }) => {
    const students = await db.collection(USER_COLLECTION)
      .find({ role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.PENDING })
      .project(SAFE_STUDENT_PROJECTION)
      .sort({ createdAt: -1, _id: 1 })
      .toArray();

    return apiSuccess(
      students.map(formatStudent),
      "Pending Students retrieved successfully.",
    );
  });
}
