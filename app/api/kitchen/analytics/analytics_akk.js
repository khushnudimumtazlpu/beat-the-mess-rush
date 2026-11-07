import { NextResponse } from "next/server";
import { getKitchenAnalytics } from "../../../../features/kitchen/services/kitchen-db_akk.js";
import { authorizeKitchenRequest } from "../../../../features/kitchen/utils/kitchen-auth_akk.js";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedHostelId = searchParams.get("hostelId");
    const requestedMessId = searchParams.get("messId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const auth = await authorizeKitchenRequest(requestedHostelId, requestedMessId);

    const analytics = await getKitchenAnalytics({
      hostelId: auth.hostelId,
      messId: auth.messId,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      data: analytics,
      meta: {
        hostelId: auth.hostelId,
        messId: auth.messId,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to retrieve kitchen analytics.",
        code: error.code || "SERVER_ERROR",
      },
      { status }
    );
  }
}
