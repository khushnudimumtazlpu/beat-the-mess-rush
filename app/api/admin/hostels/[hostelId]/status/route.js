import "server-only";
import { setHostelStatus } from "../../../../../../lib/super-admin-hostel-mess.js";
import { AdminApiError, apiSuccess, readJsonObject, withSuperAdminApi } from "../../../../../../lib/super-admin-domain-api.js";

export const runtime = "nodejs";

export function PATCH(request, { params }) {
  return withSuperAdminApi(async (actor) => {
    const { hostelId } = await params;
    const body = await readJsonObject(request);
    if (Object.keys(body).length !== 1 || !["ACTIVE", "INACTIVE"].includes(body.status)) {
      throw new AdminApiError("Provide only status: ACTIVE or INACTIVE.", 400, "INVALID_STATUS");
    }
    return apiSuccess(await setHostelStatus(hostelId, body.status, actor), "Hostel status updated successfully.");
  });
}
