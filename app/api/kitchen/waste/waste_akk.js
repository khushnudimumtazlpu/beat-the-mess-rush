import { NextResponse } from "next/server";
import {
  getWasteRecords,
  createWasteRecord,
} from "../../../../features/kitchen/services/kitchen-db_akk.js";
import { authorizeKitchenRequest } from "../../../../features/kitchen/utils/kitchen-auth_akk.js";
import { validateWaste } from "../../../../features/kitchen/utils/validation-ak.js";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedHostelId = searchParams.get("hostelId");
    const requestedMessId = searchParams.get("messId");
    const slotId = searchParams.get("slotId");
    const date = searchParams.get("date");
    const category = searchParams.get("category");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const auth = await authorizeKitchenRequest(requestedHostelId, requestedMessId);

    const records = await getWasteRecords({
      hostelId: auth.hostelId,
      messId: auth.messId,
      date,
      slotId,
      category,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      data: records,
      meta: {
        hostelId: auth.hostelId,
        messId: auth.messId,
        count: records.length,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to retrieve waste records.",
        code: error.code || "SERVER_ERROR",
      },
      { status }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const validationErrors = validateWaste(body);
    if (Object.keys(validationErrors).length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed.",
          details: validationErrors,
        },
        { status: 400 }
      );
    }

    const auth = await authorizeKitchenRequest(body.hostelId, body.messId);

    const created = await createWasteRecord({
      hostelId: auth.hostelId,
      messId: auth.messId,
      date: body.date,
      slotId: body.slotId,
      dishName: body.dishName,
      category: body.category,
      weightKg: body.weightKg,
      portionsLost: body.portionsLost,
      costInr: body.costInr,
      reason: body.reason,
      loggedBy: auth.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: "Waste record created successfully.",
      },
      { status: 201 }
    );
  } catch (error) {
    const status = error.status || 500;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create waste record.",
        code: error.code || "SERVER_ERROR",
      },
      { status }
    );
  }
}
