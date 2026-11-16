import "server-only";

import { toObjectId } from "../../../../lib/mongo-ids.js";
import { getIndiaServiceDate } from "../../../../lib/india-service-date.js";
import { getMongoDb } from "../../../../lib/mongodb.js";
import {
  requireActiveRoles,
  AuthorizationError,
} from "../../../../lib/auth-authorization.js";
import {
  USER_ROLE,
  MESS_COLLECTION,
} from "../../../../lib/auth-contracts.js";
import {
  MEAL_TYPES,
  isAllowedValue,
} from "../../../../lib/domain-contracts.js";
import { getDemandData } from "../../../../features/kitchen/services/kitchen-db_akk.js";

export const runtime = "nodejs";

function successResponse(data, message = "Request successful.", status = 200) {
  return Response.json({ success: true, data, message }, { status });
}

function errorResponse(message, code, status) {
  return Response.json(
    {
      success: false,
      error: { code, message },
    },
    { status }
  );
}

function handleError(error) {
  if (error instanceof AuthorizationError) {
    return errorResponse(error.message, error.code, error.status);
  }

  if (error instanceof TypeError) {
    return errorResponse(error.message, "INVALID_INPUT", 400);
  }

  console.error("Queue Demand API error:", error);
  return errorResponse(
    "An unexpected server error occurred.",
    "INTERNAL_SERVER_ERROR",
    500
  );
}

const VALID_SLOTS = ["breakfast", "lunch", "snacks", "dinner"];

export async function GET(request) {
  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
      USER_ROLE.STUDENT,
    ]);

    const { searchParams } = new URL(request.url);
    const messId = searchParams.get("messId");

    if (!messId) {
      return errorResponse("messId is required.", "MISSING_REQUIRED_FIELDS", 400);
    }

    const messObjectId = toObjectId(messId, "messId");
    const rawMealType = searchParams.get("mealType");
    const rawSlotId = searchParams.get("slotId");

    let slotId = "lunch";
    if (rawMealType) {
      if (isAllowedValue(rawMealType.toUpperCase(), MEAL_TYPES)) {
        slotId = rawMealType.toLowerCase();
      } else {
        return errorResponse("Invalid meal type.", "INVALID_MEAL_TYPE", 400);
      }
    } else if (rawSlotId) {
      if (VALID_SLOTS.includes(rawSlotId.toLowerCase())) {
        slotId = rawSlotId.toLowerCase();
      } else {
        return errorResponse("Invalid slot ID.", "INVALID_SLOT_ID", 400);
      }
    }

    const requestedDate = searchParams.get("date");
    const serviceDate = requestedDate || getIndiaServiceDate(new Date());

    const db = await getMongoDb();
    const mess = await db.collection(MESS_COLLECTION).findOne({
      _id: messObjectId,
      status: "ACTIVE",
    });

    if (!mess) {
      return errorResponse("Active mess not found.", "MESS_NOT_FOUND", 404);
    }

    // Enforce tenant isolation for non-Super-Admins
    if (user.role !== USER_ROLE.SUPER_ADMIN) {
      if (!user.hostelId) {
        throw new AuthorizationError(
          "Hostel assignment is required to view demand.",
          403,
          "HOSTEL_REQUIRED"
        );
      }

      const userHostelId = toObjectId(user.hostelId, "hostelId");
      if (!mess.hostelId.equals(userHostelId)) {
        throw new AuthorizationError(
          "You cannot access demand data outside your assigned hostel.",
          403,
          "HOSTEL_SCOPE_REQUIRED"
        );
      }
    }

    const demand = await getDemandData({
      hostelId: mess.hostelId.toString(),
      messId: mess._id.toString(),
      date: serviceDate,
      slotId,
    });

    return successResponse(
      {
        hostelId: mess.hostelId.toString(),
        messId: mess._id.toString(),
        date: serviceDate,
        slotId,
        slotLabel: demand.slotLabel ?? `${slotId.toUpperCase()} Slot`,
        totalStudentIntent: demand.totalStudentIntent ?? 0,
        recommendedTarget: demand.recommendedTarget ?? 0,
        bufferPct: demand.bufferPct ?? 8,
        source: demand.source ?? "BASELINE",
        dishBreakdown: demand.dishBreakdown ?? [],
        hourlyFlow: demand.hourlyFlow ?? [],
      },
      "Demand data retrieved successfully."
    );
  } catch (error) {
    return handleError(error);
  }
}
