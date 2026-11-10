import "server-only";

import { approveStudent } from "../../../../../../lib/student-approvals.js";
import { apiSuccess } from "../../../../../../lib/super-admin-domain-api.js";
import { withSuperAdminStudentApi } from "../../_shared.js";

export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return withSuperAdminStudentApi(async () => {
    const { studentId } = await params;
    const student = await approveStudent(studentId);
    return apiSuccess(student, "Student approved successfully.");
  });
}
