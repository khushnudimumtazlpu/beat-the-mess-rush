import "server-only";

import { ObjectId } from "mongodb";
import { toObjectId } from "./mongo-ids.js";
import { HOSTEL_COLLECTION, MESS_COLLECTION } from "./auth-contracts.js";
import {
  COUNTER_COLLECTION,
  MEAL_TYPES,
  QUEUE_COLLECTION,
  QUEUE_HISTORY_COLLECTION,
} from "./domain-contracts.js";
import { calculateQueueMetrics } from "../features/queue/lib/queue-calculations.js";
import { getMongoClient, getMongoDb } from "./mongodb.js";
import { AdminApiError } from "./super-admin-domain-api.js";
import { ensureDomainIndexes } from "./domain-indexes.js";

const ENTITY_STATUSES = ["ACTIVE", "INACTIVE"];
const MEAL_TYPE_VALUES = Object.values(MEAL_TYPES);

function validateObject(body, allowedFields, { required = [] } = {}) {
  const fields = Object.keys(body);
  if (fields.some((field) => !allowedFields.includes(field))) {
    throw new AdminApiError("Request contains unsupported fields.", 400, "INVALID_FIELDS");
  }
  if (required.some((field) => body[field] === undefined)) {
    throw new AdminApiError(`Required fields: ${required.join(", ")}.`, 400, "MISSING_REQUIRED_FIELDS");
  }
  if (fields.length === 0) {
    throw new AdminApiError("Provide at least one supported field.", 400, "EMPTY_UPDATE");
  }
}

function validateName(value, label) {
  if (typeof value !== "string") {
    throw new AdminApiError(`${label} must be a string.`, 400, "INVALID_NAME");
  }
  const name = value.trim();
  if (name.length < 2 || name.length > 80) {
    throw new AdminApiError(`${label} must contain 2 to 80 characters.`, 400, "INVALID_NAME");
  }
  return name;
}

function validateCode(value, label) {
  if (typeof value !== "string") {
    throw new AdminApiError(`${label} must be a string.`, 400, "INVALID_CODE");
  }
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) {
    throw new AdminApiError(`${label} must contain 3 to 20 letters, numbers, or hyphens.`, 400, "INVALID_CODE");
  }
  return code;
}

function validateDescription(value) {
  if (typeof value !== "string" || value.trim().length > 250) {
    throw new AdminApiError("Description must be a string of at most 250 characters.", 400, "INVALID_DESCRIPTION");
  }
  return value.trim();
}

function validateMealTypes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AdminApiError("mealTypes must contain at least one meal type.", 400, "INVALID_MEAL_TYPES");
  }
  if (value.some((item) => !MEAL_TYPE_VALUES.includes(item))) {
    throw new AdminApiError("mealTypes contains an unsupported meal type.", 400, "INVALID_MEAL_TYPES");
  }
  if (new Set(value).size !== value.length) {
    throw new AdminApiError("mealTypes cannot contain duplicates.", 400, "INVALID_MEAL_TYPES");
  }
  return [...value];
}

function formatHostel(hostel) {
  return {
    id: hostel._id.toString(),
    name: hostel.name,
    code: hostel.code,
    ...(hostel.description !== undefined ? { description: hostel.description } : {}),
    status: hostel.status,
    queueMutationVersion: hostel.queueMutationVersion ?? 0,
    createdAt: hostel.createdAt,
    updatedAt: hostel.updatedAt,
    createdBy: hostel.createdBy?.toString(),
  };
}

function formatMess(mess) {
  return {
    id: mess._id.toString(),
    hostelId: mess.hostelId.toString(),
    name: mess.name,
    code: mess.code,
    ...(mess.description !== undefined ? { description: mess.description } : {}),
    mealTypes: mess.mealTypes,
    status: mess.status,
    queueMutationVersion: mess.queueMutationVersion ?? 0,
    createdAt: mess.createdAt,
    updatedAt: mess.updatedAt,
    createdBy: mess.createdBy?.toString(),
  };
}

function notFound(kind) {
  throw new AdminApiError(`${kind} not found.`, 404, `${kind.toUpperCase()}_NOT_FOUND`);
}

function duplicateCode(error) {
  if (error?.code === 11000) {
    throw new AdminApiError("A record with this code already exists.", 409, "DUPLICATE_CODE");
  }
  throw error;
}

export async function listHostels() {
  const db = await getMongoDb();
  const records = await db.collection(HOSTEL_COLLECTION).find({}).sort({ createdAt: -1, _id: 1 }).toArray();
  return records.map(formatHostel);
}

export async function createHostel(body, actor) {
  validateObject(body, ["name", "code", "description"], { required: ["name", "code"] });
  const now = new Date();
  const document = {
    _id: new ObjectId(),
    name: validateName(body.name, "Hostel name"),
    code: validateCode(body.code, "Hostel code"),
    status: "ACTIVE",
    queueMutationVersion: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: toObjectId(actor.id, "userId"),
  };
  if (body.description !== undefined) document.description = validateDescription(body.description);
  await ensureDomainIndexes();
  const db = await getMongoDb();
  try {
    await db.collection(HOSTEL_COLLECTION).insertOne(document);
  } catch (error) {
    duplicateCode(error);
  }
  return formatHostel(document);
}

export async function getHostel(hostelId) {
  const id = toObjectId(hostelId, "hostelId");
  const db = await getMongoDb();
  const hostel = await db.collection(HOSTEL_COLLECTION).findOne({ _id: id });
  if (!hostel) notFound("Hostel");
  return formatHostel(hostel);
}

export async function updateHostel(hostelId, body) {
  validateObject(body, ["name", "code", "description"]);
  const id = toObjectId(hostelId, "hostelId");
  const changes = { updatedAt: new Date() };
  if (body.name !== undefined) changes.name = validateName(body.name, "Hostel name");
  if (body.code !== undefined) changes.code = validateCode(body.code, "Hostel code");
  if (body.description !== undefined) changes.description = validateDescription(body.description);
  await ensureDomainIndexes();
  const db = await getMongoDb();
  try {
    const update = await db.collection(HOSTEL_COLLECTION).updateOne(
      { _id: id },
      { $set: changes },
    );
    if (update.matchedCount !== 1) notFound("Hostel");
  } catch (error) {
    duplicateCode(error);
  }
  const hostel = await db.collection(HOSTEL_COLLECTION).findOne({ _id: id });
  if (!hostel) notFound("Hostel");
  return formatHostel(hostel);
}

async function closeQueues(filter, actorId, db, session, now) {
  const queues = await db.collection(QUEUE_COLLECTION).find(
    { ...filter, isOpen: true },
    { session },
  ).toArray();

  for (const queue of queues) {
    const metrics = calculateQueueMetrics({ ...queue, isOpen: false });
    const updated = await db.collection(QUEUE_COLLECTION).updateOne(
      { _id: queue._id, isOpen: true, sessionId: queue.sessionId },
      { $set: {
        isOpen: false,
        estimatedWaitMinutes: metrics.estimatedWaitMinutes,
        crowdLevel: metrics.crowdLevel,
        status: metrics.status,
        updatedAt: now,
      } },
      { session },
    );
    if (updated.modifiedCount !== 1) continue;
    await db.collection(QUEUE_HISTORY_COLLECTION).insertOne({
      _id: new ObjectId(),
      queueId: queue._id,
      hostelId: queue.hostelId,
      messId: queue.messId,
      counterId: queue.counterId,
      mealType: queue.mealType,
      sessionId: queue.sessionId,
      peopleWaiting: queue.peopleWaiting,
      servingRatePerMinute: queue.servingRatePerMinute,
      estimatedWaitMinutes: metrics.estimatedWaitMinutes,
      crowdLevel: metrics.crowdLevel,
      status: metrics.status,
      isOpen: false,
      recordedAt: now,
      updatedBy: actorId,
    }, { session });
  }
}

export async function setHostelStatus(hostelId, status, actor) {
  if (!ENTITY_STATUSES.includes(status)) {
    throw new AdminApiError("Status must be ACTIVE or INACTIVE.", 400, "INVALID_STATUS");
  }
  const id = toObjectId(hostelId, "hostelId");
  await ensureDomainIndexes();
  const db = await getMongoDb();
  const client = await getMongoClient();
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const hostel = await db.collection(HOSTEL_COLLECTION).findOne({ _id: id }, { session });
      if (!hostel) notFound("Hostel");
      if (!ENTITY_STATUSES.includes(hostel.status)) {
        throw new AdminApiError("Hostel has an invalid status.", 409, "INVALID_STORED_STATUS");
      }
      const now = new Date();
      const hostelUpdate = { $set: { status, updatedAt: now } };
      if (hostel.status !== status) hostelUpdate.$inc = { queueMutationVersion: 1 };
      const update = await db.collection(HOSTEL_COLLECTION).updateOne(
        { _id: id, status: hostel.status },
        hostelUpdate,
        { session },
      );
      if (update.matchedCount !== 1) throw new AdminApiError("Hostel changed during the request.", 409, "CONCURRENT_UPDATE");
      if (status === "INACTIVE") {
        await db.collection(MESS_COLLECTION).updateMany(
          { hostelId: id, status: "ACTIVE" },
          { $set: { status: "INACTIVE", updatedAt: now }, $inc: { queueMutationVersion: 1 } },
          { session },
        );
        await closeQueues({ hostelId: id }, actor.id, db, session, now);
      }
      result = { ...hostel, status, updatedAt: now, queueMutationVersion: (hostel.queueMutationVersion ?? 0) + (hostel.status === status ? 0 : 1) };
    });
  } finally {
    await session.endSession();
  }
  return formatHostel(result);
}

export async function listMesses(hostelId) {
  const id = toObjectId(hostelId, "hostelId");
  const db = await getMongoDb();
  if (!await db.collection(HOSTEL_COLLECTION).findOne({ _id: id }, { projection: { _id: 1 } })) notFound("Hostel");
  const records = await db.collection(MESS_COLLECTION).find({ hostelId: id }).sort({ createdAt: -1, _id: 1 }).toArray();
  return records.map(formatMess);
}

export async function createMess(hostelId, body, actor) {
  validateObject(body, ["name", "code", "description", "mealTypes"], { required: ["name", "code", "mealTypes"] });
  const parentId = toObjectId(hostelId, "hostelId");
  const now = new Date();
  const document = {
    _id: new ObjectId(),
    hostelId: parentId,
    name: validateName(body.name, "Mess name"),
    code: validateCode(body.code, "Mess code"),
    mealTypes: validateMealTypes(body.mealTypes),
    status: "ACTIVE",
    queueMutationVersion: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: toObjectId(actor.id, "userId"),
  };
  if (body.description !== undefined) document.description = validateDescription(body.description);
  await ensureDomainIndexes();
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const parent = await db.collection(HOSTEL_COLLECTION).updateOne(
        { _id: parentId, status: "ACTIVE" },
        { $inc: { queueMutationVersion: 1 } },
        { session },
      );
      if (parent.matchedCount !== 1) {
        const exists = await db.collection(HOSTEL_COLLECTION).findOne({ _id: parentId }, { session, projection: { _id: 1 } });
        if (!exists) notFound("Hostel");
        throw new AdminApiError("Cannot create a Mess under an inactive Hostel.", 409, "HOSTEL_INACTIVE");
      }
      await db.collection(MESS_COLLECTION).insertOne(document, { session });
    });
  } catch (error) {
    duplicateCode(error);
  } finally {
    await session.endSession();
  }
  return formatMess(document);
}

export async function getMess(hostelId, messId) {
  const parentId = toObjectId(hostelId, "hostelId");
  const id = toObjectId(messId, "messId");
  const db = await getMongoDb();
  const mess = await db.collection(MESS_COLLECTION).findOne({ _id: id, hostelId: parentId });
  if (!mess) notFound("Mess");
  return formatMess(mess);
}

export async function updateMess(hostelId, messId, body) {
  validateObject(body, ["name", "code", "description", "mealTypes"]);
  const parentId = toObjectId(hostelId, "hostelId");
  const id = toObjectId(messId, "messId");
  const changes = { updatedAt: new Date() };
  if (body.name !== undefined) changes.name = validateName(body.name, "Mess name");
  if (body.code !== undefined) changes.code = validateCode(body.code, "Mess code");
  if (body.description !== undefined) changes.description = validateDescription(body.description);
  if (body.mealTypes !== undefined) changes.mealTypes = validateMealTypes(body.mealTypes);
  await ensureDomainIndexes();
  const db = await getMongoDb();
  try {
    const update = await db.collection(MESS_COLLECTION).updateOne(
      { _id: id, hostelId: parentId },
      { $set: changes },
    );
    if (update.matchedCount !== 1) notFound("Mess");
  } catch (error) {
    duplicateCode(error);
  }
  const mess = await db.collection(MESS_COLLECTION).findOne({ _id: id, hostelId: parentId });
  if (!mess) notFound("Mess");
  return formatMess(mess);
}

export async function setMessStatus(hostelId, messId, status, actor) {
  if (!ENTITY_STATUSES.includes(status)) {
    throw new AdminApiError("Status must be ACTIVE or INACTIVE.", 400, "INVALID_STATUS");
  }
  const parentId = toObjectId(hostelId, "hostelId");
  const id = toObjectId(messId, "messId");
  await ensureDomainIndexes();
  const client = await getMongoClient();
  const db = await getMongoDb();
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const mess = await db.collection(MESS_COLLECTION).findOne({ _id: id, hostelId: parentId }, { session });
      if (!mess) notFound("Mess");
      if (!ENTITY_STATUSES.includes(mess.status)) {
        throw new AdminApiError("Mess has an invalid status.", 409, "INVALID_STORED_STATUS");
      }
      const now = new Date();
      if (status === "ACTIVE") {
        const parent = await db.collection(HOSTEL_COLLECTION).updateOne(
          { _id: parentId, status: "ACTIVE" },
          { $inc: { queueMutationVersion: 1 } },
          { session },
        );
        if (parent.matchedCount !== 1) throw new AdminApiError("Cannot activate a Mess under an inactive Hostel.", 409, "HOSTEL_INACTIVE");
      }
      const messUpdate = { $set: { status, updatedAt: now } };
      if (mess.status !== status) messUpdate.$inc = { queueMutationVersion: 1 };
      const update = await db.collection(MESS_COLLECTION).updateOne(
        { _id: id, hostelId: parentId, status: mess.status },
        messUpdate,
        { session },
      );
      if (update.matchedCount !== 1) throw new AdminApiError("Mess changed during the request.", 409, "CONCURRENT_UPDATE");
      if (status === "INACTIVE") {
        await closeQueues({ messId: id }, actor.id, db, session, now);
      }
      result = { ...mess, status, updatedAt: now, queueMutationVersion: (mess.queueMutationVersion ?? 0) + (mess.status === status ? 0 : 1) };
    });
  } finally {
    await session.endSession();
  }
  return formatMess(result);
}
