import "server-only";

import { ACCOUNT_STATUS, USER_COLLECTION, USER_ROLE } from "../../../../lib/auth-contracts.js";
import {
  apiSuccess,
  SAFE_STUDENT_LIST_PROJECTION,
  formatPendingStudent,
  withMessAdminStudentApi,
} from "./_shared.js";

export const runtime = "nodejs";

export function GET() {
  return withMessAdminStudentApi(async ({ db, hostelId }) => {
    const students = await db.collection(USER_COLLECTION)
      .find({
        role: USER_ROLE.STUDENT,
        status: ACCOUNT_STATUS.PENDING,
        hostelId,
      })
      .project(SAFE_STUDENT_LIST_PROJECTION)
      .sort({ createdAt: -1, _id: 1 })
      .toArray();

    return apiSuccess(
      students.map(formatPendingStudent),
      "Pending Students retrieved successfully.",
    );
  });
}
