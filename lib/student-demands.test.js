import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const { requireActiveRoleMock, getMongoDbMock } = vi.hoisted(() => ({
  requireActiveRoleMock: vi.fn(),
  getMongoDbMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./auth-authorization.js", () => ({ requireActiveRole: requireActiveRoleMock }));
vi.mock("./mongodb.js", () => ({ getMongoDb: getMongoDbMock }));

const {
  STUDENT_DEMAND_COLLECTION,
  STUDENT_DEMAND_ERROR,
  STUDENT_DEMAND_PORTION_WEIGHT,
  STUDENT_DEMAND_STATUS,
  StudentDemandError,
  createStudentDemandDocument,
  ensureStudentDemandIndexes,
  listActiveStudentMesses,
  resolveStudentDemandContext,
  validateStudentDemandSelection,
} = await import("./student-demands.js");
const { USER_ROLE } = await import("./auth-contracts.js");

const STUDENT_ID = "507f1f77bcf86cd799439011";
const HOSTEL_ID = "507f1f77bcf86cd799439012";
const MESS_A_ID = "507f1f77bcf86cd799439013";
const MESS_B_ID = "507f1f77bcf86cd799439014";
const NOW = new Date("2026-06-15T12:00:00.000Z");
const ARRIVAL = "2026-06-15T18:30:00+05:30";

function setupDatabase({ hostel = { _id: new ObjectId(HOSTEL_ID) }, messes = [] } = {}) {
  const messFind = vi.fn(() => ({
    sort: vi.fn(() => ({ toArray: vi.fn(async () => messes) })),
  }));
  const hostelFindOne = vi.fn(async () => hostel);
  const createIndex = vi.fn(async () => "studentId_1_serviceDate_1_slotId_1");
  const db = {
    collection: vi.fn((name) => {
      if (name === "hostels") return { findOne: hostelFindOne };
      if (name === "messes") return { find: messFind };
      if (name === STUDENT_DEMAND_COLLECTION) return { createIndex };
      throw new Error(`Unexpected collection: ${name}`);
    }),
  };
  getMongoDbMock.mockResolvedValue(db);
  return { db, hostelFindOne, messFind, createIndex };
}

function activeStudent() {
  requireActiveRoleMock.mockResolvedValue({
    id: STUDENT_ID,
    role: USER_ROLE.STUDENT,
    status: "ACTIVE",
    hostelId: HOSTEL_ID,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Student demand contract", () => {
  it("maps canonical meal types to lowercase Kitchen slot IDs and server-owned portion weights", () => {
    expect(validateStudentDemandSelection({
      mealType: "SNACKS",
      portion: "LARGE",
      expectedArrivalAt: ARRIVAL,
    })).toEqual({
      mealType: "SNACKS",
      slotId: "snacks",
      portion: "LARGE",
      portionWeight: 1.5,
      expectedArrivalAt: ARRIVAL,
    });
    expect(STUDENT_DEMAND_PORTION_WEIGHT.REGULAR).toBe(1.0);
  });

  it("builds an ObjectId-backed document from the authenticated session with India service date and lifecycle timestamps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    activeStudent();
    setupDatabase({ messes: [{ _id: new ObjectId(MESS_A_ID) }] });
    const document = await createStudentDemandDocument({
      selection: { mealType: "LUNCH", portion: "REGULAR", expectedArrivalAt: ARRIVAL },
    });

    expect(document).toMatchObject({
      studentId: new ObjectId(STUDENT_ID),
      hostelId: new ObjectId(HOSTEL_ID),
      messId: new ObjectId(MESS_A_ID),
      mealType: "LUNCH",
      slotId: "lunch",
      serviceDate: "2026-06-15",
      portion: "REGULAR",
      portionWeight: 1,
      expectedArrivalAt: ARRIVAL,
      status: STUDENT_DEMAND_STATUS.ACTIVE,
      cancelledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("uses the Asia/Kolkata service date across midnight instead of UTC date boundaries", async () => {
    activeStudent();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T18:30:00.000Z"));
    setupDatabase({ messes: [{ _id: new ObjectId(MESS_A_ID) }] });
    const document = await createStudentDemandDocument({
      selection: { mealType: "DINNER", portion: "REGULAR", expectedArrivalAt: "2026-06-16T00:05:00+05:30" },
    });
    expect(document.serviceDate).toBe("2026-06-16");
  });

  it("rejects unsupported fields, meal types, portions, invalid offsets, and a different service date", async () => {
    expect(() => validateStudentDemandSelection({
      mealType: "BRUNCH", portion: "REGULAR", expectedArrivalAt: ARRIVAL,
    })).toThrow(StudentDemandError);
    expect(() => validateStudentDemandSelection({
      mealType: "DINNER", portion: "XL", expectedArrivalAt: ARRIVAL,
    })).toThrow(StudentDemandError);
    expect(() => validateStudentDemandSelection({
      mealType: "DINNER", portion: "LARGE", expectedArrivalAt: "2026-06-15T18:30:00Z",
    })).toThrowError(expect.objectContaining({ code: STUDENT_DEMAND_ERROR.INVALID_ARRIVAL }));
    expect(() => validateStudentDemandSelection({
      mealType: "DINNER", portion: "LARGE", expectedArrivalAt: "2026-02-31T18:30:00+05:30",
    })).toThrowError(expect.objectContaining({ code: STUDENT_DEMAND_ERROR.INVALID_ARRIVAL }));
    expect(() => validateStudentDemandSelection({
      mealType: "DINNER", portion: "LARGE", expectedArrivalAt: ARRIVAL, status: "ACTIVE",
    })).toThrowError(expect.objectContaining({ code: STUDENT_DEMAND_ERROR.INVALID_SELECTION }));
    activeStudent();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    setupDatabase({ messes: [{ _id: new ObjectId(MESS_A_ID) }] });
    await expect(createStudentDemandDocument({
      selection: { mealType: "LUNCH", portion: "REGULAR", expectedArrivalAt: "2026-06-16T08:00:00+05:30" },
    })).rejects.toMatchObject({ code: STUDENT_DEMAND_ERROR.ARRIVAL_DATE_MISMATCH });
  });

  it("rejects invalid authenticated Student or Hostel identifiers", async () => {
    requireActiveRoleMock.mockResolvedValue({
      id: "invalid", role: USER_ROLE.STUDENT, status: "ACTIVE", hostelId: HOSTEL_ID,
    });
    await expect(createStudentDemandDocument({
      selection: { mealType: "LUNCH", portion: "REGULAR", expectedArrivalAt: ARRIVAL }, now: NOW,
    })).rejects.toMatchObject({ code: STUDENT_DEMAND_ERROR.INVALID_IDENTITY });
  });

  it("declares the unique one-demand-per-student-date-slot identity", async () => {
    const { createIndex } = setupDatabase();
    await ensureStudentDemandIndexes(await getMongoDbMock());

    expect(createIndex).toHaveBeenCalledWith(
      { studentId: 1, serviceDate: 1, slotId: 1 },
      { unique: true, name: "studentId_1_serviceDate_1_slotId_1" },
    );
  });

  it("propagates index creation failures instead of pretending the uniqueness constraint exists", async () => {
    const { db } = setupDatabase();
    const failure = new Error("index creation failed");
    db.collection = vi.fn(() => ({ createIndex: vi.fn().mockRejectedValue(failure) }));

    await expect(ensureStudentDemandIndexes(db)).rejects.toBe(failure);
  });
});

describe("Student Mess resolution", () => {
  it("automatically selects the only active Mess in the authenticated Student's Hostel", async () => {
    activeStudent();
    const mess = { _id: new ObjectId(MESS_A_ID) };
    const { hostelFindOne, messFind } = setupDatabase({ messes: [mess] });

    await expect(resolveStudentDemandContext()).resolves.toEqual({
      studentId: new ObjectId(STUDENT_ID),
      hostelId: new ObjectId(HOSTEL_ID),
      messId: mess._id,
    });
    expect(requireActiveRoleMock).toHaveBeenCalledWith(USER_ROLE.STUDENT);
    expect(hostelFindOne).toHaveBeenCalledWith(
      { _id: new ObjectId(HOSTEL_ID), status: "ACTIVE" },
      { projection: { _id: 1 } },
    );
    expect(messFind).toHaveBeenCalledWith(
      { hostelId: new ObjectId(HOSTEL_ID), status: "ACTIVE" },
      { projection: { _id: 1 } },
    );
  });

  it("lists only safe active Mess fields from the authenticated Student's active Hostel", async () => {
    activeStudent();
    const messes = [{
      _id: new ObjectId(MESS_A_ID), name: "North Mess", code: "NORTH", status: "ACTIVE", privateField: "do not return",
    }];
    const { messFind } = setupDatabase({ messes });

    await expect(listActiveStudentMesses()).resolves.toEqual([{
      id: MESS_A_ID,
      name: "North Mess",
      code: "NORTH",
    }]);
    expect(messFind).toHaveBeenCalledWith(
      { hostelId: new ObjectId(HOSTEL_ID), status: "ACTIVE" },
      { projection: { _id: 1, name: 1, code: 1 } },
    );
  });

  it("requires selection when multiple active Messes exist and accepts a selected one", async () => {
    activeStudent();
    const messes = [new ObjectId(MESS_A_ID), new ObjectId(MESS_B_ID)].map((_id) => ({ _id }));
    setupDatabase({ messes });

    await expect(resolveStudentDemandContext()).rejects.toMatchObject({
      code: STUDENT_DEMAND_ERROR.MESS_SELECTION_REQUIRED,
      status: 400,
    });
    await expect(resolveStudentDemandContext(MESS_B_ID)).resolves.toMatchObject({
      messId: new ObjectId(MESS_B_ID),
      hostelId: new ObjectId(HOSTEL_ID),
    });
  });

  it("rejects missing or inactive Mess availability", async () => {
    activeStudent();
    setupDatabase({ messes: [] });
    await expect(resolveStudentDemandContext()).rejects.toMatchObject({
      code: STUDENT_DEMAND_ERROR.NO_ACTIVE_MESS,
      status: 409,
    });
  });

  it("rejects a selected Mess that is inactive, nonexistent, or outside the Hostel scope", async () => {
    activeStudent();
    setupDatabase({ messes: [{ _id: new ObjectId(MESS_A_ID) }] });

    await expect(resolveStudentDemandContext(MESS_B_ID)).rejects.toMatchObject({
      code: STUDENT_DEMAND_ERROR.MESS_UNAVAILABLE,
      status: 400,
    });
    await expect(resolveStudentDemandContext("not-an-object-id")).rejects.toMatchObject({
      code: STUDENT_DEMAND_ERROR.MESS_UNAVAILABLE,
      status: 400,
    });
  });

  it("rejects a missing or inactive Hostel before resolving Messes", async () => {
    activeStudent();
    setupDatabase({ hostel: null, messes: [{ _id: new ObjectId(MESS_A_ID) }] });

    await expect(resolveStudentDemandContext()).rejects.toMatchObject({
      code: STUDENT_DEMAND_ERROR.HOSTEL_UNAVAILABLE,
      status: 403,
    });
  });

  it("stops before database access when the active Student guard rejects the caller", async () => {
    requireActiveRoleMock.mockRejectedValue(new Error("Active Student access required."));
    const { db } = setupDatabase();

    await expect(resolveStudentDemandContext()).rejects.toThrow("Active Student access required.");
    expect(getMongoDbMock).not.toHaveBeenCalled();
    expect(db.collection).not.toHaveBeenCalled();
  });
});
