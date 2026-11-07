
import { toObjectId } from "../../../lib/mongo-ids.js";
import { getIndiaServiceDate } from "../../../lib/india-service-date.js";
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
// QUEUE MUTATION VERSION GUARD
// --------------------------------------------------

async function bumpQueueMutationVersion({
  collection,
  filter,
  session,
  entityName,
}) {
  const result = await collection.updateOne(
    filter,
    {
      $inc: { queueMutationVersion: 1 },
    },
    { session }
  );

  if (result.matchedCount !== 1) {
    const error = new Error(
      `${entityName} is inactive, missing, or could not be updated.`
    );

    error.status = 409;
    error.code = "PARENT_ENTITY_INACTIVE";

    throw error;
  }
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
// --------------------------------------------------

export async function GET(request) {
  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
      USER_ROLE.STUDENT,
    ]);

    const { searchParams } = new URL(request.url);
    const filter = {};

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

    const db = await getMongoDb();

    if (user.role === USER_ROLE.STUDENT) {
      // Students may only see queues under their active Hostel, active Messes,
      // and active Counters. Closed queues are never student-visible.
      const hostel = await db
        .collection(HOSTEL_COLLECTION)
        .findOne({
          _id: filter.hostelId,
          status: "ACTIVE",
        });

      if (!hostel) {
        return successResponse(
          [],
          "No active queues are available."
        );
      }

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
          "No active queues are available."
        );
      }

      if (
        messId &&
        !activeMessIds.some((id) => id.equals(filter.messId))
      ) {
        return successResponse(
          [],
          "No active queues are available."
        );
      }

      const visibleMessIds = messId ? [filter.messId] : activeMessIds;

      const activeCounterFilter = {
        hostelId: filter.hostelId,
        messId: { $in: visibleMessIds },
        status: "ACTIVE",
      };

      if (counterId) {
        activeCounterFilter._id = filter.counterId;
      }

      const activeCounters = await db
        .collection(COUNTER_COLLECTION)
        .find(activeCounterFilter)
        .project({ _id: 1 })
        .toArray();

      const activeCounterIds = activeCounters.map(
        (counter) => counter._id
      );

      if (activeCounterIds.length === 0) {
        return successResponse(
          [],
          "No active queues are available."
        );
      }

      filter.messId = { $in: visibleMessIds };
      filter.counterId = { $in: activeCounterIds };
      filter.isOpen = true;
    }

    const queues = await db
      .collection(QUEUE_COLLECTION)
      .find(filter)
      .sort({ updatedAt: -1 })
      .toArray();

    return successResponse(
      queues.map(formatQueue),
      "Queues retrieved successfully."
    );
  } catch (error) {
    return handleError(error);
  }
}

// --------------------------------------------------
// POST /api/queues
// --------------------------------------------------

export async function POST(request) {
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
      serviceDate: getIndiaServiceDate(now),
      createdAt: now,
      updatedAt: now,
    };

    const metrics = calculateQueueMetrics(queue);
    Object.assign(queue, metrics);

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

    const client = await getMongoClient();
    const session = client.startSession();

    try {
      await session.withTransaction(async () => {
        // Protect Counter.
        await bumpQueueMutationVersion({
          collection: db.collection(COUNTER_COLLECTION),
          filter: {
            _id: counterObjectId,
            hostelId,
            messId,
            status: "ACTIVE",
          },
          session,
          entityName: "Counter",
        });

        // Protect Mess.
        await bumpQueueMutationVersion({
          collection: db.collection(MESS_COLLECTION),
          filter: {
            _id: messId,
            hostelId,
            status: "ACTIVE",
          },
          session,
          entityName: "Mess",
        });

        // Protect Hostel.
        await bumpQueueMutationVersion({
          collection: db.collection(HOSTEL_COLLECTION),
          filter: {
            _id: hostelId,
            status: "ACTIVE",
          },
          session,
          entityName: "Hostel",
        });

        // Queue and initial history remain atomic.
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
