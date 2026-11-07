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

function successResponse(data, message = "Request successful.") {
  return Response.json({ success: true, data, message });
}

function errorResponse(message, code, status) {
  return Response.json(
    { success: false, error: { code, message } },
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

  if (
    Number.isInteger(error?.status) &&
    error.status >= 400 &&
    error.status <= 599 &&
    typeof error.code === "string"
  ) {
    return errorResponse(error.message, error.code, error.status);
  }

  console.error("Counter PATCH API error:", error);

  return errorResponse(
    "An unexpected server error occurred.",
    "INTERNAL_SERVER_ERROR",
    500
  );
}

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

export async function PATCH(request, { params }) {
  let session;

  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
    ]);

    const { id } = await params;
    const counterId = toObjectId(id, "counterId");

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
      "name",
      "code",
      "defaultServingRatePerMinute",
      "status",
    ];

    const suppliedFields = Object.keys(body);

    if (
      suppliedFields.length === 0 ||
      suppliedFields.some((field) => !allowedFields.includes(field))
    ) {
      return errorResponse(
        "Provide at least one supported field: name, code, defaultServingRatePerMinute, or status.",
        "INVALID_UPDATE_FIELDS",
        400
      );
    }

    if (
      body.name !== undefined &&
      (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.trim().length > 80
      )
    ) {
      return errorResponse(
        "Counter name must contain 1 to 80 characters.",
        "INVALID_COUNTER_NAME",
        400
      );
    }

    if (
      body.code !== undefined &&
      (
        typeof body.code !== "string" ||
        !body.code.trim() ||
        body.code.trim().length > 30
      )
    ) {
      return errorResponse(
        "Counter code must contain 1 to 30 characters.",
        "INVALID_COUNTER_CODE",
        400
      );
    }

    if (
      body.defaultServingRatePerMinute !== undefined &&
      (
        typeof body.defaultServingRatePerMinute !== "number" ||
        !Number.isFinite(body.defaultServingRatePerMinute) ||
        body.defaultServingRatePerMinute <= 0
      )
    ) {
      return errorResponse(
        "defaultServingRatePerMinute must be a positive number.",
        "INVALID_SERVING_RATE",
        400
      );
    }

    if (
      body.status !== undefined &&
      !["ACTIVE", "INACTIVE"].includes(body.status)
    ) {
      return errorResponse(
        "Status must be ACTIVE or INACTIVE.",
        "INVALID_STATUS",
        400
      );
    }

    const db = await getMongoDb();
    const client = await getMongoClient();

    session = client.startSession();

    let updatedCounter;

    await session.withTransaction(async () => {
      const counter = await db
        .collection(COUNTER_COLLECTION)
        .findOne({ _id: counterId }, { session });

      if (!counter) {
        throw Object.assign(new Error("Counter not found."), {
          status: 404,
          code: "COUNTER_NOT_FOUND",
        });
      }

      if (user.role === USER_ROLE.MESS_ADMIN) {
        const assignedHostelId = toObjectId(
          user.hostelId,
          "hostelId"
        );

        if (!counter.hostelId.equals(assignedHostelId)) {
          throw new AuthorizationError(
            "You cannot manage counters outside your assigned hostel.",
            403,
            "HOSTEL_SCOPE_REQUIRED"
          );
        }
      }

      const isReactivating =
        body.status === "ACTIVE" && counter.status !== "ACTIVE";

      if (isReactivating) {
        // Sequential reads: avoid parallel operations in a transaction.
        const activeHostel = await db
          .collection(HOSTEL_COLLECTION)
          .findOne(
            {
              _id: counter.hostelId,
              status: "ACTIVE",
            },
            {
              session,
              projection: { _id: 1 },
            }
          );

        const activeMess = await db
          .collection(MESS_COLLECTION)
          .findOne(
            {
              _id: counter.messId,
              hostelId: counter.hostelId,
              status: "ACTIVE",
            },
            {
              session,
              projection: { _id: 1 },
            }
          );

        if (!activeHostel || !activeMess) {
          throw Object.assign(
            new Error(
              "Cannot reactivate this counter because its Hostel or Mess is inactive."
            ),
            {
              status: 409,
              code: "PARENT_ENTITY_INACTIVE",
            }
          );
        }
      }

      const now = new Date();
      const updatedFields = { updatedAt: now };

      if (body.name !== undefined) {
        updatedFields.name = body.name.trim();
      }

      if (body.code !== undefined) {
        updatedFields.code = body.code.trim().toUpperCase();
      }

      if (body.defaultServingRatePerMinute !== undefined) {
        updatedFields.defaultServingRatePerMinute =
          body.defaultServingRatePerMinute;
      }

      if (body.status !== undefined) {
        updatedFields.status = body.status;
      }

      // Increment the mutation version whenever Counter status changes.
      const counterUpdate = {
        $set: updatedFields,
      };

      const statusChanged =
        body.status !== undefined && body.status !== counter.status;

      if (statusChanged) {
        counterUpdate.$inc = {
          queueMutationVersion: 1,
        };
      }

      await db.collection(COUNTER_COLLECTION).updateOne(
        { _id: counterId },
        counterUpdate,
        { session }
      );

      updatedCounter = { ...counter, ...updatedFields };

      // Deactivating a counter closes its active queues and records history.
      if (
        body.status === "INACTIVE" &&
        counter.status !== "INACTIVE"
      ) {
        const activeQueues = await db
          .collection(QUEUE_COLLECTION)
          .find(
            { counterId, isOpen: true },
            { session }
          )
          .toArray();

        for (const queue of activeQueues) {
          const metrics = calculateQueueMetrics({
            ...queue,
            isOpen: false,
          });

          const updateResult = await db
            .collection(QUEUE_COLLECTION)
            .updateOne(
              {
                _id: queue._id,
                isOpen: true,
                sessionId: queue.sessionId,
              },
              {
                $set: {
                  isOpen: false,
                  estimatedWaitMinutes:
                    metrics.estimatedWaitMinutes,
                  crowdLevel: metrics.crowdLevel,
                  status: metrics.status,
                  updatedAt: now,
                },
              },
              { session }
            );

          if (updateResult.modifiedCount === 0) {
            continue;
          }

          await db.collection(QUEUE_HISTORY_COLLECTION).insertOne(
            {
              _id: new ObjectId(),
              queueId: queue._id,
              hostelId: queue.hostelId,
              messId: queue.messId,
              counterId: queue.counterId,
              mealType: queue.mealType,
              sessionId: queue.sessionId,
              peopleWaiting: queue.peopleWaiting,
              servingRatePerMinute:
                queue.servingRatePerMinute,
              estimatedWaitMinutes:
                metrics.estimatedWaitMinutes,
              crowdLevel: metrics.crowdLevel,
              status: metrics.status,
              isOpen: false,
              recordedAt: now,
              updatedBy: user.id,
            },
            { session }
          );
        }
      }
    });

    return successResponse(
      formatCounter(updatedCounter),
      "Counter updated successfully."
    );
  } catch (error) {
    return handleError(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}