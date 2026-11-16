import "server-only";

import { toObjectId } from "../../../../lib/mongo-ids.js";
import { getMongoDb } from "../../../../lib/mongodb.js";
import {
  requireActiveRoles,
  AuthorizationError,
} from "../../../../lib/auth-authorization.js";
import {
  USER_ROLE,
  HOSTEL_COLLECTION,
  MESS_COLLECTION,
} from "../../../../lib/auth-contracts.js";

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

  console.error("Queue Messes API error:", error);
  return errorResponse(
    "An unexpected server error occurred.",
    "INTERNAL_SERVER_ERROR",
    500
  );
}

function formatMess(mess) {
  return {
    id: mess._id.toString(),
    hostelId: mess.hostelId.toString(),
    name: mess.name,
    code: mess.code,
    description: mess.description ?? "",
    mealTypes: mess.mealTypes ?? [],
    status: mess.status,
    createdAt: mess.createdAt,
    updatedAt: mess.updatedAt,
  };
}

export async function GET(request) {
  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
      USER_ROLE.STUDENT,
    ]);

    const { searchParams } = new URL(request.url);
    const filter = {};
    const db = await getMongoDb();

    if (user.role === USER_ROLE.SUPER_ADMIN) {
      const hostelIdParam = searchParams.get("hostelId");
      if (hostelIdParam) {
        filter.hostelId = toObjectId(hostelIdParam, "hostelId");
      }
    } else {
      if (!user.hostelId) {
        return successResponse([], "No assigned hostel found.");
      }

      const userHostelId = toObjectId(user.hostelId, "hostelId");

      // Verify that the user's assigned hostel is active
      const hostel = await db
        .collection(HOSTEL_COLLECTION)
        .findOne({ _id: userHostelId, status: "ACTIVE" });

      if (!hostel) {
        return successResponse([], "Assigned hostel is inactive or unavailable.");
      }

      filter.hostelId = userHostelId;
    }

    const requestedStatus = searchParams.get("status");
    if (requestedStatus) {
      if (!["ACTIVE", "INACTIVE"].includes(requestedStatus)) {
        return errorResponse("Status must be ACTIVE or INACTIVE.", "INVALID_STATUS", 400);
      }
      filter.status = requestedStatus;
    } else {
      // Default to active messes for operational safety
      filter.status = "ACTIVE";
    }

    const messes = await db
      .collection(MESS_COLLECTION)
      .find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .toArray();

    return successResponse(
      messes.map(formatMess),
      "Messes retrieved successfully."
    );
  } catch (error) {
    return handleError(error);
  }
}
