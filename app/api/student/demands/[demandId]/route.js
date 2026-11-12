import "server-only";
import { ObjectId } from "mongodb";

import { HOSTEL_COLLECTION, MESS_COLLECTION, USER_ROLE } from "../../../../../lib/auth-contracts.js";
import { AuthorizationError, requireActiveRole } from "../../../../../lib/auth-authorization.js";
import { getMongoClient, getMongoDb } from "../../../../../lib/mongodb.js";
import { toObjectId } from "../../../../../lib/mongo-ids.js";
import {
  STUDENT_DEMAND_COLLECTION,
  STUDENT_DEMAND_PORTION_WEIGHT,
  STUDENT_DEMAND_STATUS,
  StudentDemandError,
  createStudentDemandDocument,
  ensureStudentDemandIndexes,
  validateStudentDemandSelection,
} from "../../../../../lib/student-demands.js";
import {
  ensureKitchenDemandRecord,
  syncStudentDemandAggregate,
} from "../../../../../features/kitchen/services/kitchen-db_akk.js";

export const runtime = "nodejs";

const UPDATE_FIELDS = new Set(["mealType", "portion", "expectedArrivalAt", "messId"]);
const NOT_FOUND = "STUDENT_DEMAND_NOT_FOUND";
const CONFLICT = "STUDENT_DEMAND_CONFLICT";

function apiSuccess(data, message, status = 200) {
  return Response.json({ success: true, data, message }, { status });
}

function apiError(message, code, status) {
  return Response.json({ success: false, error: { code, message } }, { status });
}

function isDuplicateKeyError(error) {
  return error?.code === 11000 || error?.codeName === "DuplicateKey" || /E11000/i.test(error?.message ?? "");
}

function isWriteConflict(error) {
  return error?.code === 112 || error?.codeName === "WriteConflict" || error?.hasErrorLabel?.("TransientTransactionError");
}

function handleError(error) {
  if (error instanceof AuthorizationError) return apiError(error.message, error.code, error.status);
  if (error instanceof StudentDemandError) return apiError(error.message, error.code, error.status);
  if (isDuplicateKeyError(error)) {
    return apiError("A demand already exists for this meal slot and service date.", "DUPLICATE_STUDENT_DEMAND", 409);
  }
  if (isWriteConflict(error)) {
    return apiError("This demand changed during the request. Refresh and try again.", CONFLICT, 409);
  }
  console.error("Student demand mutation API error:", error);
  return apiError("An unexpected server error occurred.", "INTERNAL_SERVER_ERROR", 500);
}

function parseDemandId(value) {
  try {
    return toObjectId(value, "demandId");
  } catch {
    throw new StudentDemandError("Demand ID must be a valid MongoDB ID.", "INVALID_STUDENT_DEMAND_ID", 400);
  }
}

function authenticatedObjectId(value, field) {
  try {
    return toObjectId(value, field);
  } catch {
    throw new StudentDemandError("The authenticated Student identity is unavailable.", "INVALID_STUDENT_DEMAND_IDENTITY", 403);
  }
}

async function readUpdate(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new StudentDemandError("Request body must contain valid JSON.", "INVALID_JSON", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new StudentDemandError("Request body must be a JSON object.", "INVALID_BODY", 400);
  }
  if (Object.keys(body).some((field) => !UPDATE_FIELDS.has(field))) {
    throw new StudentDemandError("Request contains unsupported fields.", "INVALID_FIELDS", 400);
  }
  for (const field of ["mealType", "portion", "expectedArrivalAt"]) {
    if (!Object.hasOwn(body, field)) {
      throw new StudentDemandError(`${field} is required.`, "MISSING_REQUIRED_FIELD", 400);
    }
  }
  if (Object.hasOwn(body, "messId") && typeof body.messId !== "string") {
    throw new StudentDemandError("messId must be a valid Mess ID.", "MESS_UNAVAILABLE", 400);
  }

  const { messId, ...selection } = body;
  validateStudentDemandSelection(selection);
  return { messId, selection };
}

function objectId(value, field) {
  if (value instanceof ObjectId) return value;
  return toObjectId(value, field);
}

function validStoredDemand(demand) {
  let validatedSelection;
  try {
    validatedSelection = validateStudentDemandSelection({
      mealType: demand.mealType,
      portion: demand.portion,
      expectedArrivalAt: demand.expectedArrivalAt,
    });
    objectId(demand.studentId, "studentId");
    objectId(demand.hostelId, "hostelId");
    objectId(demand.messId, "messId");
  } catch {
    return false;
  }

  const expectedWeight = STUDENT_DEMAND_PORTION_WEIGHT[demand.portion];
  return (
    demand.status === STUDENT_DEMAND_STATUS.ACTIVE &&
    Number.isFinite(expectedWeight) &&
    demand.portionWeight === expectedWeight &&
    validatedSelection.slotId === demand.slotId &&
    typeof demand.serviceDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(demand.serviceDate) &&
    demand.expectedArrivalAt.slice(0, 10) === demand.serviceDate &&
    (demand.revision === undefined || (Number.isSafeInteger(demand.revision) && demand.revision >= 0))
  );
}

function revisionFilter(demand) {
  return demand.revision === undefined
    ? { revision: { $exists: false } }
    : { revision: demand.revision };
}

function demandSnapshotFilter(demand, demandId) {
  return {
    _id: demandId,
    studentId: demand.studentId,
    hostelId: demand.hostelId,
    messId: demand.messId,
    serviceDate: demand.serviceDate,
    slotId: demand.slotId,
    portion: demand.portion,
    portionWeight: demand.portionWeight,
    expectedArrivalAt: demand.expectedArrivalAt,
    status: STUDENT_DEMAND_STATUS.ACTIVE,
    ...revisionFilter(demand),
  };
}

function demandAggregateKey(demand) {
  return {
    hostelId: objectId(demand.hostelId, "hostelId").toHexString(),
    messId: objectId(demand.messId, "messId").toHexString(),
    date: demand.serviceDate,
    slotId: demand.slotId,
  };
}

function sameAggregateKey(left, right) {
  return left.hostelId === right.hostelId && left.messId === right.messId &&
    left.date === right.date && left.slotId === right.slotId;
}

async function getOwnedDemand(db, demandId, studentId, hostelId) {
  const demand = await db.collection(STUDENT_DEMAND_COLLECTION).findOne({
    _id: demandId,
    studentId,
    hostelId,
  });
  if (!demand) {
    throw new StudentDemandError("Student demand not found.", NOT_FOUND, 404);
  }
  if (demand.status !== STUDENT_DEMAND_STATUS.ACTIVE) {
    throw new StudentDemandError("Only an active demand can be changed.", CONFLICT, 409);
  }
  if (!validStoredDemand(demand)) {
    throw new StudentDemandError("Stored demand is invalid or has changed. Refresh and try again.", CONFLICT, 409);
  }
  return demand;
}

async function recheckActiveTarget(db, document, session) {
  const hostel = await db.collection(HOSTEL_COLLECTION).findOne(
    { _id: document.hostelId, status: "ACTIVE" },
    { session, projection: { _id: 1 } },
  );
  if (!hostel) {
    throw new StudentDemandError("The Student's Hostel is unavailable.", "STUDENT_HOSTEL_UNAVAILABLE", 409);
  }
  const mess = await db.collection(MESS_COLLECTION).findOne(
    { _id: document.messId, hostelId: document.hostelId, status: "ACTIVE" },
    { session, projection: { _id: 1 } },
  );
  if (!mess) {
    throw new StudentDemandError("The selected Mess is unavailable for this Hostel.", "MESS_UNAVAILABLE", 409);
  }
}

function formatDemand(demand, id) {
  return {
    id: id.toString(),
    messId: objectId(demand.messId, "messId").toHexString(),
    mealType: demand.mealType,
    slotId: demand.slotId,
    serviceDate: demand.serviceDate,
    portion: demand.portion,
    portionWeight: demand.portionWeight,
    expectedArrivalAt: demand.expectedArrivalAt,
    status: demand.status,
    createdAt: demand.createdAt,
    updatedAt: demand.updatedAt,
    ...(demand.cancelledAt ? { cancelledAt: demand.cancelledAt } : {}),
  };
}

async function preinitializeAggregate(key) {
  await ensureKitchenDemandRecord({
    hostelId: key.hostelId,
    messId: key.messId,
    date: key.date,
    slotId: key.slotId,
  });
}

export async function PATCH(request, { params }) {
  let session;
  try {
    const { demandId: rawDemandId } = await params;
    const demandId = parseDemandId(rawDemandId);
    const { messId, selection } = await readUpdate(request);
    const next = await createStudentDemandDocument({ selectedMessId: messId, selection });
    const db = await getMongoDb();
    const demands = db.collection(STUDENT_DEMAND_COLLECTION);
    await ensureStudentDemandIndexes(db);

    const current = await getOwnedDemand(db, demandId, next.studentId, next.hostelId);
    const newIdentity = {
      studentId: next.studentId,
      serviceDate: next.serviceDate,
      slotId: next.slotId,
      _id: { $ne: demandId },
    };
    if (current.serviceDate !== next.serviceDate || current.slotId !== next.slotId) {
      const conflictingDemand = await demands.findOne(newIdentity, { projection: { _id: 1 } });
      if (conflictingDemand) {
        return apiError("A demand already exists for this meal slot and service date.", "DUPLICATE_STUDENT_DEMAND", 409);
      }
    }

    const oldKey = demandAggregateKey(current);
    const newKey = demandAggregateKey(next);
    const aggregateKeyChanged = !sameAggregateKey(oldKey, newKey);
    const portionDelta = next.portionWeight - current.portionWeight;
    if (aggregateKeyChanged) await preinitializeAggregate(oldKey);
    if (aggregateKeyChanged || portionDelta !== 0) await preinitializeAggregate(newKey);

    const client = await getMongoClient();
    session = client.startSession();
    const updatedAt = new Date();
    const changes = {
      hostelId: next.hostelId,
      messId: next.messId,
      mealType: next.mealType,
      slotId: next.slotId,
      serviceDate: next.serviceDate,
      portion: next.portion,
      portionWeight: next.portionWeight,
      expectedArrivalAt: next.expectedArrivalAt,
      updatedAt,
    };

    await session.withTransaction(async () => {
      await recheckActiveTarget(db, next, session);
      const updateResult = await demands.updateOne(
        demandSnapshotFilter(current, demandId),
        { $set: changes, $inc: { revision: 1 } },
        { session },
      );
      if (updateResult.matchedCount !== 1) {
        throw new StudentDemandError("This demand changed during the request. Refresh and try again.", CONFLICT, 409);
      }

      if (aggregateKeyChanged) {
        await syncStudentDemandAggregate({ ...oldKey, portionDelta: -current.portionWeight }, { session });
        await syncStudentDemandAggregate({ ...newKey, portionDelta: next.portionWeight }, { session });
      } else if (portionDelta !== 0) {
        await syncStudentDemandAggregate({ ...newKey, portionDelta }, { session });
      }
    });

    return apiSuccess(
      formatDemand({ ...current, ...changes }, demandId),
      "Student meal demand updated successfully.",
    );
  } catch (error) {
    return handleError(error);
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (error) {
        console.error("Student demand session cleanup failed:", error);
      }
    }
  }
}

export async function DELETE(_request, { params }) {
  let session;
  try {
    const student = await requireActiveRole(USER_ROLE.STUDENT);
    const { demandId: rawDemandId } = await params;
    const demandId = parseDemandId(rawDemandId);
    const studentId = authenticatedObjectId(student.id, "studentId");
    const hostelId = authenticatedObjectId(student.hostelId, "hostelId");
    const db = await getMongoDb();
    const demands = db.collection(STUDENT_DEMAND_COLLECTION);
    await ensureStudentDemandIndexes(db);

    const current = await getOwnedDemand(db, demandId, studentId, hostelId);
    const oldKey = demandAggregateKey(current);
    await preinitializeAggregate(oldKey);

    const client = await getMongoClient();
    session = client.startSession();
    const cancelledAt = new Date();

    await session.withTransaction(async () => {
      const updateResult = await demands.updateOne(
        demandSnapshotFilter(current, demandId),
        {
          $set: {
            status: STUDENT_DEMAND_STATUS.CANCELLED,
            cancelledAt,
            updatedAt: cancelledAt,
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      if (updateResult.matchedCount !== 1) {
        throw new StudentDemandError("This demand changed during the request. Refresh and try again.", CONFLICT, 409);
      }

      await syncStudentDemandAggregate({
        ...oldKey,
        portionDelta: -current.portionWeight,
      }, { session });
    });

    return apiSuccess(
      formatDemand({
        ...current,
        status: STUDENT_DEMAND_STATUS.CANCELLED,
        cancelledAt,
        updatedAt: cancelledAt,
      }, demandId),
      "Student meal demand cancelled successfully.",
    );
  } catch (error) {
    return handleError(error);
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (error) {
        console.error("Student demand session cleanup failed:", error);
      }
    }
  }
}
