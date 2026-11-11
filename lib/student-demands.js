import "server-only";
import { ObjectId } from "mongodb";

import {
  HOSTEL_COLLECTION,
  MESS_COLLECTION,
  USER_ROLE,
} from "./auth-contracts.js";
import { requireActiveRole } from "./auth-authorization.js";
import { MEAL_TYPES } from "./domain-contracts.js";
import { getMongoDb } from "./mongodb.js";
import { toObjectId } from "./mongo-ids.js";
import { getIndiaServiceDate } from "./india-service-date.js";

export const STUDENT_DEMAND_COLLECTION = "student_demands";

export const STUDENT_DEMAND_PORTION = Object.freeze({
  REGULAR: "REGULAR",
  LARGE: "LARGE",
});

export const STUDENT_DEMAND_PORTION_WEIGHT = Object.freeze({
  [STUDENT_DEMAND_PORTION.REGULAR]: 1.0,
  [STUDENT_DEMAND_PORTION.LARGE]: 1.5,
});

export const STUDENT_DEMAND_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  CANCELLED: "CANCELLED",
});

export const STUDENT_DEMAND_ERROR = Object.freeze({
  INVALID_SELECTION: "INVALID_DEMAND_SELECTION",
  INVALID_IDENTITY: "INVALID_STUDENT_DEMAND_IDENTITY",
  INVALID_ARRIVAL: "INVALID_EXPECTED_ARRIVAL",
  ARRIVAL_DATE_MISMATCH: "ARRIVAL_SERVICE_DATE_MISMATCH",
  HOSTEL_UNAVAILABLE: "STUDENT_HOSTEL_UNAVAILABLE",
  NO_ACTIVE_MESS: "NO_ACTIVE_MESS",
  MESS_SELECTION_REQUIRED: "MESS_SELECTION_REQUIRED",
  MESS_UNAVAILABLE: "MESS_UNAVAILABLE",
});

const SLOT_BY_MEAL_TYPE = Object.freeze({
  [MEAL_TYPES.BREAKFAST]: "breakfast",
  [MEAL_TYPES.LUNCH]: "lunch",
  [MEAL_TYPES.SNACKS]: "snacks",
  [MEAL_TYPES.DINNER]: "dinner",
});

const EXPECTED_ARRIVAL_PATTERN = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?\+05:30$/;
const SELECTION_FIELDS = new Set(["mealType", "portion", "expectedArrivalAt"]);
const EXPECTED_ARRIVAL_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export class StudentDemandError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = "StudentDemandError";
    this.code = code;
    this.status = status;
  }
}

function invalidSelection(message = "Meal type or portion is invalid.") {
  return new StudentDemandError(message, STUDENT_DEMAND_ERROR.INVALID_SELECTION, 400);
}

function asObjectId(value, fieldName) {
  return value instanceof ObjectId ? value : toObjectId(value, fieldName);
}

function isValidExpectedArrival(value) {
  if (typeof value !== "string" || !EXPECTED_ARRIVAL_PATTERN.test(value)) return false;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return false;

  const parts = Object.fromEntries(
    EXPECTED_ARRIVAL_FORMATTER.formatToParts(timestamp)
      .map(({ type, value: part }) => [type, part]),
  );
  const localTimestamp = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  return localTimestamp === value.slice(0, 19);
}

/** Validate browser-owned meal choices; server-owned identity and weight are excluded. */
export function validateStudentDemandSelection(selection) {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    throw invalidSelection("Demand selection must be an object.");
  }

  if (Object.keys(selection).some((field) => !SELECTION_FIELDS.has(field))) {
    throw invalidSelection("Demand selection contains unsupported fields.");
  }

  if (!Object.values(MEAL_TYPES).includes(selection.mealType)) {
    throw invalidSelection("Meal type must be BREAKFAST, LUNCH, SNACKS, or DINNER.");
  }

  if (!Object.values(STUDENT_DEMAND_PORTION).includes(selection.portion)) {
    throw invalidSelection("Portion must be REGULAR or LARGE.");
  }

  if (
    !isValidExpectedArrival(selection.expectedArrivalAt)
  ) {
    throw new StudentDemandError(
      "Expected arrival must be a valid ISO 8601 timestamp with a +05:30 offset.",
      STUDENT_DEMAND_ERROR.INVALID_ARRIVAL,
      400,
    );
  }

  return {
    mealType: selection.mealType,
    slotId: SLOT_BY_MEAL_TYPE[selection.mealType],
    portion: selection.portion,
    portionWeight: STUDENT_DEMAND_PORTION_WEIGHT[selection.portion],
    expectedArrivalAt: selection.expectedArrivalAt,
  };
}

/** Build the persistence contract using server-derived identity, service date, and timestamps. */
function buildStudentDemandDocument({
  studentId,
  hostelId,
  messId,
  selection,
}) {
  const now = new Date();
  let studentObjectId;
  let hostelObjectId;
  let messObjectId;
  try {
    studentObjectId = asObjectId(studentId, "studentId");
    hostelObjectId = asObjectId(hostelId, "hostelId");
    messObjectId = asObjectId(messId, "messId");
  } catch {
    throw new StudentDemandError(
      "Student, Hostel, and Mess identity must be valid MongoDB IDs.",
      STUDENT_DEMAND_ERROR.INVALID_IDENTITY,
      400,
    );
  }

  const validated = validateStudentDemandSelection(selection);
  const serviceDate = getIndiaServiceDate(now);
  if (validated.expectedArrivalAt.slice(0, 10) !== serviceDate) {
    throw new StudentDemandError(
      "Expected arrival must fall on the current India service date.",
      STUDENT_DEMAND_ERROR.ARRIVAL_DATE_MISMATCH,
      400,
    );
  }

  return {
    studentId: studentObjectId,
    hostelId: hostelObjectId,
    messId: messObjectId,
    mealType: validated.mealType,
    slotId: validated.slotId,
    serviceDate,
    portion: validated.portion,
    portionWeight: validated.portionWeight,
    expectedArrivalAt: validated.expectedArrivalAt,
    status: STUDENT_DEMAND_STATUS.ACTIVE,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    cancelledAt: null,
  };
}

/** Ensure exactly one demand identity per Student, India service date, and meal slot. */
export async function ensureStudentDemandIndexes(db) {
  const database = db ?? await getMongoDb();
  return database.collection(STUDENT_DEMAND_COLLECTION).createIndex(
    // Mess is intentionally excluded: a student's daily slot is unique even
    // if they later change Mess, and cancelled records retain that identity.
    { studentId: 1, serviceDate: 1, slotId: 1 },
    { unique: true, name: "studentId_1_serviceDate_1_slotId_1" },
  );
}

async function getActiveStudentScope() {
  const student = await requireActiveRole(USER_ROLE.STUDENT);

  let studentId;
  let hostelId;
  try {
    studentId = toObjectId(student.id, "studentId");
    hostelId = toObjectId(student.hostelId, "hostelId");
  } catch {
    throw new StudentDemandError(
      "The Student account is missing a valid identity or Hostel assignment.",
      STUDENT_DEMAND_ERROR.INVALID_IDENTITY,
      403,
    );
  }

  const db = await getMongoDb();
  const hostel = await db.collection(HOSTEL_COLLECTION).findOne(
    { _id: hostelId, status: "ACTIVE" },
    { projection: { _id: 1 } },
  );
  if (!hostel) {
    throw new StudentDemandError(
      "The Student's Hostel is unavailable.",
      STUDENT_DEMAND_ERROR.HOSTEL_UNAVAILABLE,
      403,
    );
  }

  return { studentId, hostelId, db };
}

async function findActiveMesses(db, hostelId, projection = { _id: 1 }) {
  return db.collection(MESS_COLLECTION)
    .find({ hostelId, status: "ACTIVE" }, { projection })
    .sort({ _id: 1 })
    .toArray();
}

/** List safe ACTIVE Mess choices within the authenticated Student's ACTIVE Hostel. */
export async function listActiveStudentMesses() {
  const { hostelId, db } = await getActiveStudentScope();
  const messes = await findActiveMesses(db, hostelId, { _id: 1, name: 1, code: 1 });
  return messes.map((mess) => ({
    id: mess._id.toHexString(),
    name: mess.name,
    code: mess.code,
  }));
}

/** Resolve trusted Student scope and an ACTIVE Mess within that Student's ACTIVE Hostel. */
export async function resolveStudentDemandContext(selectedMessId) {
  const { studentId, hostelId, db } = await getActiveStudentScope();

  const messes = await findActiveMesses(db, hostelId);

  if (messes.length === 0) {
    throw new StudentDemandError(
      "No active Mess is available for this Hostel.",
      STUDENT_DEMAND_ERROR.NO_ACTIVE_MESS,
      409,
    );
  }

  let mess;
  if (selectedMessId !== undefined && selectedMessId !== null && selectedMessId !== "") {
    let selectedObjectId;
    try {
      selectedObjectId = toObjectId(selectedMessId, "messId");
    } catch {
      throw new StudentDemandError(
        "Select a valid active Mess for your Hostel.",
        STUDENT_DEMAND_ERROR.MESS_UNAVAILABLE,
        400,
      );
    }
    mess = messes.find((candidate) => candidate._id.equals(selectedObjectId));
    if (!mess) {
      throw new StudentDemandError(
        "The selected Mess is unavailable for this Hostel.",
        STUDENT_DEMAND_ERROR.MESS_UNAVAILABLE,
        400,
      );
    }
  } else if (messes.length === 1) {
    [mess] = messes;
  } else {
    throw new StudentDemandError(
      "Select one of the active Messes for your Hostel.",
      STUDENT_DEMAND_ERROR.MESS_SELECTION_REQUIRED,
      400,
    );
  }

  return { studentId, hostelId, messId: mess._id };
}

/** Create a validated persistence document from server-authenticated identity and selected meal input. */
export async function createStudentDemandDocument({ selectedMessId, selection }) {
  const context = await resolveStudentDemandContext(selectedMessId);
  return buildStudentDemandDocument({ ...context, selection });
}
