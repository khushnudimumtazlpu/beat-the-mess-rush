import "server-only";
import { createHostel, listHostels } from "../../../../lib/super-admin-hostel-mess.js";
import { apiSuccess, readJsonObject, withSuperAdminApi } from "../../../../lib/super-admin-domain-api.js";

export const runtime = "nodejs";

export function GET() {
  return withSuperAdminApi(async () => apiSuccess(await listHostels(), "Hostels retrieved successfully."));
}

export function POST(request) {
  return withSuperAdminApi(async (actor) => {
    const hostel = await createHostel(await readJsonObject(request), actor);
    return apiSuccess(hostel, "Hostel created successfully.", 201);
  });
}
