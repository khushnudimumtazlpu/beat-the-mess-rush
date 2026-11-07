
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { ObjectId } from "mongodb";

vi.mock("server-only", () => ({}));

vi.mock("../lib/auth-authorization.js", () => ({
  requireActiveRoles: vi.fn(async () => ({
    id: "integration-test-user",
    role: "SUPER_ADMIN",
  })),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

const TEST_DB_NAME = "rushless_concurrency_test";
const RUN_TEST = process.env.RUN_MONGODB_INTEGRATION === "true";

function sessionKey(lsid) {
  return lsid?.id?.toString("hex") ?? null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition, timeoutMs = 30000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (condition()) return;
    await delay(25);
  }

  throw new Error("Timed out waiting for concurrent transactions.");
}

describe.skipIf(!RUN_TEST)(
  "MongoDB queue concurrency integration",
  () => {
    let client;
    let db;
    let POST;
    let PATCH;

    const routeSessions = new Set();
    const transientFailures = new Set();
    const retriedSessions = new Set();
    const requestSessions = new Map();

    let blockerSessionId;

    function onCommandStarted(event) {
      const sid = sessionKey(event.command?.lsid);
      if (!sid || sid === blockerSessionId) return;

      requestSessions.set(event.requestId, sid);

      const collectionName =
        event.command.find ?? event.command.update;

      if (
        event.command.startTransaction === true &&
        collectionName === "counters"
      ) {
        routeSessions.add(sid);

        if (transientFailures.has(sid)) {
          retriedSessions.add(sid);
        }
      }
    }

    function onCommandFailed(event) {
      const sid = requestSessions.get(event.requestId);
      if (!sid) return;

      const failure = event.failure;

      const isTransient =
        failure?.hasErrorLabel?.("TransientTransactionError") ||
        failure?.errorLabels?.includes("TransientTransactionError");

      if (isTransient) {
        transientFailures.add(sid);
      }
    }

    beforeAll(async () => {
      loadEnvConfig(process.cwd(), true);

      if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI is missing from local environment.");
      }

      process.env.MONGODB_DB_NAME = TEST_DB_NAME;
      process.env.MONGODB_MONITOR_COMMANDS = "true";

      const mongo = await import("../lib/mongodb.js");
      client = await mongo.getMongoClient();
      db = client.db(TEST_DB_NAME);

      client.on("commandStarted", onCommandStarted);
      client.on("commandFailed", onCommandFailed);

      const queueRoute = await import("../app/api/queues/route.js");
      const counterRoute = await import("../app/api/counters/[id]/route.js");

      POST = queueRoute.POST;
      PATCH = counterRoute.PATCH;
    }, 60000);

    afterAll(async () => {
      if (client) {
        client.off("commandStarted", onCommandStarted);
        client.off("commandFailed", onCommandFailed);
        await client.close();
      }
    });

    it(
      "handles a real transaction conflict and preserves queue consistency",
      async () => {
        const hostels = db.collection("hostels");
        const messes = db.collection("messes");
        const counters = db.collection("counters");
        const queues = db.collection("queues");
        const history = db.collection("queueHistory");

        const hostelId = new ObjectId();
        const messId = new ObjectId();
        const counterId = new ObjectId();

        const blockerSession = client.startSession();
        blockerSessionId = sessionKey(blockerSession.id);

        let blockerActive = false;

        try {
          await hostels.insertOne({
            _id: hostelId,
            name: "Concurrency Test Hostel",
            status: "ACTIVE",
          });

          await messes.insertOne({
            _id: messId,
            hostelId,
            name: "Concurrency Test Mess",
            status: "ACTIVE",
          });

          await counters.insertOne({
            _id: counterId,
            hostelId,
            messId,
            name: "Concurrency Test Counter",
            code: `CT-${new ObjectId().toHexString()}`,
            defaultServingRatePerMinute: 2,
            status: "ACTIVE",
            queueMutationVersion: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Hold a real transaction write on the Counter.
          blockerSession.startTransaction();
          blockerActive = true;

          await counters.updateOne(
            { _id: counterId, status: "ACTIVE" },
            { $inc: { queueMutationVersion: 1 } },
            { session: blockerSession }
          );

          const queueRequest = new Request(
            "http://localhost/api/queues",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                counterId: counterId.toString(),
                mealType: "LUNCH",
              }),
            }
          );

          const deactivateRequest = new Request(
            `http://localhost/api/counters/${counterId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "INACTIVE" }),
            }
          );

          // Start both real API handlers while the Counter is locked.
          const queuePromise = POST(queueRequest);

          const deactivatePromise = PATCH(deactivateRequest, {
            params: Promise.resolve({
              id: counterId.toString(),
            }),
          });

          await waitFor(() => routeSessions.size >= 2);

          // Allow the competing writes to reach MongoDB.
          await delay(200);

          // Release the deliberately held write.
          await blockerSession.commitTransaction();
          blockerActive = false;

          const [queueResponse, deactivateResponse] =
            await Promise.all([queuePromise, deactivatePromise]);

          const queueBody = await queueResponse.json();
          const deactivateBody = await deactivateResponse.json();

          console.log("MongoDB concurrency evidence:", {
            queueStatus: queueResponse.status,
            queueError: queueBody.error?.code ?? null,
            deactivateStatus: deactivateResponse.status,
            transactionSessions: routeSessions.size,
            transientFailures: transientFailures.size,
            retriedTransactions: retriedSessions.size,
          });

          expect(
            deactivateResponse.status,
            JSON.stringify(deactivateBody)
          ).toBe(200);

          expect([201, 409]).toContain(queueResponse.status);

          // Require actual conflict and retry evidence.
          expect(transientFailures.size).toBeGreaterThan(0);
          expect(retriedSessions.size).toBeGreaterThan(0);

          const finalCounter = await counters.findOne({
            _id: counterId,
          });

          expect(finalCounter.status).toBe("INACTIVE");

          const storedQueues = await queues
            .find({ counterId })
            .toArray();

          expect(
            storedQueues.filter((queue) => queue.isOpen)
          ).toHaveLength(0);

          const storedHistory = await history
            .find({ counterId })
            .toArray();

          if (queueResponse.status === 201) {
            expect(storedQueues).toHaveLength(1);
            expect(storedQueues[0].isOpen).toBe(false);
            expect(storedHistory).toHaveLength(2);
          } else {
            expect(storedQueues).toHaveLength(0);
            expect(storedHistory).toHaveLength(0);
          }
        } finally {
          if (blockerActive) {
            await blockerSession.abortTransaction().catch(() => {});
          }

          await blockerSession.endSession();

          await queues.deleteMany({ counterId });
          await history.deleteMany({ counterId });
          await counters.deleteOne({ _id: counterId });
          await messes.deleteOne({ _id: messId });
          await hostels.deleteOne({ _id: hostelId });
        }
      },
      120000
    );
  }
);
