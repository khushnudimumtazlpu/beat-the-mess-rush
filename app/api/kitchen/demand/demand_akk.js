import { NextResponse } from "next/server";
import { getDemandData } from "../../../../features/kitchen/services/kitchen-db_akk.js";
import { authorizeKitchenRequest } from "../../../../features/kitchen/utils/kitchen-auth_akk.js";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedHostelId = searchParams.get("hostelId");
    const requestedMessId = searchParams.get("messId");
    const slotId = searchParams.get("slotId") || "lunch";
    const date = searchParams.get("date");

    const auth = await authorizeKitchenRequest(requestedHostelId, requestedMessId);

    const demand = await getDemandData({
      hostelId: auth.hostelId,
      messId: auth.messId,
      date,
      slotId,
    });

    return NextResponse.json({
      success: true,
      data: demand,
      meta: {
        hostelId: auth.hostelId,
        messId: auth.messId,
        slotId,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to retrieve demand data.",
        code: error.code || "SERVER_ERROR",
      },
      { status }
    );
  }
}
