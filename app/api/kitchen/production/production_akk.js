import { NextResponse } from "next/server";
import {
  getProductionRecords,
  createProductionRecord,
  updateProductionRecord,
} from "../../../../features/kitchen/services/kitchen-db_akk.js";
import { authorizeKitchenRequest } from "../../../../features/kitchen/utils/kitchen-auth_akk.js";
import { validateProduction } from "../../../../features/kitchen/utils/validation-ak.js";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedHostelId = searchParams.get("hostelId");
    const slotId = searchParams.get("slotId");
    const date = searchParams.get("date");
    const messId = searchParams.get("messId");

    const auth = await authorizeKitchenRequest(requestedHostelId);

    const records = await getProductionRecords({
      hostelId: auth.hostelId,
      messId: messId || auth.messId,
      date,
      slotId,
    });

    return NextResponse.json({
      success: true,
      data: records,
      meta: {
        hostelId: auth.hostelId,
        count: records.length,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to retrieve production records.",
        code: error.code || "SERVER_ERROR",
      },
      { status }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const validationErrors = validateProduction(body);
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

    const auth = await authorizeKitchenRequest(body.hostelId);

    const created = await createProductionRecord({
      hostelId: auth.hostelId,
      messId: body.messId || auth.messId,
      date: body.date,
      slotId: body.slotId,
      dishId: body.dishId,
      dishName: body.dishName,
      plannedPortions: body.plannedPortions,
      actualPrepared: body.actualPrepared,
      portionsServed: body.portionsServed,
      chef: body.chef,
      status: body.status,
      createdBy: auth.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: "Production record created successfully.",
      },
      { status: 201 }
    );
  } catch (error) {
    const status = error.status || 500;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create production record.",
        code: error.code || "SERVER_ERROR",
      },
      { status }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, portionsServed, status, chef, hostelId } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Record ID is required for update." },
        { status: 400 }
      );
    }

    const auth = await authorizeKitchenRequest(hostelId);

    const updated = await updateProductionRecord(id, {
      hostelId: auth.hostelId,
      portionsServed,
      status,
      chef,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Production record updated successfully.",
    });
  } catch (error) {
    const status = error.status || 500;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update production record.",
        code: error.code || "SERVER_ERROR",
      },
      { status }
    );
  }
}
