
import "server-only";

import { getMongoDb } from "./mongodb.js";

const collectionNames = [
  "hostels",
  "messes",
  "counters",
  "queues",
  "queueHistory",
];

const duplicateChecks = {
  hostels: [
    { label: "hostel code", key: { code: 1 } },
  ],
  messes: [
    {
      label: "mess code within hostel",
      key: { hostelId: 1, code: 1 },
    },
  ],
  counters: [
    {
      label: "counter code within mess",
      key: { messId: 1, code: 1 },
    },
  ],
  queues: [
    {
      label: "queue per counter and meal type",
      key: { counterId: 1, mealType: 1 },
    },
  ],
};

export async function inspectDomainData() {
  const db = await getMongoDb();

  const existingCollections = await db
    .listCollections({}, { nameOnly: true })
    .toArray();

  const existingNames = new Set(
    existingCollections.map((collection) => collection.name)
  );

  const report = {};

  for (const name of collectionNames) {
    if (!existingNames.has(name)) {
      report[name] = {
        exists: false,
        documentCount: 0,
        indexes: [],
        duplicateChecks: [],
      };

      continue;
    }

    const collection = db.collection(name);

    const indexes = await collection.indexes();

    const checks = [];

    for (const duplicateCheck of duplicateChecks[name] ?? []) {
      const duplicates = await collection
        .aggregate([
          {
            $group: {
              _id: duplicateCheck.key,
              count: { $sum: 1 },
            },
          },
          {
            $match: {
              count: { $gt: 1 },
            },
          },
          { $limit: 10 },
        ])
        .toArray();

      checks.push({
        label: duplicateCheck.label,
        hasDuplicates: duplicates.length > 0,
        duplicateGroupsFound: duplicates.length,
      });
    }

    report[name] = {
      exists: true,
      documentCount: await collection.countDocuments(),
      indexes: indexes.map((index) => ({
        name: index.name,
        key: index.key,
        unique: Boolean(index.unique),
        sparse: Boolean(index.sparse),
      })),
      duplicateChecks: checks,
    };
  }

  return report;
}
