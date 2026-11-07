
import { toObjectId } from "../../../lib/mongo-ids.js";

import "server-only";

import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";

import { getMongoDb, getMongoClient } from "../../../lib/mongodb.js";
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
  QUEUE_COLLECTION,
  QUEUE_HISTORY_COLLECTION,
  MEAL_TYPES,
  QUEUE_STATUSES,
  isAllowedValue,
} from "../../../lib/domain-contracts.js";

import { calculateQueueMetrics } from "../../../features/queue/lib/queue-calculations.js";

export const runtime = "nodejs";

// --------------------------------------------------
// COMMON RESPONSE HELPERS
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
  // Support both AuthorizationError instances and errors
  // carrying a valid HTTP status and error code.
  if (
    error instanceof AuthorizationError ||
    (
      Number.isInteger(error?.status) &&
      error.status >= 400 &&
      error.status <= 599 &&
      typeof error?.code === "string"
    )
  ) {
    return errorResponse(
      error.message,
      error.code,
      error.status
    );
  }

  if (error instanceof TypeError) {
    return errorResponse(
      error.message,
      "INVALID_INPUT",
      400
    );
  }

  if (error?.code === 11000) {
    return errorResponse(
      "A queue already exists for this counter and meal type.",
      "DUPLICATE_QUEUE",
      409
    );
  }

  console.error("Queue API error:", error);

  return errorResponse(
    "An unexpected server error occurred.",
    "INTERNAL_SERVER_ERROR",
    500
  );
}

// --------------------------------------------------
// QUEUE RESPONSE FORMATTER
// --------------------------------------------------

function formatQueue(queue) {
  const metrics = calculateQueueMetrics({
    peopleWaiting: queue.peopleWaiting,
    servingRatePerMinute: queue.servingRatePerMinute,
    isOpen: queue.isOpen,
  });

  return {
    id: queue._id.toString(),
    hostelId: queue.hostelId.toString(),
    messId: queue.messId.toString(),
    counterId: queue.counterId.toString(),
    mealType: queue.mealType,
    peopleWaiting: metrics.peopleWaiting,
    servingRatePerMinute: queue.servingRatePerMinute,
    estimatedWaitMinutes: metrics.estimatedWaitMinutes,
    crowdLevel: metrics.crowdLevel,
    status: metrics.status,
    isOpen: metrics.isOpen,
    sessionId: queue.sessionId,
    serviceDate: queue.serviceDate,
    createdAt: queue.createdAt,
    updatedAt: queue.updatedAt,
  };
}

// --------------------------------------------------
// GET /api/queues
// Retrieve queues based on authenticated user role
// --------------------------------------------------

export async function GET(request) {
  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
      USER_ROLE.STUDENT,
    ]);

    // Validate all query parameters BEFORE connecting to MongoDB.
    const { searchParams } = new URL(request.url);

    const filter = {};

    // Super Admin can view all hostels.
    // Students and Mess Admins are restricted to their hostel.
    if (user.role !== USER_ROLE.SUPER_ADMIN) {
      filter.hostelId = toObjectId(user.hostelId, "hostelId");
    }

    const messId = searchParams.get("messId");
    const counterId = searchParams.get("counterId");
    const mealType = searchParams.get("mealType");
    const status = searchParams.get("status");

    if (messId) {
      filter.messId = toObjectId(messId, "messId");
    }

    if (counterId) {
      filter.counterId = toObjectId(counterId, "counterId");
    }

    if (mealType) {
      if (!isAllowedValue(mealType, MEAL_TYPES)) {
        return errorResponse(
          "Invalid meal type.",
          "INVALID_MEAL_TYPE",
          400
        );
      }

      filter.mealType = mealType;
    }

    // Validate status and apply it directly in the MongoDB query.
    if (status) {
      if (!isAllowedValue(status, QUEUE_STATUSES)) {
        return errorResponse(
          "Invalid queue status.",
          "INVALID_QUEUE_STATUS",
          400
        );
      }

      filter.status = status;
    }

    // Connect to MongoDB only after input validation succeeds.
    const db = await getMongoDb();

    const queues = await db
      .collection(QUEUE_COLLECTION)
      .find(filter)
      .sort({ updatedAt: -1 })
      .toArray();

    const formattedQueues = queues.map(formatQueue);

    return successResponse(
      formattedQueues,
      "Queues retrieved successfully."
    );
  } catch (error) {
    return handleError(error);
  }
}

// --------------------------------------------------
// POST /api/queues
// Initialize a queue for an active counter
// --------------------------------------------------

export async function POST(request) {
  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
    ]);

    // Validate JSON body.
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

    const { counterId, mealType, servingRatePerMinute } = body;

    if (!counterId || !mealType) {
      return errorResponse(
        "counterId and mealType are required.",
        "MISSING_REQUIRED_FIELDS",
        400
      );
    }

    if (!isAllowedValue(mealType, MEAL_TYPES)) {
      return errorResponse(
        "Invalid meal type.",
        "INVALID_MEAL_TYPE",
        400
      );
    }

    if (
      servingRatePerMinute !== undefined &&
      (
        typeof servingRatePerMinute !== "number" ||
        !Number.isFinite(servingRatePerMinute) ||
        servingRatePerMinute <= 0
      )
    ) {
      return errorResponse(
        "Serving rate must be a positive number.",
        "INVALID_SERVING_RATE",
        400
      );
    }

    const counterObjectId = toObjectId(counterId, "counterId");
    const db = await getMongoDb();

    // Find the counter.
    const counter = await db
      .collection(COUNTER_COLLECTION)
      .findOne({ _id: counterObjectId });

    if (!counter) {
      return errorResponse(
        "Counter not found.",
        "COUNTER_NOT_FOUND",
        404
      );
    }

    if (counter.status !== "ACTIVE") {
      return errorResponse(
        "Cannot create a queue for an inactive counter.",
        "COUNTER_INACTIVE",
        409
      );
    }

    // Derive hostel and mess IDs from the database.
    const hostelId = counter.hostelId;
    const messId = counter.messId;

    if (
      !(hostelId instanceof ObjectId) ||
      !(messId instanceof ObjectId)
    ) {
      throw new TypeError(
        "Counter has invalid hostel or mess references."
      );
    }

    // Enforce Mess Admin hostel scope.
    if (user.role === USER_ROLE.MESS_ADMIN) {
      const assignedHostelId = toObjectId(user.hostelId, "hostelId");

      if (!assignedHostelId.equals(hostelId)) {
        throw new AuthorizationError(
          "You cannot manage queues outside your assigned hostel.",
          403,
          "HOSTEL_SCOPE_REQUIRED"
        );
      }
    }

    // Verify that the parent hostel and mess are active.
    const [hostel, mess] = await Promise.all([
      db.collection(HOSTEL_COLLECTION).findOne({
        _id: hostelId,
        status: "ACTIVE",
      }),
      db.collection(MESS_COLLECTION).findOne({
        _id: messId,
        hostelId,
        status: "ACTIVE",
      }),
    ]);

    if (!hostel || !mess) {
      return errorResponse(
        "The counter's hostel or mess is inactive or unavailable.",
        "PARENT_ENTITY_INACTIVE",
        409
      );
    }

    // Use the supplied rate or the counter's default rate.
    const effectiveServingRate =
      servingRatePerMinute ??
      counter.defaultServingRatePerMinute;

    if (
      typeof effectiveServingRate !== "number" ||
      !Number.isFinite(effectiveServingRate) ||
      effectiveServingRate <= 0
    ) {
      return errorResponse(
        "The counter must have a valid default serving rate.",
        "INVALID_COUNTER_SERVING_RATE",
        409
      );
    }

    // Create initial queue.
    const now = new Date();
    const queueId = new ObjectId();
    const sessionId = randomUUID();

    const queue = {
      _id: queueId,
      hostelId,
      messId,
      counterId: counterObjectId,
      mealType,
      peopleWaiting: 0,
      servingRatePerMinute: effectiveServingRate,
      isOpen: true,
      sessionId,
      serviceDate: now.toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now,
    };

    // Calculate and persist queue metrics.
    const metrics = calculateQueueMetrics(queue);
    Object.assign(queue, metrics);

    // Create initial history record.
    const historyRecord = {
      _id: new ObjectId(),
      queueId,
      hostelId,
      messId,
      counterId: counterObjectId,
      mealType,
      sessionId,
      peopleWaiting: metrics.peopleWaiting,
      servingRatePerMinute: effectiveServingRate,
      estimatedWaitMinutes: metrics.estimatedWaitMinutes,
      crowdLevel: metrics.crowdLevel,
      status: metrics.status,
      isOpen: metrics.isOpen,
      recordedAt: now,
      updatedBy: user.id,
    };

    // Insert queue and history atomically.
    const client = await getMongoClient();
    const session = client.startSession();

    try {
      await session.withTransaction(async () => {
        await db.collection(QUEUE_COLLECTION).insertOne(queue, {
          session,
        });

        await db.collection(QUEUE_HISTORY_COLLECTION).insertOne(
          historyRecord,
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    return successResponse(
      formatQueue(queue),
      "Queue initialized successfully.",
      201
    );
  } catch (error) {
    return handleError(error);
  }
}
