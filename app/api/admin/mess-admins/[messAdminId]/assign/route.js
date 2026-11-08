import "server-only";
import { assignHostelMessAdmin } from "../../../../../../lib/mess-admin-assignments.js";
import { requireHostelIdBody } from "../../../../../../lib/super-admin-mess-admins.js";
import { apiSuccess, readJsonObject, withSuperAdminApi } from "../../../../../../lib/super-admin-domain-api.js";

export const runtime = "nodejs";

export function POST(request, { params }) {
  return withSuperAdminApi(async () => {
    const { messAdminId } = await params;
    const hostelId = requireHostelIdBody(await readJsonObject(request));
    const assignment = await assignHostelMessAdmin({ hostelId, messAdminId });
    return apiSuccess(assignment, "Mess Admin approved and assigned successfully.");
  });
}
