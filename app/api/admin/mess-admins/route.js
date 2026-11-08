import "server-only";
import { listMessAdmins, readMessAdminStatusFilter } from "../../../../lib/super-admin-mess-admins.js";
import { apiSuccess, withSuperAdminApi } from "../../../../lib/super-admin-domain-api.js";

export const runtime = "nodejs";

export function GET(request) {
  return withSuperAdminApi(async () => {
    const status = readMessAdminStatusFilter(request);
    return apiSuccess(await listMessAdmins(status), "Mess Admins retrieved successfully.");
  });
}
