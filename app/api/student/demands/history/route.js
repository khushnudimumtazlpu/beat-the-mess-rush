import "server-only";

import { ObjectId } from "mongodb";

import { HOSTEL_COLLECTION, MESS_COLLECTION, USER_ROLE } from "../../../../../lib/auth-contracts.js";
import { AuthorizationError, requireActiveRole } from "../../../../../lib/auth-authorization.js";
import { getMongoDb } from "../../../../../lib/mongodb.js";
import { toObjectId } from "../../../../../lib/mongo-ids.js";
import { STUDENT_DEMAND_COLLECTION, STUDENT_DEMAND_STATUS } from "../../../../../lib/student-demands.js";

export const runtime = "nodejs";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_PAGE = 10_000;
const STATUSES = new Set(Object.values(STUDENT_DEMAND_STATUS));

class HistoryQueryError extends Error {}

function apiSuccess(data, message) {
  return Response.json({ success: true, data, message });
}

function apiError(message, code, status) {
  return Response.json({ success: false, error: { code, message } }, { status });
}

function parsePositiveInteger(value, field, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new HistoryQueryError(`${field} must be a positive integer.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw new HistoryQueryError(`${field} must be a positive integer within the supported range.`);
  }
  return number;
}

function parseServiceDate(value) {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HistoryQueryError("serviceDate must use YYYY-MM-DD format.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HistoryQueryError("serviceDate must be a valid calendar date.");
  }
  return value;
}

function parseFilters(searchParams) {
  for (const key of ["page", "limit", "serviceDate", "status"]) {
    if (searchParams.getAll(key).length > 1) {
      throw new HistoryQueryError(`${key} may only be supplied once.`);
    }
  }

  const page = parsePositiveInteger(searchParams.get("page"), "page", DEFAULT_PAGE, MAX_PAGE);
  const limit = parsePositiveInteger(searchParams.get("limit"), "limit", DEFAULT_LIMIT, MAX_LIMIT);
  const serviceDate = parseServiceDate(searchParams.get("serviceDate"));
  const status = searchParams.get("status");
  if (status !== null && !STATUSES.has(status)) {
    throw new HistoryQueryError("status must be ACTIVE or CANCELLED.");
  }

  return { page, limit, serviceDate, status };
}

function sessionObjectId(value, field) {
  try {
    return toObjectId(value, field);
  } catch {
    throw new AuthorizationError("The authenticated Student scope is unavailable.", 403, "INVALID_STUDENT_SCOPE");
  }
}

function safeDemand(demand, mess) {
  return {
    id: demand._id instanceof ObjectId ? demand._id.toHexString() : String(demand._id),
    mealType: demand.mealType,
    portion: demand.portion,
    expectedArrivalAt: demand.expectedArrivalAt,
    serviceDate: demand.serviceDate,
    mess: {
      id: demand.messId instanceof ObjectId ? demand.messId.toHexString() : String(demand.messId),
      name: mess?.name ?? null,
      code: mess?.code ?? null,
    },
    status: demand.status,
    createdAt: demand.createdAt,
    updatedAt: demand.updatedAt,
    ...(demand.cancelledAt ? { cancelledAt: demand.cancelledAt } : {}),
  };
}

export async function GET(request) {
  try {
    const student = await requireActiveRole(USER_ROLE.STUDENT);
    const studentId = sessionObjectId(student.id, "studentId");
    const hostelId = sessionObjectId(student.hostelId, "hostelId");
    const { page, limit, serviceDate, status } = parseFilters(new URL(request.url).searchParams);
    const db = await getMongoDb();

    const hostel = await db.collection(HOSTEL_COLLECTION).findOne(
      { _id: hostelId, status: "ACTIVE" },
      { projection: { _id: 1 } },
    );
    if (!hostel) {
      throw new AuthorizationError("The Student's Hostel is unavailable.", 403, "STUDENT_HOSTEL_UNAVAILABLE");
    }

    // Both ownership keys come from the verified session; callers cannot widen the query.
    const filter = { studentId, hostelId };
    if (serviceDate) filter.serviceDate = serviceDate;
    if (status) filter.status = status;

    const demandsCollection = db.collection(STUDENT_DEMAND_COLLECTION);
    const total = await demandsCollection.countDocuments(filter);
    const offset = (page - 1) * limit;
    const demandRecords = offset >= total
      ? []
      : await demandsCollection.find(filter)
        .sort({ serviceDate: -1, createdAt: -1, _id: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();

    const messIds = [...new Map(demandRecords
      .filter((record) => record.messId instanceof ObjectId)
      .map((record) => [record.messId.toHexString(), record.messId])).values()];
    const messRecords = messIds.length
      ? await db.collection(MESS_COLLECTION).find(
        { _id: { $in: messIds }, hostelId },
        { projection: { _id: 1, name: 1, code: 1 } },
      ).toArray()
      : [];
    const messById = new Map(messRecords.map((mess) => [mess._id.toHexString(), mess]));
    const totalPages = Math.ceil(total / limit);

    return apiSuccess({
      demands: demandRecords.map((record) => {
        const messId = record.messId instanceof ObjectId ? record.messId.toHexString() : String(record.messId);
        return safeDemand(record, messById.get(messId));
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    }, "Student meal history retrieved successfully.");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return apiError(error.message, error.code, error.status);
    }
    if (error instanceof HistoryQueryError) {
      return apiError(error.message, "INVALID_HISTORY_QUERY", 400);
    }
    console.error("Student meal history API error:", error);
    return apiError("An unexpected server error occurred.", "INTERNAL_SERVER_ERROR", 500);
  }
}
