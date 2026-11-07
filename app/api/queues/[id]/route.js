
import { toObjectId } from "../../../../lib/mongo-ids.js";

import "server-only";

import { ObjectId } from "mongodb";

import { getMongoDb, getMongoClient } from "../../../../lib/mongodb.js";

import {
  requireActiveRoles,
  AuthorizationError,
} from "../../../../lib/auth-authorization.js";

import {
  USER_ROLE,
  HOSTEL_COLLECTION,
  MESS_COLLECTION,
} from "../../../../lib/auth-contracts.js";

import {
  COUNTER_COLLECTION,
  QUEUE_COLLECTION,
  QUEUE_HISTORY_COLLECTION,
} from "../../../../lib/domain-contracts.js";

import { calculateQueueMetrics } from "../../../../features/queue/lib/queue-calculations.js";

export const runtime = "nodejs";

// --------------------------------------------------
// RESPONSE HELPERS
// --------------------------------------------------

function successResponse(data, message = "Request successful.") {
  return Response.json({
    success: true,
    data,
    message,
  });
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
      "A duplicate queue history record was detected.",
      "DUPLICATE_QUEUE_HISTORY",
      409
    );
  }

  console.error("Queue PATCH API error:", error);

  return errorResponse(
    "An unexpected server error occurred.",
    "INTERNAL_SERVER_ERROR",
    500
  );
}

// --------------------------------------------------
// QUEUE RESPONSE FORMATTER
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
// PATCH /api/queues/[id]
// Update an existing queue
// --------------------------------------------------

export async function PATCH(request, { params }) {
  let session;

  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
    ]);

    // Validate queue ID.
    const { id } = await params;
    const queueId = toObjectId(id, "queueId");

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

    const allowedFields = [
      "peopleWaiting",
      "servingRatePerMinute",
      "isOpen",
    ];

    const suppliedFields = Object.keys(body);

    if (
      suppliedFields.length === 0 ||
      suppliedFields.some((field) => !allowedFields.includes(field))
    ) {
      return errorResponse(
        "Provide at least one supported field: peopleWaiting, servingRatePerMinute, or isOpen.",
        "INVALID_UPDATE_FIELDS",
        400
      );
    }

    // Validate waiting count.
    if (
      body.peopleWaiting !== undefined &&
      (
        !Number.isInteger(body.peopleWaiting) ||
        body.peopleWaiting < 0
      )
    ) {
      return errorResponse(
        "peopleWaiting must be a non-negative integer.",
        "INVALID_WAITING_COUNT",
        400
      );
    }

    // Validate serving rate.
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

    // Validate open/closed state.
    if (
      body.isOpen !== undefined &&
      typeof body.isOpen !== "boolean"
    ) {
      return errorResponse(
        "isOpen must be a boolean.",
        "INVALID_IS_OPEN",
        400
      );
    }

    // Reopening requires a new service session.
    if (body.isOpen === true) {
      return errorResponse(
        "A closed queue cannot be reopened. Start a new service session instead.",
        "NEW_SESSION_REQUIRED",
        409
      );
    }

    const db = await getMongoDb();
    const client = await getMongoClient();

    session = client.startSession();

    let updatedQueue;
    let updatedMetrics;

    await session.withTransaction(async () => {
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

      // Restrict Mess Admin to assigned hostel.
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

      // Only open queues can be updated.
      if (queue.isOpen !== true) {
        throw Object.assign(
          new Error("This queue is already closed. Start a new service session."),
          {
            status: 409,
            code: "QUEUE_ALREADY_CLOSED",
          }
        );
      }

      // Verify that the associated counter is active.
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

      // Verify that the parent hostel is active.
      const hostel = await db
        .collection(HOSTEL_COLLECTION)
        .findOne(
          {
            _id: queue.hostelId,
            status: "ACTIVE",
          },
          { session }
        );

      // Verify that the parent mess is active.
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

      const now = new Date();

      // Build updated queue values.
      const updatedDocument = {
        ...queue,
        ...(body.peopleWaiting !== undefined && {
          peopleWaiting: body.peopleWaiting,
        }),
        ...(body.servingRatePerMinute !== undefined && {
          servingRatePerMinute: body.servingRatePerMinute,
        }),
        ...(body.isOpen !== undefined && {
          isOpen: body.isOpen,
        }),
        updatedAt: now,
      };

      // Calculate all metrics on the server.
      updatedMetrics = calculateQueueMetrics(updatedDocument);

      // Persist calculated metrics.
      const updatedFields = {
        peopleWaiting: updatedMetrics.peopleWaiting,
        servingRatePerMinute: updatedDocument.servingRatePerMinute,
        estimatedWaitMinutes: updatedMetrics.estimatedWaitMinutes,
        crowdLevel: updatedMetrics.crowdLevel,
        status: updatedMetrics.status,
        isOpen: updatedMetrics.isOpen,
        updatedAt: now,
      };

      // Guard against concurrent updates.
      const updateResult = await db
        .collection(QUEUE_COLLECTION)
        .updateOne(
          {
            _id: queueId,
            isOpen: true,
            sessionId: queue.sessionId,
          },
          {
            $set: updatedFields,
          },
          { session }
        );

      if (updateResult.matchedCount !== 1) {
        throw Object.assign(
          new Error("Queue changed during the update. Please retry."),
          {
            status: 409,
            code: "QUEUE_UPDATE_CONFLICT",
          }
        );
      }

      updatedQueue = {
        ...updatedDocument,
        ...updatedFields,
      };

      // Create a history record for every successful update.
      const historyRecord = {
        _id: new ObjectId(),
        queueId: queue._id,
        hostelId: queue.hostelId,
        messId: queue.messId,
        counterId: queue.counterId,
        mealType: queue.mealType,
        sessionId: queue.sessionId,
        peopleWaiting: updatedMetrics.peopleWaiting,
        servingRatePerMinute: updatedDocument.servingRatePerMinute,
        estimatedWaitMinutes: updatedMetrics.estimatedWaitMinutes,
        crowdLevel: updatedMetrics.crowdLevel,
        status: updatedMetrics.status,
        isOpen: updatedMetrics.isOpen,
        recordedAt: now,
        updatedBy: user.id,
      };

      await db
        .collection(QUEUE_HISTORY_COLLECTION)
        .insertOne(historyRecord, { session });
    });

    return successResponse(
      formatQueue(updatedQueue, updatedMetrics),
      "Queue updated successfully."
    );

  } catch (error) {
    return handleError(error);

  } finally {
    if (session) {
      await session.endSession();
    }
  }
}
