import "server-only";
import { HOSTEL_COLLECTION } from "../../../../lib/auth-contracts.js";
import { getMongoDb } from "../../../../lib/mongodb.js";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await getMongoDb();
    const hostels = await db.collection(HOSTEL_COLLECTION)
      .find({ status: "ACTIVE" }, { projection: { _id: 1, name: 1 } })
      .sort({ name: 1, _id: 1 })
      .toArray();

    return Response.json(
      {
        success: true,
        data: hostels.map((hostel) => ({ id: hostel._id.toString(), name: hostel.name })),
        message: "Active Hostels retrieved successfully.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { success: false, error: { code: "HOSTELS_UNAVAILABLE", message: "Hostels are temporarily unavailable." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
