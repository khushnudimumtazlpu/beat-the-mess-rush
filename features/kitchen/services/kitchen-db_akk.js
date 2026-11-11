import "server-only";
import { ObjectId } from "mongodb";
import { getMongoDb } from "../../../lib/mongodb.js";
import { MEAL_TYPES } from "../../../lib/domain-contracts.js";
import { toObjectId, isValidObjectIdHex } from "../../../lib/mongo-ids.js";
import {
  withBuffer,
  efficiencyScore,
  totalCostLoss,
  totalWasteKg,
  wasteByCategory,
  wasteTrendByDay,
  topWastedDishes,
  buildAnalyticsSummary,
} from "../utils/calculations-ak.js";

// ─── Kitchen Database Collections & Constants (_akk) ─────────────────────────
export const KITCHEN_PRODUCTION_COLLECTION = "kitchen_productions";
export const KITCHEN_WASTE_COLLECTION = "kitchen_wastes";
export const KITCHEN_DEMAND_COLLECTION = "kitchen_demands";

export const DEFAULT_SAFETY_BUFFER_PCT = 8;
export const BENCHMARK_COST_PER_KG = 80;

let indexesInitialized = false;

/**
 * Normalizes input meal/slot name into the canonical uppercase MEAL_TYPES enum.
 */
export function normalizeMealType(value) {
  if (!value) return MEAL_TYPES.LUNCH;
  const upper = String(value).trim().toUpperCase();
  if (Object.values(MEAL_TYPES).includes(upper)) {
    return upper;
  }
  return MEAL_TYPES.LUNCH;
}

/**
 * Ensures indexes exist on kitchen collections for fast querying and isolation.
 */
export async function ensureKitchenIndexes(db) {
  if (indexesInitialized) return;
  try {
    const productions = db.collection(KITCHEN_PRODUCTION_COLLECTION);
    const wastes = db.collection(KITCHEN_WASTE_COLLECTION);
    const demands = db.collection(KITCHEN_DEMAND_COLLECTION);

    await Promise.all([
      productions.createIndex({ hostelId: 1, messId: 1, date: -1, slotId: 1 }),
      productions.createIndex({ date: -1 }),
      wastes.createIndex({ hostelId: 1, messId: 1, date: -1 }),
      wastes.createIndex({ category: 1 }),
      demands.createIndex(
        { hostelId: 1, messId: 1, date: 1, slotId: 1 },
        { unique: true }
      ),
    ]);
    indexesInitialized = true;
  } catch {
    // Indexes may already exist or running in mock environment
  }
}

/**
 * Safely format document for JSON responses (converts ObjectIds to hex strings).
 */
export function sanitizeDoc(doc) {
  if (!doc) return null;
  const { _id, hostelId, messId, counterId, ...rest } = doc;
  return {
    id: _id instanceof ObjectId ? _id.toHexString() : String(_id),
    ...(hostelId !== undefined
      ? { hostelId: hostelId instanceof ObjectId ? hostelId.toHexString() : String(hostelId) }
      : {}),
    ...(messId !== undefined
      ? { messId: messId instanceof ObjectId ? messId.toHexString() : String(messId) }
      : {}),
    ...(counterId !== undefined
      ? { counterId: counterId instanceof ObjectId ? counterId.toHexString() : String(counterId) }
      : {}),
    ...rest,
  };
}

// ─── PRODUCTION RECORDS ───────────────────────────────────────────────────────

/**
 * Get production records filtered by hostel, mess, date, and optional slot.
 */
export async function getProductionRecords({
  hostelId,
  messId,
  date,
  slotId,
  limit = 100,
}) {
  const db = await getMongoDb();
  await ensureKitchenIndexes(db);

  const query = {};
  if (hostelId) {
    query.hostelId = isValidObjectIdHex(hostelId) ? toObjectId(hostelId, "Hostel ID") : hostelId;
  }
  if (messId) {
    query.messId = isValidObjectIdHex(messId) ? toObjectId(messId, "Mess ID") : messId;
  }
  if (date) query.date = date;
  if (slotId) {
    query.$or = [
      { slotId: String(slotId).toLowerCase() },
      { mealType: normalizeMealType(slotId) },
    ];
  }

  const records = await db
    .collection(KITCHEN_PRODUCTION_COLLECTION)
    .find(query)
    .sort({ createdAt: -1, date: -1 })
    .limit(limit)
    .toArray();

  return records.map(sanitizeDoc);
}

/**
 * Create a new daily food production record.
 */
export async function createProductionRecord({
  hostelId,
  messId,
  date,
  slotId,
  mealType,
  sessionId = null,
  dishId,
  dishName,
  plannedPortions = 0,
  actualPrepared,
  portionsServed = 0,
  chef = "Kitchen Staff",
  status = "Preparing",
  createdBy = null,
}) {
  const db = await getMongoDb();
  await ensureKitchenIndexes(db);

  if (!hostelId) throw new Error("Hostel ID is required.");
  if (!messId) throw new Error("Mess ID is required.");

  const now = new Date();
  const prep = Number(actualPrepared) || 0;
  const served = Number(portionsServed) || 0;
  const planned = Number(plannedPortions) || 0;
  const leftover = Math.max(0, prep - served);
  const canonicalMeal = normalizeMealType(mealType || slotId);
  const slot = canonicalMeal.toLowerCase();

  const record = {
    hostelId: isValidObjectIdHex(hostelId) ? toObjectId(hostelId, "Hostel ID") : String(hostelId),
    messId: isValidObjectIdHex(messId) ? toObjectId(messId, "Mess ID") : String(messId),
    date: date || now.toISOString().split("T")[0],
    slotId: slot,
    mealType: canonicalMeal,
    sessionId: sessionId ? String(sessionId) : null,
    dishId: String(dishId),
    dishName: String(dishName || dishId),
    plannedPortions: planned,
    actualPrepared: prep,
    portionsServed: served,
    leftoverPortions: leftover,
    chef: String(chef || "Kitchen Staff"),
    status: ["Preparing", "Ready", "Completed"].includes(status)
      ? status
      : "Preparing",
    createdBy: createdBy ? String(createdBy) : null,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db
    .collection(KITCHEN_PRODUCTION_COLLECTION)
    .insertOne(record);

  return sanitizeDoc({ _id: result.insertedId, ...record });
}

/**
 * Update a production record (e.g. status or portions served).
 */
export async function updateProductionRecord(
  recordId,
  { hostelId, messId, portionsServed, status, chef }
) {
  const db = await getMongoDb();
  await ensureKitchenIndexes(db);

  let objectId;
  try {
    objectId = new ObjectId(recordId);
  } catch {
    objectId = recordId;
  }

  const query = { _id: objectId };
  if (hostelId) {
    query.hostelId = isValidObjectIdHex(hostelId)
      ? toObjectId(hostelId, "Hostel ID")
      : hostelId;
  }
  if (messId) {
    query.messId = isValidObjectIdHex(messId)
      ? toObjectId(messId, "Mess ID")
      : messId;
  }

  const current = await db
    .collection(KITCHEN_PRODUCTION_COLLECTION)
    .findOne(query);

  if (!current) {
    const notFoundError = new Error("Production record not found or access denied.");
    notFoundError.status = 404;
    notFoundError.code = "RECORD_NOT_FOUND";
    throw notFoundError;
  }

  const updateFields = { updatedAt: new Date() };

  if (typeof portionsServed !== "undefined") {
    const served = Number(portionsServed);
    if (!Number.isFinite(served) || served < 0) {
      throw new Error("Portions served must be a non-negative number.");
    }
    if (served > current.actualPrepared) {
      throw new Error("Portions served cannot exceed portions prepared.");
    }
    updateFields.portionsServed = served;
    updateFields.leftoverPortions = Math.max(0, current.actualPrepared - served);
  }

  if (status) {
    if (!["Preparing", "Ready", "Completed"].includes(status)) {
      throw new Error("Status must be Preparing, Ready, or Completed.");
    }
    updateFields.status = status;
  }

  if (chef) {
    updateFields.chef = String(chef);
  }

  await db
    .collection(KITCHEN_PRODUCTION_COLLECTION)
    .updateOne(query, { $set: updateFields });

  const updated = await db
    .collection(KITCHEN_PRODUCTION_COLLECTION)
    .findOne(query);

  return sanitizeDoc(updated);
}

// ─── WASTE RECORDS ────────────────────────────────────────────────────────────

/**
 * Get waste records with optional filtering.
 */
export async function getWasteRecords({
  hostelId,
  messId,
  date,
  slotId,
  category,
  startDate,
  endDate,
  limit = 100,
}) {
  const db = await getMongoDb();
  await ensureKitchenIndexes(db);

  const query = {};
  if (hostelId) {
    query.hostelId = isValidObjectIdHex(hostelId) ? toObjectId(hostelId, "Hostel ID") : hostelId;
  }
  if (messId) {
    query.messId = isValidObjectIdHex(messId) ? toObjectId(messId, "Mess ID") : messId;
  }
  if (date) query.date = date;
  if (slotId) {
    query.$or = [
      { slotId: String(slotId).toLowerCase() },
      { mealType: normalizeMealType(slotId) },
    ];
  }
  if (category) query.category = category;

  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = startDate;
    if (endDate) query.date.$lte = endDate;
  }

  const records = await db
    .collection(KITCHEN_WASTE_COLLECTION)
    .find(query)
    .sort({ createdAt: -1, date: -1 })
    .limit(limit)
    .toArray();

  return records.map(sanitizeDoc);
}

/**
 * Record post-service food waste.
 */
export async function createWasteRecord({
  hostelId,
  messId,
  date,
  slotId,
  mealType,
  sessionId = null,
  dishName,
  category,
  weightKg,
  portionsLost,
  costInr,
  reason,
  loggedBy = null,
}) {
  const db = await getMongoDb();
  await ensureKitchenIndexes(db);

  if (!hostelId) throw new Error("Hostel ID is required.");
  if (!messId) throw new Error("Mess ID is required.");

  const now = new Date();
  const kg = Number(weightKg);
  if (!Number.isFinite(kg) || kg < 0.1) {
    throw new Error("Weight must be at least 0.1 kg.");
  }

  const calculatedPortions =
    typeof portionsLost === "number" && portionsLost >= 0
      ? portionsLost
      : Math.round(kg * 3);

  const calculatedCost =
    typeof costInr === "number" && costInr >= 0
      ? costInr
      : Math.round(kg * BENCHMARK_COST_PER_KG);

  const canonicalMeal = normalizeMealType(mealType || slotId);
  const slot = canonicalMeal.toLowerCase();

  const record = {
    hostelId: isValidObjectIdHex(hostelId) ? toObjectId(hostelId, "Hostel ID") : String(hostelId),
    messId: isValidObjectIdHex(messId) ? toObjectId(messId, "Mess ID") : String(messId),
    date: date || now.toISOString().split("T")[0],
    slotId: slot,
    mealType: canonicalMeal,
    sessionId: sessionId ? String(sessionId) : null,
    dishName: String(dishName),
    category: String(category),
    weightKg: Math.round(kg * 10) / 10,
    portionsLost: calculatedPortions,
    costInr: calculatedCost,
    reason: String(reason || "").trim(),
    loggedBy: loggedBy ? String(loggedBy) : null,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db
    .collection(KITCHEN_WASTE_COLLECTION)
    .insertOne(record);

  return sanitizeDoc({ _id: result.insertedId, ...record });
}

// ─── DEMAND & FORECASTING ─────────────────────────────────────────────────────

/**
 * Seed baseline demand template if collection is empty for a slot/date.
 */
export function getBaselineDemand(slotId, bufferPct = DEFAULT_SAFETY_BUFFER_PCT) {
  const templates = {
    breakfast: {
      slotId: "breakfast",
      slotLabel: "Breakfast (7:30 – 9:30 AM)",
      totalStudentIntent: 185,
      bufferPct,
      dishBreakdown: [
        { dishId: "idli", dishName: "Idli & Sambar", studentDemand: 90 },
        { dishId: "poha", dishName: "Vegetable Poha", studentDemand: 60 },
        { dishId: "upma", dishName: "Garden Upma", studentDemand: 35 },
      ],
      hourlyFlow: [
        { time: "7:45 AM", students: 50 },
        { time: "8:15 AM", students: 80 },
        { time: "8:45 AM", students: 40 },
        { time: "9:15 AM", students: 15 },
      ],
    },
    lunch: {
      slotId: "lunch",
      slotLabel: "Lunch (12:00 – 2:00 PM)",
      totalStudentIntent: 420,
      bufferPct,
      dishBreakdown: [
        { dishId: "dal-rice", dishName: "Dal & Jeera Rice", studentDemand: 210 },
        { dishId: "roti-sabzi", dishName: "Roti & Seasonal Sabzi", studentDemand: 150 },
        { dishId: "curd-rice", dishName: "Curd Rice Bowl", studentDemand: 60 },
      ],
      hourlyFlow: [
        { time: "12:00 PM", students: 90 },
        { time: "12:30 PM", students: 170 },
        { time: "1:00 PM", students: 120 },
        { time: "1:30 PM", students: 40 },
      ],
    },
    snacks: {
      slotId: "snacks",
      slotLabel: "Evening Snacks (4:00 – 5:30 PM)",
      totalStudentIntent: 160,
      bufferPct,
      dishBreakdown: [
        { dishId: "sprout-chaat", dishName: "Sprout Chaat", studentDemand: 90 },
        { dishId: "veg-sandwich", dishName: "Vegetable Sandwich", studentDemand: 70 },
      ],
      hourlyFlow: [
        { time: "4:00 PM", students: 45 },
        { time: "4:30 PM", students: 80 },
        { time: "5:00 PM", students: 35 },
      ],
    },
    dinner: {
      slotId: "dinner",
      slotLabel: "Dinner (7:00 – 9:00 PM)",
      totalStudentIntent: 310,
      bufferPct,
      dishBreakdown: [
        { dishId: "khichdi", dishName: "Vegetable Khichdi", studentDemand: 120 },
        { dishId: "paneer-roti", dishName: "Paneer & Roti", studentDemand: 130 },
        { dishId: "rice-bowl", dishName: "Harvest Rice Bowl", studentDemand: 60 },
      ],
      hourlyFlow: [
        { time: "7:00 PM", students: 80 },
        { time: "7:30 PM", students: 120 },
        { time: "8:00 PM", students: 80 },
        { time: "8:30 PM", students: 30 },
      ],
    },
  };

  const selected = templates[slotId] || templates.lunch;
  return {
    source: "BASELINE",
    ...selected,
    recommendedTarget: withBuffer(selected.totalStudentIntent, bufferPct),
  };
}

/**
 * Get meal demand data for planning, comparing with past consumption.
 */
export async function getDemandData({ hostelId, messId, date, slotId }, options = {}) {
  const db = await getMongoDb();
  await ensureKitchenIndexes(db);

  const session = options?.session;
  const findOptions = session ? { session } : {};
  const updateOptions = session ? { session, upsert: true } : { upsert: true };

  const today = date || new Date().toISOString().split("T")[0];
  const targetSlot = (slotId || "lunch").toLowerCase();

  if (!hostelId) throw new Error("Hostel ID is required.");
  if (!messId) throw new Error("Mess ID is required.");

  const query = {
    slotId: targetSlot,
    date: today,
    hostelId: isValidObjectIdHex(hostelId) ? toObjectId(hostelId, "Hostel ID") : String(hostelId),
    messId: isValidObjectIdHex(messId) ? toObjectId(messId, "Mess ID") : String(messId),
  };

  const existing = await db
    .collection(KITCHEN_DEMAND_COLLECTION)
    .findOne(query, findOptions);

  if (existing) {
    return sanitizeDoc(existing);
  }

  // If no custom demand record exists yet for today, persist the baseline demand
  const baseline = getBaselineDemand(targetSlot);
  const newDemandDoc = {
    hostelId: isValidObjectIdHex(hostelId) ? toObjectId(hostelId, "Hostel ID") : String(hostelId),
    messId: isValidObjectIdHex(messId) ? toObjectId(messId, "Mess ID") : String(messId),
    date: today,
    source: "BASELINE",
    ...baseline,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    await db.collection(KITCHEN_DEMAND_COLLECTION).updateOne(
      {
        hostelId: newDemandDoc.hostelId,
        messId: newDemandDoc.messId,
        date: today,
        slotId: targetSlot,
      },
      { $setOnInsert: newDemandDoc },
      updateOptions
    );
  } catch {
    // Ignore duplicate key if concurrent
  }

  const saved = await db.collection(KITCHEN_DEMAND_COLLECTION).findOne({
    hostelId: newDemandDoc.hostelId,
    messId: newDemandDoc.messId,
    date: today,
    slotId: targetSlot,
  }, findOptions);

  return sanitizeDoc(saved || newDemandDoc);
}

/**
 * Synchronize aggregate meal demand from student demand submissions.
 * Replaces illustrative baseline records on the first real student submission,
 * and maintains totalStudentIntent and recommendedTarget atomically.
 *
 * Concurrency & Transaction Guarantees:
 * 1. Truly atomic database update: Uses an Aggregation Pipeline in updateOne() so increments,
 *    decrements, baseline replacement, and recommendedTarget recalculation occur in a single
 *    atomic operation inside the database engine without read-modify-write lost updates.
 * 2. Absolute totalIntent path: For idempotent full-sync and retry operations.
 * 3. Never negative: Floor at 0 enforced atomically ($max: [0, ...]).
 * 4. Transaction session: Supports options.session and propagates it to every DB operation.
 */
export async function syncStudentDemandAggregate(
  {
    hostelId,
    messId,
    date,
    slotId,
    portionDelta = null,
    totalIntent = null,
  },
  options = {}
) {
  const db = await getMongoDb();
  await ensureKitchenIndexes(db);

  const session = options?.session;
  const findOptions = session ? { session } : {};
  const updateOptions = session ? { session, upsert: true } : { upsert: true };

  const today = date || new Date().toISOString().split("T")[0];
  const targetSlot = (slotId || "lunch").toLowerCase();

  if (!hostelId) throw new Error("Hostel ID is required.");
  if (!messId) throw new Error("Mess ID is required.");

  const hid = isValidObjectIdHex(hostelId) ? toObjectId(hostelId, "Hostel ID") : String(hostelId);
  const mid = isValidObjectIdHex(messId) ? toObjectId(messId, "Mess ID") : String(messId);

  const query = {
    slotId: targetSlot,
    date: today,
    hostelId: hid,
    messId: mid,
  };

  const slotLabels = {
    breakfast: "Breakfast (7:30 – 9:30 AM)",
    lunch: "Lunch (12:00 – 2:00 PM)",
    snacks: "Evening Snacks (4:00 – 5:30 PM)",
    dinner: "Dinner (7:00 – 9:00 PM)",
  };

  // ── Path 1: Idempotent Absolute Sync via totalIntent ───────────────────────
  if (totalIntent !== null && typeof totalIntent !== "undefined") {
    const finalIntent = Math.max(0, Number(Number(totalIntent).toFixed(2)) || 0);
    const target = withBuffer(finalIntent, DEFAULT_SAFETY_BUFFER_PCT);

    const updateDoc = {
      hostelId: hid,
      messId: mid,
      date: today,
      slotId: targetSlot,
      slotLabel: slotLabels[targetSlot] || `${targetSlot.toUpperCase()} Slot`,
      totalStudentIntent: finalIntent,
      recommendedTarget: target,
      bufferPct: DEFAULT_SAFETY_BUFFER_PCT,
      source: "STUDENT_DEMAND",
      updatedAt: new Date(),
    };

    await db.collection(KITCHEN_DEMAND_COLLECTION).updateOne(
      query,
      {
        $set: updateDoc,
        $setOnInsert: { createdAt: new Date() },
      },
      updateOptions
    );

    const saved = await db.collection(KITCHEN_DEMAND_COLLECTION).findOne(query, findOptions);
    return sanitizeDoc(saved || updateDoc);
  }

  // ── Path 2: Atomic Delta Update via Aggregation Pipeline ───────────────────
  const delta = Number(portionDelta) || 0;

  // Aggregation pipeline update: executes atomically inside the database engine.
  // Handles:
  // - Baseline replacement: if $source == "BASELINE", replaces intent with max(0, delta)
  // - Normal increment/decrement: if $source != "BASELINE", adds delta to current total
  // - Floor at 0: $max prevents negative numbers under heavy cancellations
  // - Target sync: calculates recommendedTarget = ceil(totalStudentIntent * 1.08)
  const pipeline = [
    {
      $set: {
        totalStudentIntent: {
          $cond: {
            if: { $eq: ["$source", "BASELINE"] },
            then: { $max: [0, delta] },
            else: {
              $max: [
                0,
                {
                  $round: [
                    { $add: [{ $ifNull: ["$totalStudentIntent", 0] }, delta] },
                    2,
                  ],
                },
              ],
            },
          },
        },
        source: "STUDENT_DEMAND",
        bufferPct: DEFAULT_SAFETY_BUFFER_PCT,
        slotLabel: {
          $ifNull: [
            "$slotLabel",
            slotLabels[targetSlot] || `${targetSlot.toUpperCase()} Slot`,
          ],
        },
        updatedAt: "$NOW",
      },
    },
    {
      $set: {
        recommendedTarget: {
          $ceil: { $multiply: ["$totalStudentIntent", 1 + DEFAULT_SAFETY_BUFFER_PCT / 100] },
        },
      },
    },
  ];

  await db.collection(KITCHEN_DEMAND_COLLECTION).updateOne(
    query,
    pipeline,
    updateOptions
  );

  const saved = await db.collection(KITCHEN_DEMAND_COLLECTION).findOne(query, findOptions);
  return sanitizeDoc(saved);
}

// ─── ANALYTICS AGGREGATION ────────────────────────────────────────────────────

/**
 * Generate full analytics and reports from actual database records.
 */
export async function getKitchenAnalytics({
  hostelId,
  messId,
  startDate,
  endDate,
}) {
  const [productionRecords, wasteRecords] = await Promise.all([
    getProductionRecords({ hostelId, messId, limit: 1000 }),
    getWasteRecords({ hostelId, messId, startDate, endDate, limit: 1000 }),
  ]);

  const summary = buildAnalyticsSummary(productionRecords, wasteRecords);

  // Additional meal-wise breakdown
  const mealBreakdown = {};
  for (const p of productionRecords) {
    const slot = p.slotId || "other";
    if (!mealBreakdown[slot]) {
      mealBreakdown[slot] = {
        slot,
        prepared: 0,
        served: 0,
        wasteKg: 0,
        portionsLost: 0,
      };
    }
    mealBreakdown[slot].prepared += p.actualPrepared || 0;
    mealBreakdown[slot].served += p.portionsServed || 0;
  }

  for (const w of wasteRecords) {
    const slot = w.slotId || "other";
    if (!mealBreakdown[slot]) {
      mealBreakdown[slot] = {
        slot,
        prepared: 0,
        served: 0,
        wasteKg: 0,
        portionsLost: 0,
      };
    }
    mealBreakdown[slot].wasteKg += w.weightKg || 0;
    mealBreakdown[slot].portionsLost += w.portionsLost || 0;
  }

  // Calculate waste percentage: total waste portions / total cooked portions
  const totalCooked = summary.totalCooked;
  const totalWastePortions = wasteRecords.reduce(
    (sum, r) => sum + (r.portionsLost || 0),
    0
  );
  const wastePercentage =
    totalCooked > 0
      ? Math.round((totalWastePortions / totalCooked) * 100 * 10) / 10
      : 0;

  return {
    ...summary,
    totalWastePortions,
    wastePercentage,
    mealBreakdown: Object.values(mealBreakdown),
    totalRecords: {
      production: productionRecords.length,
      waste: wasteRecords.length,
    },
  };
}
