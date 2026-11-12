import "server-only";

import { MESS_COLLECTION, HOSTEL_COLLECTION } from "../../../../lib/auth-contracts.js";
import { AuthorizationError } from "../../../../lib/auth-authorization.js";
import { getMongoClient, getMongoDb } from "../../../../lib/mongodb.js";
import {
  STUDENT_DEMAND_COLLECTION,
  StudentDemandError,
  createStudentDemandDocument,
  ensureStudentDemandIndexes,
  validateStudentDemandSelection,
} from "../../../../lib/student-demands.js";
import {
  ensureKitchenDemandRecord,
  syncStudentDemandAggregate,
} from "../../../../features/kitchen/services/kitchen-db_akk.js";

export const runtime = "nodejs";

const REQUEST_FIELDS = new Set(["mealType", "portion", "expectedArrivalAt", "messId"]);

function apiSuccess(data, message, status = 200) {
  return Response.json({ success: true, data, message }, { status });
}

function apiError(message, code, status) {
  return Response.json({ success: false, error: { code, message } }, { status });
}

function isDuplicateKeyError(error) {
  return error?.code === 11000 || error?.codeName === "DuplicateKey" || /E11000/i.test(error?.message ?? "");
}

function handleError(error) {
  if (error instanceof AuthorizationError) {
    return apiError(error.message, error.code, error.status);
  }

  if (error instanceof StudentDemandError) {
    return apiError(error.message, error.code, error.status);
  }

  if (isDuplicateKeyError(error)) {
    return apiError(
      "A demand already exists for this meal slot and service date.",
      "DUPLICATE_STUDENT_DEMAND",
      409,
    );
  }

  console.error("Student demand API error:", error);
  return apiError("An unexpected server error occurred.", "INTERNAL_SERVER_ERROR", 500);
}

async function readRequest(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new StudentDemandError("Request body must contain valid JSON.", "INVALID_JSON", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new StudentDemandError("Request body must be a JSON object.", "INVALID_BODY", 400);
  }
  if (Object.keys(body).some((field) => !REQUEST_FIELDS.has(field))) {
    throw new StudentDemandError("Request contains unsupported fields.", "INVALID_FIELDS", 400);
  }
  for (const requiredField of ["mealType", "portion", "expectedArrivalAt"]) {
    if (!Object.hasOwn(body, requiredField)) {
      throw new StudentDemandError(`${requiredField} is required.`, "MISSING_REQUIRED_FIELD", 400);
    }
  }
  if (Object.hasOwn(body, "messId") && typeof body.messId !== "string") {
    throw new StudentDemandError("messId must be a valid Mess ID.", "MESS_UNAVAILABLE", 400);
  }

  const { messId, ...selection } = body;
  validateStudentDemandSelection(selection);
  return { messId, selection };
}

function formatCreatedDemand(document, insertedId) {
  return {
    id: insertedId.toString(),
    messId: document.messId.toString(),
    mealType: document.mealType,
    slotId: document.slotId,
    serviceDate: document.serviceDate,
    portion: document.portion,
    portionWeight: document.portionWeight,
    expectedArrivalAt: document.expectedArrivalAt,
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function POST(request) {
  let session;
  try {
    const { messId, selection } = await readRequest(request);
    const document = await createStudentDemandDocument({ selectedMessId: messId, selection });
    const db = await getMongoDb();
    const demands = db.collection(STUDENT_DEMAND_COLLECTION);

    // Index DDL and Kitchen aggregate upsert must stay outside the transaction.
    await ensureStudentDemandIndexes(db);

    const identity = {
      studentId: document.studentId,
      serviceDate: document.serviceDate,
      slotId: document.slotId,
    };
    const existing = await demands.findOne(identity, { projection: { _id: 1 } });
    if (existing) {
      return apiError(
        "A demand already exists for this meal slot and service date.",
        "DUPLICATE_STUDENT_DEMAND",
        409,
      );
    }

    const hostelId = document.hostelId.toHexString();
    const resolvedMessId = document.messId.toHexString();
    await ensureKitchenDemandRecord({
      hostelId,
      messId: resolvedMessId,
      date: document.serviceDate,
      slotId: document.slotId,
    });

    const client = await getMongoClient();
    session = client.startSession();
    let insertedId;

    await session.withTransaction(async () => {
      // Recheck status/ownership in the transaction before writing demand.
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

      const insert = await demands.insertOne(document, { session });
      insertedId = insert.insertedId;

      await syncStudentDemandAggregate({
        hostelId,
        messId: resolvedMessId,
        date: document.serviceDate,
        slotId: document.slotId,
        portionDelta: document.portionWeight,
      }, { session });
    });

    return apiSuccess(
      formatCreatedDemand(document, insertedId),
      "Student meal demand created successfully.",
      201,
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
