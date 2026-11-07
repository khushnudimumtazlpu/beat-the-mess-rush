
import { toObjectId } from "../../../../../lib/mongo-ids.js";

import "server-only";

import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";

import {
  getMongoDb,
  getMongoClient,
} from "../../../../../lib/mongodb.js";

import {
  requireActiveRoles,
  AuthorizationError,
} from "../../../../../lib/auth-authorization.js";

import {
  USER_ROLE,
  HOSTEL_COLLECTION,
  MESS_COLLECTION,
} from "../../../../../lib/auth-contracts.js";

import {
  COUNTER_COLLECTION,
  QUEUE_COLLECTION,
  QUEUE_HISTORY_COLLECTION,
} from "../../../../../lib/domain-contracts.js";

import { calculateQueueMetrics } from "../../../../../features/queue/lib/queue-calculations.js";

export const runtime = "nodejs";

// --------------------------------------------------
// RESPONSE HELPERS
// --------------------------------------------------

function successResponse(data, message, status = 200) {
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

  if (error.status && error.code) {
    return errorResponse(error.message, error.code, error.status);
  }

  if (error?.code === 11000) {
    return errorResponse(
      "A queue already exists for this counter and meal type.",
      "DUPLICATE_QUEUE",
      409
    );
  }

  console.error("Queue Session API error:", error);

  return errorResponse(
    "An unexpected server error occurred.",
    "INTERNAL_SERVER_ERROR",
    500
  );
}

// --------------------------------------------------
// QUEUE FORMATTER
// --------------------------------------------------

function formatQueue(queue, metrics) {
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
// POST /api/queues/[id]/sessions
// Start a new service session for a closed queue
// --------------------------------------------------

export async function POST(request, { params }) {
  let session;

  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
    ]);

    const { id } = await params;
    const queueId = toObjectId(id, "queueId");

    // Validate optional request body.
    // An empty body is allowed and uses the counter's default rate.
    let body = {};
    const rawBody = await request.text();

    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return errorResponse(
          "Request body must contain valid JSON.",
          "INVALID_JSON",
          400
        );
      }
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse(
        "Request body must be a valid JSON object.",
        "INVALID_BODY",
        400
      );
    }

    const suppliedFields = Object.keys(body);

    if (
      suppliedFields.some(
        (field) => field !== "servingRatePerMinute"
      )
    ) {
      return errorResponse(
        "Only servingRatePerMinute can be supplied.",
        "INVALID_UPDATE_FIELDS",
        400
      );
    }

    if (
      body.servingRatePerMinute !== undefined &&
      (
        typeof body.servingRatePerMinute !== "number" ||
        !Number.isFinite(body.servingRatePerMinute) ||
        body.servingRatePerMinute <= 0
      )
    ) {
      return errorResponse(
        "servingRatePerMinute must be a positive number.",
        "INVALID_SERVING_RATE",
        400
      );
    }

    const db = await getMongoDb();
    const client = await getMongoClient();

    session = client.startSession();

    let newQueue;
    let newMetrics;

    await session.withTransaction(async () => {
      // Find the existing queue.
      const queue = await db
        .collection(QUEUE_COLLECTION)
        .findOne(
          { _id: queueId },
          { session }
        );

      if (!queue) {
        throw Object.assign(new Error("Queue not found."), {
          status: 404,
          code: "QUEUE_NOT_FOUND",
        });
      }

      // Enforce Mess Admin hostel scope.
      if (user.role === USER_ROLE.MESS_ADMIN) {
        const assignedHostelId = toObjectId(
          user.hostelId,
          "hostelId"
        );

        if (!queue.hostelId.equals(assignedHostelId)) {
          throw new AuthorizationError(
            "You cannot manage queues outside your assigned hostel.",
            403,
            "HOSTEL_SCOPE_REQUIRED"
          );
        }
      }

      // Only closed queues can start a new session.
      if (queue.isOpen === true) {
        throw Object.assign(
          new Error("This queue is already open."),
          {
            status: 409,
            code: "QUEUE_ALREADY_OPEN",
          }
        );
      }

      // Confirm that the counter is still active.
      const counter = await db
        .collection(COUNTER_COLLECTION)
        .findOne(
          {
            _id: queue.counterId,
            hostelId: queue.hostelId,
            messId: queue.messId,
            status: "ACTIVE",
          },
          { session }
        );

      if (!counter) {
        throw Object.assign(
          new Error("The counter is inactive or unavailable."),
          {
            status: 409,
            code: "COUNTER_INACTIVE",
          }
        );
      }

      // Confirm that the parent hostel is active.
      // Keep database operations sequential inside the transaction.
      const hostel = await db
        .collection(HOSTEL_COLLECTION)
        .findOne(
          {
            _id: queue.hostelId,
            status: "ACTIVE",
          },
          { session }
        );

      // Confirm that the parent mess is active.
      const mess = await db
        .collection(MESS_COLLECTION)
        .findOne(
          {
            _id: queue.messId,
            hostelId: queue.hostelId,
            status: "ACTIVE",
          },
          { session }
        );

      if (!hostel || !mess) {
        throw Object.assign(
          new Error("The hostel or mess is inactive or unavailable."),
          {
            status: 409,
            code: "PARENT_ENTITY_INACTIVE",
          }
        );
      }

      const effectiveServingRate =
        body.servingRatePerMinute ??
        counter.defaultServingRatePerMinute;

      if (
        typeof effectiveServingRate !== "number" ||
        !Number.isFinite(effectiveServingRate) ||
        effectiveServingRate <= 0
      ) {
        throw new TypeError(
          "The counter must have a valid default serving rate."
        );
      }

      const now = new Date();
      const newSessionId = randomUUID();

      // Reuse the queue document, but start a fresh session.
      const newQueueData = {
        peopleWaiting: 0,
        servingRatePerMinute: effectiveServingRate,
        isOpen: true,
        sessionId: newSessionId,
        serviceDate: now.toISOString().slice(0, 10),
        updatedAt: now,
      };

      const metrics = calculateQueueMetrics(newQueueData);

      const updatedFields = {
        ...newQueueData,
        estimatedWaitMinutes: metrics.estimatedWaitMinutes,
        crowdLevel: metrics.crowdLevel,
        status: metrics.status,
      };

      // Guard against concurrent session creation.
      const updateResult = await db
        .collection(QUEUE_COLLECTION)
        .updateOne(
          {
            _id: queueId,
            isOpen: false,
            sessionId: queue.sessionId,
          },
          {
            $set: updatedFields,
          },
          { session }
        );

      if (updateResult.matchedCount !== 1) {
        throw Object.assign(
          new Error("Queue changed during session creation. Please retry."),
          {
            status: 409,
            code: "SESSION_CREATION_CONFLICT",
          }
        );
      }

      newQueue = {
        ...queue,
        ...updatedFields,
      };

      newMetrics = metrics;

      // Record the beginning of the new session.
      const historyRecord = {
        _id: new ObjectId(),
        queueId: queue._id,
        hostelId: queue.hostelId,
        messId: queue.messId,
        counterId: queue.counterId,
        mealType: queue.mealType,
        sessionId: newSessionId,
        peopleWaiting: 0,
        servingRatePerMinute: effectiveServingRate,
        estimatedWaitMinutes: metrics.estimatedWaitMinutes,
        crowdLevel: metrics.crowdLevel,
        status: metrics.status,
        isOpen: true,
        recordedAt: now,
        updatedBy: user.id,
      };

      await db
        .collection(QUEUE_HISTORY_COLLECTION)
        .insertOne(historyRecord, { session });
    });

    return successResponse(
      formatQueue(newQueue, newMetrics),
      "New queue service session started successfully.",
      201
    );

  } catch (error) {
    return handleError(error);

  } finally {
    if (session) {
      await session.endSession();
    }
  }
}
