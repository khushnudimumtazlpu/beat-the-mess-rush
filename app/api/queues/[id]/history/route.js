import "server-only";

import { toObjectId } from "../../../../../lib/mongo-ids.js";
import { getMongoDb } from "../../../../../lib/mongodb.js";

import {
  requireActiveRoles,
  AuthorizationError,
} from "../../../../../lib/auth-authorization.js";

import { USER_ROLE } from "../../../../../lib/auth-contracts.js";

import {
  QUEUE_COLLECTION,
  QUEUE_HISTORY_COLLECTION,
} from "../../../../../lib/domain-contracts.js";

export const runtime = "nodejs";

const INDIA_TIMEZONE_OFFSET_MINUTES = 330;

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
      error: {
        code,
        message,
      },
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

  console.error("Queue History API error:", error);

  return errorResponse(
    "An unexpected server error occurred.",
    "INTERNAL_SERVER_ERROR",
    500
  );
}

// --------------------------------------------------
// DATE VALIDATION
// --------------------------------------------------

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getIndiaDateStart(year, month, day) {
  // IST is UTC +05:30.
  // Convert India midnight into its corresponding UTC instant.
  return new Date(
    Date.UTC(year, month - 1, day) -
      INDIA_TIMEZONE_OFFSET_MINUTES * 60 * 1000
  );
}

function getNextIndiaDateStart(value) {
  const [year, month, day] = value.split("-").map(Number);

  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));

  return getIndiaDateStart(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate()
  );
}

function parseDate(value, fieldName) {
  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

  const timestampPattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

  if (
    !dateOnlyPattern.test(value) &&
    !timestampPattern.test(value)
  ) {
    throw Object.assign(
      new Error(
        `Invalid '${fieldName}' date. Use YYYY-MM-DD or a valid ISO timestamp.`
      ),
      {
        status: 400,
        code:
          fieldName === "from"
            ? "INVALID_FROM_DATE"
            : "INVALID_TO_DATE",
      }
    );
  }

  const [year, month, day] = value
    .slice(0, 10)
    .split("-")
    .map(Number);

  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw Object.assign(
      new Error(`Invalid '${fieldName}' calendar date.`),
      {
        status: 400,
        code:
          fieldName === "from"
            ? "INVALID_FROM_DATE"
            : "INVALID_TO_DATE",
      }
    );
  }

  if (dateOnlyPattern.test(value)) {
    return getIndiaDateStart(year, month, day);
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw Object.assign(
      new Error(`Invalid '${fieldName}' date.`),
      {
        status: 400,
        code:
          fieldName === "from"
            ? "INVALID_FROM_DATE"
            : "INVALID_TO_DATE",
      }
    );
  }

  return parsedDate;
}

// --------------------------------------------------
// HISTORY FORMATTER
// --------------------------------------------------

function formatHistory(record) {
  return {
    id: record._id.toString(),
    queueId: record.queueId.toString(),
    hostelId: record.hostelId.toString(),
    messId: record.messId.toString(),
    counterId: record.counterId.toString(),
    mealType: record.mealType,
    sessionId: record.sessionId,
    peopleWaiting: record.peopleWaiting,
    servingRatePerMinute: record.servingRatePerMinute,
    estimatedWaitMinutes: record.estimatedWaitMinutes,
    crowdLevel: record.crowdLevel,
    status: record.status,
    isOpen: record.isOpen,
    recordedAt: record.recordedAt,
    updatedBy: record.updatedBy,
  };
}

// --------------------------------------------------
// GET /api/queues/[id]/history
// Retrieve queue history with filtering and pagination
// --------------------------------------------------

export async function GET(request, { params }) {
  try {
    const user = await requireActiveRoles([
      USER_ROLE.SUPER_ADMIN,
      USER_ROLE.MESS_ADMIN,
      USER_ROLE.STUDENT,
    ]);

    const { id } = await params;
    const queueId = toObjectId(id, "queueId");

    const { searchParams } = new URL(request.url);

    // Validate pagination parameters before database access.
    const pageValue = searchParams.get("page") ?? "1";
    const limitValue = searchParams.get("limit") ?? "20";

    if (
      !/^[1-9]\d*$/.test(pageValue) ||
      !/^[1-9]\d*$/.test(limitValue)
    ) {
      return errorResponse(
        "page and limit must be positive integers.",
        "INVALID_PAGINATION",
        400
      );
    }

    const page = Number(pageValue);
    const limit = Number(limitValue);

    if (
      !Number.isSafeInteger(page) ||
      !Number.isSafeInteger(limit) ||
      limit > 100
    ) {
      return errorResponse(
        "Page must be a valid positive integer and limit cannot exceed 100.",
        "INVALID_PAGINATION",
        400
      );
    }

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      return errorResponse(
        "Requested page is too large.",
        "INVALID_PAGINATION",
        400
      );
    }

    // Validate optional date filters before database access.
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let fromDate;
    let toDateStart;
    let toDateExclusive;

    if (from) {
      fromDate = parseDate(from, "from");
    }

    if (to) {
      toDateStart = parseDate(to, "to");

      if (isDateOnly(to)) {
        // Include the complete selected India calendar date.
        // The next day's midnight is an exclusive upper boundary.
        toDateExclusive = getNextIndiaDateStart(to);
      } else {
        toDateExclusive = toDateStart;
      }
    }

    const validationToDate =
      to && isDateOnly(to) ? toDateExclusive : toDateStart;

    if (
      fromDate &&
      validationToDate &&
      fromDate > validationToDate
    ) {
      return errorResponse(
        "'from' date cannot be later than 'to' date.",
        "INVALID_DATE_RANGE",
        400
      );
    }

    // Connect to MongoDB after validating request parameters.
    const db = await getMongoDb();

    // Find the queue first to enforce access restrictions.
    const queue = await db
      .collection(QUEUE_COLLECTION)
      .findOne({ _id: queueId });

    if (!queue) {
      return errorResponse(
        "Queue not found.",
        "QUEUE_NOT_FOUND",
        404
      );
    }

    // Students and Mess Admins can only access their own hostel.
    if (user.role !== USER_ROLE.SUPER_ADMIN) {
      const assignedHostelId = toObjectId(
        user.hostelId,
        "hostelId"
      );

      if (!queue.hostelId.equals(assignedHostelId)) {
        throw new AuthorizationError(
          "You cannot view queue history outside your assigned hostel.",
          403,
          "HOSTEL_SCOPE_REQUIRED"
        );
      }
    }

    // Build history filter.
    const filter = {
      queueId,
      hostelId: queue.hostelId,
    };

    if (fromDate || toDateExclusive) {
      filter.recordedAt = {};

      if (fromDate) {
        filter.recordedAt.$gte = fromDate;
      }

      if (toDateExclusive) {
        if (to && isDateOnly(to)) {
          filter.recordedAt.$lt = toDateExclusive;
        } else {
          filter.recordedAt.$lte = toDateExclusive;
        }
      }
    }

    const historyCollection = db.collection(
      QUEUE_HISTORY_COLLECTION
    );

    // Fetch records and total count.
    const [records, totalRecords] = await Promise.all([
      historyCollection
        .find(filter)
        .sort({ recordedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      historyCollection.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return successResponse(
      {
        queueId: queueId.toString(),
        history: records.map(formatHistory),
        pagination: {
          currentPage: page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1 && totalPages > 0,
        },
      },
      "Queue history retrieved successfully."
    );
  } catch (error) {
    return handleError(error);
  }
}
