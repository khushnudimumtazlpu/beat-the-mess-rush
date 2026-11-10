import "server-only";

import { rejectStudent } from "../../../../../../lib/student-approvals.js";
import { apiSuccess, withMessAdminStudentApi } from "../../_shared.js";

export const runtime = "nodejs";

export async function POST(_request, { params }) {
  return withMessAdminStudentApi(async ({ hostelId }) => {
    const { studentId } = await params;
    const student = await rejectStudent(studentId, { expectedHostelId: hostelId });
    return apiSuccess(student, "Student rejected successfully.");
  });
}
