import { toObjectId } from "../../../lib/mongo-ids.js";

import "server-only";

import { ObjectId } from "mongodb";

import {
  getMongoDb,
  getMongoClient,
} from "../../../lib/mongodb.js";

import {
  requireActiveRoles,
  AuthorizationError,
} from "../../../lib/auth-authorization.js";

import {
  USER_ROLE,
  HOSTEL_COLLECTION,
  MESS_COLLECTION,
} from "../../../lib/auth-contracts.js";

import {
  COUNTER_COLLECTION,
} from "../../../lib/domain-contracts.js";

export const runtime = "nodejs";

// --------------------------------------------------
// RESPONSE HELPERS
// --------------------------------------------------

function successResponse(data, message = "Request successful.", status = 200) {
  return Response.json(
    { success: true, data, message },
    { status }
  );
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

  if (error?.code === 11000) {
    return errorResponse(
      "A counter with this code already exists in the selected mess.",
      "DUPLICATE_COUNTER_CODE",
      409
    );
  }

  console.error("Counter API error:", error);

  return errorResponse(
    "An unexpected server error occurred.",
    "INTERNAL_SERVER_ERROR",
    500
  );
}

// --------------------------------------------------
// COUNTER FORMATTER
// --------------------------------------------------

function formatCounter(counter) {
  return {
    id: counter._id.toString(),
    hostelId: counter.hostelId.toString(),
    messId: counter.messId.toString(),
    name: counter.name,
    code: counter.code,
    defaultServingRatePerMinute:
      counter.defaultServingRatePerMinute,
    status: counter.status,
    createdAt: counter.createdAt,
    updatedAt: counter.updatedAt,
  };
}

// --------------------------------------------------
// GET /api/counters
// --------------------------------------------------

export async function GET(request) {
  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
      USER_ROLE.STUDENT,
    ]);

    const { searchParams } = new URL(request.url);

    const messId = searchParams.get("messId");
    const status = searchParams.get("status");

    // Validate query parameters before database access.
    let messObjectId;

    if (messId) {
      messObjectId = toObjectId(messId, "messId");
    }

    if (
      status &&
      user.role !== USER_ROLE.STUDENT &&
      !["ACTIVE", "INACTIVE"].includes(status)
    ) {
      return errorResponse(
        "Status must be ACTIVE or INACTIVE.",
        "INVALID_STATUS",
        400
      );
    }

    const db = await getMongoDb();
    const filter = {};

    if (user.role !== USER_ROLE.SUPER_ADMIN) {
      filter.hostelId = toObjectId(user.hostelId, "hostelId");
    }

    if (messObjectId) {
      filter.messId = messObjectId;
    }

    if (user.role === USER_ROLE.STUDENT) {
      filter.status = "ACTIVE";

      // Students must only see counters under an active hostel.
      const hostel = await db
        .collection(HOSTEL_COLLECTION)
        .findOne({
          _id: filter.hostelId,
          status: "ACTIVE",
        });

      if (!hostel) {
        return successResponse(
          [],
          "No active counters are available."
        );
      }

      // Find active messes belonging to the student's hostel.
      const activeMesses = await db
        .collection(MESS_COLLECTION)
        .find({
          hostelId: filter.hostelId,
          status: "ACTIVE",
        })
        .project({ _id: 1 })
        .toArray();

      const activeMessIds = activeMesses.map((mess) => mess._id);

      if (activeMessIds.length === 0) {
        return successResponse(
          [],
          "No active counters are available."
        );
      }

      filter.messId = {
        $in: activeMessIds,
      };

      // A supplied messId must also belong to the active mess list.
      if (
        messObjectId &&
        !activeMessIds.some((id) => id.equals(messObjectId))
      ) {
        return successResponse(
          [],
          "No active counters are available."
        );
      }
    }

    if (status && user.role !== USER_ROLE.STUDENT) {
      filter.status = status;
    }

    const counters = await db
      .collection(COUNTER_COLLECTION)
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return successResponse(
      counters.map(formatCounter),
      "Counters retrieved successfully."
    );
  } catch (error) {
    return handleError(error);
  }
}

// --------------------------------------------------
// POST /api/counters
// Create a counter under an active mess
// --------------------------------------------------

export async function POST(request) {
  let session;

  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
    ]);

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse(
        "Request body must contain valid JSON.",
        "INVALID_JSON",
        400
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse(
        "Request body must be a valid JSON object.",
        "INVALID_BODY",
        400
      );
    }

    const {
      messId,
      name,
      code,
      defaultServingRatePerMinute,
    } = body;

    if (
      !messId ||
      !name ||
      !code ||
      defaultServingRatePerMinute === undefined
    ) {
      return errorResponse(
        "messId, name, code and defaultServingRatePerMinute are required.",
        "MISSING_REQUIRED_FIELDS",
        400
      );
    }

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 80
    ) {
      return errorResponse(
        "Counter name must contain 1 to 80 characters.",
        "INVALID_COUNTER_NAME",
        400
      );
    }

    if (
      typeof code !== "string" ||
      !code.trim() ||
      code.trim().length > 30
    ) {
      return errorResponse(
        "Counter code must contain 1 to 30 characters.",
        "INVALID_COUNTER_CODE",
        400
      );
    }

    if (
      typeof defaultServingRatePerMinute !== "number" ||
      !Number.isFinite(defaultServingRatePerMinute) ||
      defaultServingRatePerMinute <= 0
    ) {
      return errorResponse(
        "defaultServingRatePerMinute must be a positive number.",
        "INVALID_SERVING_RATE",
        400
      );
    }

    const messObjectId = toObjectId(messId, "messId");

    const db = await getMongoDb();
    const client = await getMongoClient();

    session = client.startSession();

    let createdCounter;

    await session.withTransaction(async () => {
      // Read and validate the parent mess inside the transaction.
      const mess = await db
        .collection(MESS_COLLECTION)
        .findOne(
          {
            _id: messObjectId,
            status: "ACTIVE",
          },
          { session }
        );

      if (!mess) {
        const error = new Error("Active mess not found.");
        error.status = 404;
        error.code = "MESS_NOT_FOUND";
        throw error;
      }

      if (
  !mess.hostelId ||
  typeof mess.hostelId.toHexString !== "function"
) {
  throw new TypeError("Mess has an invalid hostel reference.");
}

      const hostelId = mess.hostelId;

      if (user.role === USER_ROLE.MESS_ADMIN) {
        const assignedHostelId = toObjectId(
          user.hostelId,
          "hostelId"
        );

        if (!assignedHostelId.equals(hostelId)) {
          throw new AuthorizationError(
            "You cannot create counters outside your assigned hostel.",
            403,
            "HOSTEL_SCOPE_REQUIRED"
          );
        }
      }

      // Validate the parent hostel inside the transaction.
      const hostel = await db
        .collection(HOSTEL_COLLECTION)
        .findOne(
          {
            _id: hostelId,
            status: "ACTIVE",
          },
          { session }
        );

      if (!hostel) {
        const error = new Error(
          "The selected hostel is inactive or unavailable."
        );
        error.status = 409;
        error.code = "HOSTEL_INACTIVE";
        throw error;
      }

      const now = new Date();

      createdCounter = {
        _id: new ObjectId(),
        hostelId,
        messId: messObjectId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        defaultServingRatePerMinute,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      };

      await db
        .collection(COUNTER_COLLECTION)
        .insertOne(createdCounter, { session });
    });

    return successResponse(
      formatCounter(createdCounter),
      "Counter created successfully.",
      201
    );
  } catch (error) {
    if (error?.status && error?.code) {
      return errorResponse(
        error.message,
        error.code,
        error.status
      );
    }

    return handleError(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}