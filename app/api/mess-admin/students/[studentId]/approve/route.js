import "server-only";

import { approveStudent } from "../../../../../../lib/student-approvals.js";
import { apiSuccess, withMessAdminStudentApi } from "../../_shared.js";

export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return withMessAdminStudentApi(async ({ hostelId }) => {
    const { studentId } = await params;
    const student = await approveStudent(studentId, { expectedHostelId: hostelId });
    return apiSuccess(student, "Student approved successfully.");
  });
}
