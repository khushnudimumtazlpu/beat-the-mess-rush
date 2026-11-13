import "server-only";

import { ACCOUNT_STATUS, HOSTEL_COLLECTION, USER_COLLECTION, USER_ROLE } from "../../../../lib/auth-contracts.js";
import { isValidObjectIdHex, toObjectId } from "../../../../lib/mongo-ids.js";
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

    const validHostelIds = [
      ...new Set(
        students
          .map((s) => s.hostelId)
          .filter((id) => isValidObjectIdHex(id)),
      ),
    ];

    let hostelMap = new Map();
    if (validHostelIds.length > 0) {
      const hostels = await db.collection(HOSTEL_COLLECTION)
        .find(
          { _id: { $in: validHostelIds.map((id) => toObjectId(id, "hostelId")) } },
          { projection: { _id: 1, name: 1 } },
        )
        .toArray();

      hostelMap = new Map(
        hostels.map((h) => [h._id.toString(), h.name]),
      );
    }

    return apiSuccess(
      students.map((student) => formatStudent(student, hostelMap.get(student.hostelId))),
      "Pending Students retrieved successfully.",
    );
  });
}
