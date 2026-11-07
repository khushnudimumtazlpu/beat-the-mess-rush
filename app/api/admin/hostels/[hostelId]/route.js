import "server-only";
import { getHostel, updateHostel } from "../../../../../lib/super-admin-hostel-mess.js";
import { apiSuccess, readJsonObject, withSuperAdminApi } from "../../../../../lib/super-admin-domain-api.js";

export const runtime = "nodejs";

export function GET(_request, { params }) {
  return withSuperAdminApi(async () => {
    const { hostelId } = await params;
    return apiSuccess(await getHostel(hostelId), "Hostel retrieved successfully.");
  });
}

export function PATCH(request, { params }) {
  return withSuperAdminApi(async () => {
    const { hostelId } = await params;
    const hostel = await updateHostel(hostelId, await readJsonObject(request));
    return apiSuccess(hostel, "Hostel updated successfully.");
  });
}
