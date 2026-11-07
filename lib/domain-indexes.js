
import "server-only";

import { getMongoDb } from "./mongodb.js";

import {
  COUNTER_COLLECTION,
  QUEUE_COLLECTION,
  QUEUE_HISTORY_COLLECTION,
} from "./domain-contracts.js";

import {
  HOSTEL_COLLECTION,
  MESS_COLLECTION,
} from "./auth-contracts.js";

export async function ensureDomainIndexes() {
  const db = await getMongoDb();

  const indexes = [
    // Hostels
    db.collection(HOSTEL_COLLECTION).createIndex(
      { code: 1 },
      { unique: true, name: "code_1" }
    ),

    // Messes
    db.collection(MESS_COLLECTION).createIndex(
      { hostelId: 1, code: 1 },
      { unique: true, name: "hostelId_1_code_1" }
    ),

    db.collection(MESS_COLLECTION).createIndex(
      { hostelId: 1, status: 1 },
      { name: "hostelId_1_status_1" }
    ),

    // Counters
    db.collection(COUNTER_COLLECTION).createIndex(
      { messId: 1, code: 1 },
      { unique: true, name: "messId_1_code_1" }
    ),

    db.collection(COUNTER_COLLECTION).createIndex(
      { hostelId: 1, messId: 1 },
      { name: "hostelId_1_messId_1" }
    ),

    // Queues
    db.collection(QUEUE_COLLECTION).createIndex(
      { counterId: 1, mealType: 1 },
      { unique: true, name: "counterId_1_mealType_1" }
    ),

    db.collection(QUEUE_COLLECTION).createIndex(
      { hostelId: 1, mealType: 1 },
      { name: "hostelId_1_mealType_1" }
    ),

    // Queue history
    db.collection(QUEUE_HISTORY_COLLECTION).createIndex(
      { queueId: 1, recordedAt: -1 },
      { name: "queueId_1_recordedAt_-1" }
    ),

    db.collection(QUEUE_HISTORY_COLLECTION).createIndex(
      { hostelId: 1, recordedAt: -1 },
      { name: "hostelId_1_recordedAt_-1" }
    ),
  ];

  await Promise.all(indexes);

  return {
    success: true,
    indexesCreatedOrVerified: indexes.length,
  };
}
