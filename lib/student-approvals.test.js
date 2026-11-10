import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { ACCOUNT_STATUS, USER_COLLECTION, USER_ROLE } from "./auth-contracts.js";

const { getMongoDbMock } = vi.hoisted(() => ({ getMongoDbMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("./mongodb.js", () => ({ getMongoDb: getMongoDbMock }));

const { approveStudent, rejectStudent, StudentApprovalError, STUDENT_APPROVAL_ERROR } =
  await import("./student-approvals.js");

const STUDENT_ID = new ObjectId();
const HOSTEL_ID = new ObjectId().toHexString();

function matches(document, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (actual instanceof ObjectId && expected instanceof ObjectId) return actual.equals(expected);
    return actual === expected;
  });
}

function createHarness(records) {
  const state = { records };
  const users = {
    updateOne: vi.fn(async (filter, update) => {
      // Synchronous compare-and-set before resolving models MongoDB's atomic
      // single-document conditional update behavior for concurrency tests.
      const record = state.records.find((item) => matches(item, filter));
      if (!record) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(record, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    }),
    findOne: vi.fn(async (filter, options = {}) => {
      const record = state.records.find((item) => matches(item, filter));
      if (!record) return null;
      const projection = options.projection;
      return projection
        ? Object.fromEntries(Object.keys(projection)
          .filter((key) => projection[key] && record[key] !== undefined)
          .map((key) => [key, record[key]]))
        : record;
    }),
  };
  getMongoDbMock.mockResolvedValue({
    collection: (name) => {
      if (name !== USER_COLLECTION) throw new Error(`Unexpected collection: ${name}`);
      return users;
    },
  });
  return { state, users };
}

function makeStudent(overrides = {}) {
  return {
    _id: STUDENT_ID,
    name: "Student Example",
    email: "student@example.test",
    role: USER_ROLE.STUDENT,
    status: ACCOUNT_STATUS.PENDING,
    hostelId: HOSTEL_ID,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    password: "never-return-this",
    account: { password: "never-return-this" },
    ...overrides,
  };
}

describe("shared Student approval service", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["approve", approveStudent, ACCOUNT_STATUS.ACTIVE],
    ["reject", rejectStudent, ACCOUNT_STATUS.REJECTED],
  ])("conditionally %ss a pending Student and returns only safe fields", async (_label, decide, status) => {
    const student = makeStudent();
    const { users } = createHarness([student]);

    const result = await decide(STUDENT_ID.toHexString());

    expect(users.updateOne).toHaveBeenCalledWith(
      { _id: STUDENT_ID, role: USER_ROLE.STUDENT, status: ACCOUNT_STATUS.PENDING },
      { $set: { status, updatedAt: expect.any(Date) } },
    );
    expect(student.hostelId).toBe(HOSTEL_ID);
    expect(result).toEqual({
      id: STUDENT_ID.toHexString(),
      name: "Student Example",
      email: "student@example.test",
      status,
      hostelId: HOSTEL_ID,
      createdAt: student.createdAt,
      updatedAt: expect.any(Date),
    });
    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("account");
  });

  it("adds the authenticated Hostel scope to the atomic filter", async () => {
    const { users } = createHarness([makeStudent()]);
    await approveStudent(STUDENT_ID.toHexString(), { expectedHostelId: HOSTEL_ID });
    expect(users.updateOne.mock.calls[0][0]).toEqual({
      _id: STUDENT_ID,
      role: USER_ROLE.STUDENT,
      status: ACCOUNT_STATUS.PENDING,
      hostelId: HOSTEL_ID,
    });
  });

  it("rejects malformed Student IDs before database access", async () => {
    createHarness([]);
    await expect(approveStudent("invalid")).rejects.toMatchObject({
      name: "StudentApprovalError",
      code: STUDENT_APPROVAL_ERROR.INVALID_ID,
      status: 400,
    });
    expect(getMongoDbMock).not.toHaveBeenCalled();
  });

  it("rejects malformed server-authorized Hostel scope before database access", async () => {
    createHarness([makeStudent()]);
    await expect(approveStudent(STUDENT_ID.toHexString(), { expectedHostelId: "not-an-object-id" }))
      .rejects.toMatchObject({
        name: "StudentApprovalError",
        code: "INVALID_HOSTEL_SCOPE",
        status: 400,
      });
    expect(getMongoDbMock).not.toHaveBeenCalled();
  });

  it("returns a typed not-found error for a missing Student", async () => {
    createHarness([]);
    await expect(approveStudent(STUDENT_ID.toHexString())).rejects.toMatchObject({
      code: STUDENT_APPROVAL_ERROR.NOT_FOUND,
      status: 404,
    });
  });

  it("distinguishes accounts with the wrong role", async () => {
    createHarness([makeStudent({ role: USER_ROLE.MESS_ADMIN })]);
    await expect(approveStudent(STUDENT_ID.toHexString())).rejects.toMatchObject({
      code: STUDENT_APPROVAL_ERROR.WRONG_ROLE,
      status: 409,
    });
  });

  it.each([ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.REJECTED, ACCOUNT_STATUS.SUSPENDED])(
    "does not change a Student whose status is %s",
    async (status) => {
      const { state } = createHarness([makeStudent({ status })]);
      await expect(rejectStudent(STUDENT_ID.toHexString())).rejects.toMatchObject({
        code: STUDENT_APPROVAL_ERROR.NOT_PENDING,
        status: 409,
      });
      expect(state.records[0].status).toBe(status);
    },
  );

  it("hides out-of-scope Students from a Hostel-scoped caller", async () => {
    createHarness([makeStudent({ hostelId: new ObjectId().toHexString() })]);
    await expect(approveStudent(STUDENT_ID.toHexString(), { expectedHostelId: HOSTEL_ID }))
      .rejects.toMatchObject({ code: STUDENT_APPROVAL_ERROR.NOT_FOUND, status: 404 });
  });

  it("allows only one of concurrent approve/reject decisions to succeed", async () => {
    const student = makeStudent();
    const { state, users } = createHarness([student]);
    const results = await Promise.allSettled([
      approveStudent(STUDENT_ID.toHexString()),
      rejectStudent(STUDENT_ID.toHexString()),
    ]);

    expect(users.updateOne).toHaveBeenCalledTimes(2);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const conflict = results.find((result) => result.status === "rejected");
    expect(conflict.reason).toBeInstanceOf(StudentApprovalError);
    expect(conflict.reason.code).toBe(STUDENT_APPROVAL_ERROR.NOT_PENDING);
    expect([ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.REJECTED]).toContain(state.records[0].status);
    expect(state.records[0].hostelId).toBe(HOSTEL_ID);
  });
});
