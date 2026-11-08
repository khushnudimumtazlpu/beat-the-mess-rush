import "server-only";
import { createMess, listMesses } from "../../../../../../lib/super-admin-hostel-mess.js";
import { apiSuccess, readJsonObject, withSuperAdminApi } from "../../../../../../lib/super-admin-domain-api.js";

export const runtime = "nodejs";

export function GET(_request, { params }) {
  return withSuperAdminApi(async () => {
    const { hostelId } = await params;
    return apiSuccess(await listMesses(hostelId), "Messes retrieved successfully.");
  });
}

export function POST(request, { params }) {
  return withSuperAdminApi(async (actor) => {
    const { hostelId } = await params;
    const mess = await createMess(hostelId, await readJsonObject(request), actor);
    return apiSuccess(mess, "Mess created successfully.", 201);
  });
}
