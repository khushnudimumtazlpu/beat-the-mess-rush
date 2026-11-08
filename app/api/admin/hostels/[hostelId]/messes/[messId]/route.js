import "server-only";
import { getMess, updateMess } from "../../../../../../../lib/super-admin-hostel-mess.js";
import { apiSuccess, readJsonObject, withSuperAdminApi } from "../../../../../../../lib/super-admin-domain-api.js";

export const runtime = "nodejs";

export function GET(_request, { params }) {
  return withSuperAdminApi(async () => {
    const { hostelId, messId } = await params;
    return apiSuccess(await getMess(hostelId, messId), "Mess retrieved successfully.");
  });
}

export function PATCH(request, { params }) {
  return withSuperAdminApi(async () => {
    const { hostelId, messId } = await params;
    const mess = await updateMess(hostelId, messId, await readJsonObject(request));
    return apiSuccess(mess, "Mess updated successfully.");
  });
}
