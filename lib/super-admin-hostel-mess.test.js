import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const { getMongoDbMock, getMongoClientMock, ensureIndexesMock } = vi.hoisted(() => ({
  getMongoDbMock: vi.fn(),
  getMongoClientMock: vi.fn(),
  ensureIndexesMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./mongodb.js", () => ({ getMongoDb: getMongoDbMock, getMongoClient: getMongoClientMock }));
vi.mock("./domain-indexes.js", () => ({ ensureDomainIndexes: ensureIndexesMock }));

const {
  createHostel,
  listHostels,
  getHostel,
  updateHostel,
  setHostelStatus,
  createMess,
  listMesses,
  getMess,
  updateMess,
  setMessStatus,
} = await import("./super-admin-hostel-mess.js");

const actor = { id: new ObjectId().toHexString(), role: "SUPER_ADMIN" };
const hostelId = new ObjectId();
const anotherHostelId = new ObjectId();
const messId = new ObjectId();

function sameId(left, right) {
  if (left instanceof ObjectId && right instanceof ObjectId) return left.equals(right);
  return left === right;
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    const actual = document[key];
    if (value && typeof value === "object" && "$ne" in value) return !sameId(actual, value.$ne);
    if (value && typeof value === "object" && "$in" in value) return value.$in.some((item) => sameId(actual, item));
    return sameId(actual, value);
  });
}

function createHarness({ hostels, messes, queues, failHistory = false } = {}) {
  const state = {
    hostels: hostels ?? [{ _id: hostelId, name: "North Hall", code: "NORTH", status: "ACTIVE", queueMutationVersion: 2, createdAt: new Date(), updatedAt: new Date(), createdBy: new ObjectId(actor.id) }],
    messes: messes ?? [{ _id: messId, hostelId, name: "Main Mess", code: "MAIN", description: "Dining", mealTypes: ["LUNCH"], status: "ACTIVE", queueMutationVersion: 3, createdAt: new Date(), updatedAt: new Date(), createdBy: new ObjectId(actor.id) }],
    queues: queues ?? [],
    queueHistory: [],
  };
  const maybeFailHistory = async (document) => {
    if (failHistory) throw new Error("history write failed");
    state.queueHistory.push(document);
  };
  const collection = (name) => {
    const docs = state[name];
    return {
      find: vi.fn((filter = {}) => {
        const found = docs.filter((document) => matches(document, filter)).map((document) => ({ ...document }));
        return { sort: () => ({ toArray: async () => found }), toArray: async () => found };
      }),
      findOne: vi.fn(async (filter = {}) => {
        const document = docs.find((item) => matches(item, filter));
        return document ? { ...document } : null;
      }),
      insertOne: vi.fn(async (document) => {
        if (name === "queueHistory") {
          await maybeFailHistory(document);
        } else {
          docs.push(document);
        }
        return { insertedId: document._id };
      }),
      updateOne: vi.fn(async (filter, update) => {
        const document = docs.find((item) => matches(item, filter));
        if (!document) return { matchedCount: 0, modifiedCount: 0 };
        Object.assign(document, update.$set ?? {});
        for (const [key, amount] of Object.entries(update.$inc ?? {})) document[key] = (document[key] ?? 0) + amount;
        return { matchedCount: 1, modifiedCount: 1 };
      }),
      updateMany: vi.fn(async (filter, update) => {
        const found = docs.filter((document) => matches(document, filter));
        for (const document of found) {
          Object.assign(document, update.$set ?? {});
          for (const [key, amount] of Object.entries(update.$inc ?? {})) document[key] = (document[key] ?? 0) + amount;
        }
        return { matchedCount: found.length, modifiedCount: found.length };
      }),
    };
  };
  const collections = Object.fromEntries(["hostels", "messes", "queues", "queueHistory"].map((name) => [name, collection(name)]));
  const db = { collection: (name) => collections[name] };
  const snapshot = () => Object.fromEntries(Object.entries(state).map(([name, docs]) => [name, docs.map((doc) => ({ ...doc }))]));
  const restore = (saved) => {
    for (const [name, docs] of Object.entries(saved)) state[name].splice(0, state[name].length, ...docs);
  };
  const session = {
    withTransaction: vi.fn(async (callback) => {
      const saved = snapshot();
      try {
        return await callback();
      } catch (error) {
        restore(saved);
        throw error;
      }
    }),
    endSession: vi.fn(async () => {}),
  };
  getMongoDbMock.mockResolvedValue(db);
  getMongoClientMock.mockResolvedValue({ startSession: () => session });
  return { state, db, collections, session };
}

function openQueue(overrides = {}) {
  return {
    _id: new ObjectId(),
    hostelId,
    messId,
    counterId: new ObjectId(),
    mealType: "LUNCH",
    sessionId: "queue-session-1",
    peopleWaiting: 12,
    servingRatePerMinute: 4,
    estimatedWaitMinutes: 3,
    crowdLevel: "moderate",
    status: "busy",
    isOpen: true,
    ...overrides,
  };
}

describe("Super Admin Hostel and Mess domain operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureIndexesMock.mockResolvedValue({ success: true });
  });

  it("lists, reads, creates, and updates Hostels with server-owned fields", async () => {
    const h = createHarness();
    const listed = await listHostels();
    expect(listed[0].id).toBe(hostelId.toHexString());
    expect((await getHostel(hostelId.toHexString())).code).toBe("NORTH");
    const created = await createHostel({ name: "  South Hall ", code: " south-1 ", description: " New " }, actor);
    expect(created).toMatchObject({ name: "South Hall", code: "SOUTH-1", description: "New", status: "ACTIVE", queueMutationVersion: 0 });
    expect(h.state.hostels[1].createdBy).toEqual(new ObjectId(actor.id));
    expect(await updateHostel(hostelId.toHexString(), { name: "Renamed Hall" })).toMatchObject({ name: "Renamed Hall", code: "NORTH" });
    expect(ensureIndexesMock).toHaveBeenCalled();
  });

  it("validates Hostel fields and rejects caller-controlled fields", async () => {
    createHarness();
    await expect(createHostel({ name: "X", code: "NO" }, actor)).rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(createHostel({ name: "Hall", code: "bad code" }, actor)).rejects.toMatchObject({ code: "INVALID_CODE" });
    await expect(createHostel({ name: "Hall", code: "VALID", description: "d".repeat(251) }, actor)).rejects.toMatchObject({ code: "INVALID_DESCRIPTION" });
    await expect(createHostel({ name: "Hall", code: "VALID", status: "INACTIVE" }, actor)).rejects.toMatchObject({ code: "INVALID_FIELDS" });
    await expect(updateHostel("bad-id", { name: "Hall" })).rejects.toThrow(/valid MongoDB ObjectId/);
  });

  it("maps duplicate unique-index errors to a conflict", async () => {
    const h = createHarness();
    h.collections.hostels.insertOne.mockRejectedValueOnce({ code: 11000 });
    await expect(createHostel({ name: "South Hall", code: "NORTH" }, actor)).rejects.toMatchObject({ status: 409, code: "DUPLICATE_CODE" });
  });

  it("lists and creates Messes only under an active Hostel", async () => {
    const h = createHarness();
    expect((await listMesses(hostelId.toHexString()))[0].hostelId).toBe(hostelId.toHexString());
    const created = await createMess(hostelId.toHexString(), { name: "Evening Mess", code: "EVE-1", mealTypes: ["DINNER", "SNACKS"] }, actor);
    expect(created).toMatchObject({ hostelId: hostelId.toHexString(), mealTypes: ["DINNER", "SNACKS"], status: "ACTIVE", queueMutationVersion: 0 });
    expect(h.collections.hostels.updateOne).toHaveBeenCalledWith(
      { _id: hostelId, status: "ACTIVE" },
      { $inc: { queueMutationVersion: 1 } },
      { session: h.session },
    );
  });

  it("rejects invalid meal types and creation under an inactive Hostel", async () => {
    createHarness();
    await expect(createMess(hostelId.toHexString(), { name: "Cafe", code: "CAF-1", mealTypes: [] }, actor)).rejects.toMatchObject({ code: "INVALID_MEAL_TYPES" });
    await expect(createMess(hostelId.toHexString(), { name: "Cafe", code: "CAF-1", mealTypes: ["LUNCH", "LUNCH"] }, actor)).rejects.toMatchObject({ code: "INVALID_MEAL_TYPES" });
    await expect(createMess(hostelId.toHexString(), { name: "Cafe", code: "CAF-1", mealTypes: ["BRUNCH"] }, actor)).rejects.toMatchObject({ code: "INVALID_MEAL_TYPES" });
    const inactive = createHarness({ hostels: [{ _id: hostelId, status: "INACTIVE" }] });
    await expect(createMess(hostelId.toHexString(), { name: "Cafe", code: "CAF-1", mealTypes: ["LUNCH"] }, actor)).rejects.toMatchObject({ status: 409, code: "HOSTEL_INACTIVE" });
    expect(inactive.collections.messes.insertOne).not.toHaveBeenCalled();
  });

  it("validates Mess names, codes, descriptions, and duplicate codes", async () => {
    const h = createHarness();
    await expect(createMess(hostelId.toHexString(), { name: "A", code: "MESS-1", mealTypes: ["LUNCH"] }, actor)).rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(createMess(hostelId.toHexString(), { name: "Cafe", code: "bad_code", mealTypes: ["LUNCH"] }, actor)).rejects.toMatchObject({ code: "INVALID_CODE" });
    await expect(createMess(hostelId.toHexString(), { name: "Cafe", code: "CAF-1", description: "d".repeat(251), mealTypes: ["LUNCH"] }, actor)).rejects.toMatchObject({ code: "INVALID_DESCRIPTION" });
    h.collections.messes.insertOne.mockRejectedValueOnce({ code: 11000 });
    await expect(createMess(hostelId.toHexString(), { name: "Cafe", code: "CAF-1", mealTypes: ["LUNCH"] }, actor)).rejects.toMatchObject({ status: 409, code: "DUPLICATE_CODE" });
  });

  it("enforces parent Hostel ownership for Mess reads and updates", async () => {
    createHarness();
    await expect(getMess(anotherHostelId.toHexString(), messId.toHexString())).rejects.toMatchObject({ status: 404, code: "MESS_NOT_FOUND" });
    await expect(updateMess(anotherHostelId.toHexString(), messId.toHexString(), { name: "Other Mess" })).rejects.toMatchObject({ status: 404, code: "MESS_NOT_FOUND" });
    await expect(updateMess(hostelId.toHexString(), messId.toHexString(), { hostelId: anotherHostelId.toHexString() })).rejects.toMatchObject({ code: "INVALID_FIELDS" });
    expect((await getMess(hostelId.toHexString(), messId.toHexString())).id).toBe(messId.toHexString());
  });

  it("updates Mess details and reports duplicate Mess codes as conflicts", async () => {
    const h = createHarness();
    expect(await updateMess(hostelId.toHexString(), messId.toHexString(), { name: "Updated Mess", mealTypes: ["BREAKFAST", "LUNCH"] })).toMatchObject({ name: "Updated Mess", mealTypes: ["BREAKFAST", "LUNCH"] });
    h.collections.messes.updateOne.mockRejectedValueOnce({ code: 11000 });
    await expect(updateMess(hostelId.toHexString(), messId.toHexString(), { code: "TAKEN" })).rejects.toMatchObject({ status: 409, code: "DUPLICATE_CODE" });
  });

  it("deactivates a Hostel, all child Messes, open Queues, and appends history atomically", async () => {
    const queue = openQueue();
    const child = { _id: new ObjectId(), hostelId, name: "Child", code: "CHILD", mealTypes: ["LUNCH"], status: "ACTIVE", queueMutationVersion: 4 };
    const h = createHarness({ queues: [queue], messes: [child] });
    const result = await setHostelStatus(hostelId.toHexString(), "INACTIVE", actor);
    expect(result.status).toBe("INACTIVE");
    expect(h.session.withTransaction).toHaveBeenCalledOnce();
    expect(h.collections.hostels.updateOne).toHaveBeenCalledWith(
      { _id: hostelId, status: "ACTIVE" },
      { $set: { status: "INACTIVE", updatedAt: expect.any(Date) }, $inc: { queueMutationVersion: 1 } },
      { session: h.session },
    );
    expect(child).toMatchObject({ status: "INACTIVE", queueMutationVersion: 5 });
    expect(queue.isOpen).toBe(false);
    expect(h.state.queueHistory).toHaveLength(1);
    expect(h.state.queueHistory[0]).toMatchObject({ queueId: queue._id, isOpen: false, status: "closed", updatedBy: actor.id });
    expect(h.state.queues).toHaveLength(1);
  });

  it("deactivates only the selected Mess and preserves Queue history", async () => {
    const target = { _id: messId, hostelId, name: "Main", code: "MAIN", mealTypes: ["LUNCH"], status: "ACTIVE", queueMutationVersion: 2 };
    const otherMess = new ObjectId();
    const queues = [openQueue(), openQueue({ _id: new ObjectId(), messId: otherMess, sessionId: "other-session" })];
    const h = createHarness({ messes: [target], queues });
    const result = await setMessStatus(hostelId.toHexString(), messId.toHexString(), "INACTIVE", actor);
    expect(result.status).toBe("INACTIVE");
    expect(target.queueMutationVersion).toBe(3);
    expect(h.collections.queues.find).toHaveBeenCalledWith({ messId, isOpen: true }, { session: h.session });
    expect(h.collections.queues.updateOne).toHaveBeenCalledOnce();
    expect(h.collections.messes.updateOne).toHaveBeenCalledWith(
      { _id: messId, hostelId, status: "ACTIVE" },
      { $set: { status: "INACTIVE", updatedAt: expect.any(Date) }, $inc: { queueMutationVersion: 1 } },
      { session: h.session },
    );
    expect(queues[0].isOpen).toBe(false);
    expect(queues[1].isOpen).toBe(true);
    expect(h.state.queueHistory).toHaveLength(1);
    expect(h.state.queues).toHaveLength(2);
  });

  it("closes lingering Queues on repeated Mess deactivation without incrementing its version", async () => {
    const target = { _id: messId, hostelId, name: "Main", code: "MAIN", mealTypes: ["LUNCH"], status: "INACTIVE", queueMutationVersion: 7 };
    const otherMess = new ObjectId();
    const queues = [openQueue(), openQueue({ _id: new ObjectId(), messId: otherMess, sessionId: "other-session" })];
    const h = createHarness({ messes: [target], queues });

    const result = await setMessStatus(hostelId.toHexString(), messId.toHexString(), "INACTIVE", actor);

    expect(result).toMatchObject({ status: "INACTIVE", queueMutationVersion: 7 });
    expect(h.collections.messes.updateOne).toHaveBeenCalledWith(
      { _id: messId, hostelId, status: "INACTIVE" },
      { $set: { status: "INACTIVE", updatedAt: expect.any(Date) } },
      { session: h.session },
    );
    expect(h.collections.queues.find).toHaveBeenCalledWith({ messId, isOpen: true }, { session: h.session });
    expect(h.collections.queues.updateOne).toHaveBeenCalledOnce();
    expect(queues[0].isOpen).toBe(false);
    expect(queues[1].isOpen).toBe(true);
    expect(h.state.queues).toHaveLength(2);
    expect(h.state.queueHistory).toHaveLength(1);
    expect(h.state.queueHistory[0]).toMatchObject({ queueId: queues[0]._id, messId, isOpen: false, status: "closed", updatedBy: actor.id });
  });

  it("reactivates only the requested entity without reopening Queues or child Messes", async () => {
    const hostel = { _id: hostelId, name: "North", code: "NORTH", status: "INACTIVE", queueMutationVersion: 2 };
    const child = { _id: messId, hostelId, name: "Main", code: "MAIN", mealTypes: ["LUNCH"], status: "INACTIVE", queueMutationVersion: 4 };
    const closed = openQueue({ isOpen: false, status: "closed" });
    const h = createHarness({ hostels: [hostel], messes: [child], queues: [closed] });
    await setHostelStatus(hostelId.toHexString(), "ACTIVE", actor);
    expect(hostel.status).toBe("ACTIVE");
    expect(child.status).toBe("INACTIVE");
    expect(closed.isOpen).toBe(false);
    expect(h.state.queueHistory).toHaveLength(0);
    await expect(setMessStatus(hostelId.toHexString(), messId.toHexString(), "ACTIVE", actor)).resolves.toMatchObject({ status: "ACTIVE" });
    expect(closed.isOpen).toBe(false);
  });

  it("rolls back status, Queue, and history writes when the history insert fails", async () => {
    const queue = openQueue();
    const h = createHarness({ queues: [queue], failHistory: true });
    await expect(setMessStatus(hostelId.toHexString(), messId.toHexString(), "INACTIVE", actor)).rejects.toThrow("history write failed");
    expect(h.state.messes[0].status).toBe("ACTIVE");
    expect(h.state.queues[0].isOpen).toBe(true);
    expect(h.state.queueHistory).toHaveLength(0);
    expect(h.session.endSession).toHaveBeenCalledOnce();
  });

  it("rejects unsupported activation status values", async () => {
    createHarness();
    await expect(setHostelStatus(hostelId.toHexString(), "DELETED", actor)).rejects.toMatchObject({ code: "INVALID_STATUS" });
    await expect(setMessStatus(hostelId.toHexString(), messId.toHexString(), "DELETED", actor)).rejects.toMatchObject({ code: "INVALID_STATUS" });
  });
});
