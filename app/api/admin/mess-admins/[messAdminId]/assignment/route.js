import "server-only";
import { removeMessAdminAssignment, requireHostelIdBody } from "../../../../../../lib/super-admin-mess-admins.js";
import { apiSuccess, readJsonObject, withSuperAdminApi } from "../../../../../../lib/super-admin-domain-api.js";

export const runtime = "nodejs";

export function DELETE(request, { params }) {
  return withSuperAdminApi(async () => {
    const { messAdminId } = await params;
    const hostelId = requireHostelIdBody(await readJsonObject(request));
    const account = await removeMessAdminAssignment(messAdminId, hostelId);
    return apiSuccess(account, "Mess Admin assignment removed successfully.");
  });
}
