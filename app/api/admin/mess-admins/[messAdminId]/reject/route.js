import "server-only";
import { rejectPendingMessAdmin } from "../../../../../../lib/super-admin-mess-admins.js";
import { apiSuccess, withSuperAdminApi } from "../../../../../../lib/super-admin-domain-api.js";

export const runtime = "nodejs";

export function POST(_request, { params }) {
  return withSuperAdminApi(async () => {
    const { messAdminId } = await params;
    const rejected = await rejectPendingMessAdmin(messAdminId);
    return apiSuccess(rejected, "Mess Admin request rejected successfully.");
  });
}
