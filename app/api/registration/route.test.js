import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { getRegistrationIntent } from "../../../lib/registration-context.js";
import { HOSTEL_COLLECTION, USER_ROLE } from "../../../lib/auth-contracts.js";

const { getAuthMock, signUpEmailMock, getMongoDbMock, collectionMock, hostelFindOneMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  signUpEmailMock: vi.fn(),
  getMongoDbMock: vi.fn(),
  collectionMock: vi.fn(),
  hostelFindOneMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../lib/auth.js", () => ({ getAuth: getAuthMock }));
vi.mock("../../../lib/mongodb.js", () => ({ getMongoDb: getMongoDbMock }));

const { POST } = await import("./route.js");
const HOSTEL_ID = "507F1F77BCF86CD799439011";
const CANONICAL_HOSTEL_ID = new ObjectId(HOSTEL_ID).toHexString();

function registrationRequest(body) {
  return new Request("http://localhost/api/registration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(accountType = USER_ROLE.STUDENT) {
  return {
    name: "Campus Member",
    email: " CAMPUS@EXAMPLE.TEST ",
    password: "a-secure-test-password",
    accountType,
    ...(accountType === USER_ROLE.STUDENT ? { hostelId: HOSTEL_ID } : {}),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("public registration API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hostelFindOneMock.mockResolvedValue({ _id: new ObjectId(CANONICAL_HOSTEL_ID), status: "ACTIVE" });
    collectionMock.mockImplementation((name) => {
      if (name !== HOSTEL_COLLECTION) throw new Error(`Unexpected collection ${name}`);
      return { findOne: hostelFindOneMock };
    });
    getMongoDbMock.mockResolvedValue({ collection: collectionMock });
    signUpEmailMock.mockResolvedValue({
      token: "must-not-be-returned",
      user: { id: "user-id", email: "campus@example.test", role: USER_ROLE.STUDENT, status: "PENDING" },
    });
    getAuthMock.mockResolvedValue({ api: { signUpEmail: signUpEmailMock } });
  });

  it.each([USER_ROLE.STUDENT, USER_ROLE.MESS_ADMIN])("registers %s through Better Auth with only credential fields", async (accountType) => {
    let intentDuringCreation;
    signUpEmailMock.mockImplementation(async (input) => {
      intentDuringCreation = getRegistrationIntent();
      return { token: "private-token", user: { id: "private-id", ...input.body } };
    });

    const response = await POST(registrationRequest(validBody(accountType)));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      success: true,
      data: { accountType, status: "PENDING" },
    });
    expect(payload).not.toHaveProperty("token");
    expect(JSON.stringify(payload)).not.toContain("private-id");
    expect(JSON.stringify(payload)).not.toContain("private-token");
    expect(intentDuringCreation).toEqual({
      accountType,
      ...(accountType === USER_ROLE.STUDENT ? { hostelId: CANONICAL_HOSTEL_ID } : {}),
    });
    expect(signUpEmailMock).toHaveBeenCalledWith({
      body: {
        name: "Campus Member",
        email: "campus@example.test",
        password: "a-secure-test-password",
      },
    });
    if (accountType === USER_ROLE.STUDENT) {
      expect(collectionMock).toHaveBeenCalledWith(HOSTEL_COLLECTION);
      expect(hostelFindOneMock).toHaveBeenCalledWith(
        { _id: new ObjectId(HOSTEL_ID), status: "ACTIVE" },
        { projection: { _id: 1 } },
      );
    } else {
      expect(getMongoDbMock).not.toHaveBeenCalled();
    }
  });

  it.each(["SUPER_ADMIN", "MESS_ADMINISTRATOR", ""])("rejects unsupported account type %s", async (accountType) => {
    const response = await POST(registrationRequest(validBody(accountType)));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "INVALID_ACCOUNT_TYPE" } });
    expect(getAuthMock).not.toHaveBeenCalled();
  });

  it.each([
    ["role", USER_ROLE.SUPER_ADMIN],
    ["status", "ACTIVE"],
  ])("rejects a client-supplied %s field", async (field, value) => {
    const response = await POST(registrationRequest({ ...validBody(), [field]: value }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "INVALID_FIELDS" } });
    expect(getAuthMock).not.toHaveBeenCalled();
  });

  it("rejects hostelId for Mess Admin registration without changing its four-field contract", async () => {
    const response = await POST(registrationRequest({
      ...validBody(USER_ROLE.MESS_ADMIN),
      hostelId: HOSTEL_ID,
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "INVALID_FIELDS" } });
    expect(getMongoDbMock).not.toHaveBeenCalled();
    expect(getAuthMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing name", { ...validBody(), name: " " }],
    ["invalid email", { ...validBody(), email: "not-an-email" }],
    ["invalid email domain", { ...validBody(), email: "person@example..test" }],
    ["consecutive dots in email local part", { ...validBody(), email: "user..name@example.com" }],
    ["numeric email top-level domain", { ...validBody(), email: "person@example.123" }],
    ["leading dot in email local part", { ...validBody(), email: ".person@example.com" }],
    ["missing Student Hostel", { ...validBody(), hostelId: undefined }],
    ["malformed Student Hostel ID", { ...validBody(), hostelId: "not-an-object-id" }],
    ["short password", { ...validBody(), password: "short" }],
    ["missing account type", { name: "Campus Member", email: "member@example.test", password: "a-secure-test-password" }],
  ])("rejects %s before account creation", async (_label, body) => {
    const response = await POST(registrationRequest(body));
    expect(response.status).toBe(400);
    expect(getAuthMock).not.toHaveBeenCalled();
  });

  it.each([
    ["nonexistent", null],
    ["inactive", { _id: new ObjectId(CANONICAL_HOSTEL_ID), status: "INACTIVE" }],
  ])("rejects a %s Hostel before creating a Student", async (_label, hostel) => {
    hostelFindOneMock.mockImplementation(async (filter) => (
      hostel?.status === filter.status && hostel._id.equals(filter._id) ? hostel : null
    ));

    const response = await POST(registrationRequest(validBody(USER_ROLE.STUDENT)));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "HOSTEL_UNAVAILABLE", message: "Select an available active Hostel." },
    });
    expect(getAuthMock).not.toHaveBeenCalled();
    expect(signUpEmailMock).not.toHaveBeenCalled();
  });

  it("returns the same safe response shape for Better Auth's generic duplicate-email result", async () => {
    signUpEmailMock.mockResolvedValue({
      token: null,
      user: { id: "synthetic-id", email: "campus@example.test", role: USER_ROLE.STUDENT, status: "PENDING" },
    });

    const response = await POST(registrationRequest(validBody(USER_ROLE.MESS_ADMIN)));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.data).toEqual({ accountType: USER_ROLE.MESS_ADMIN, status: "PENDING" });
    expect(JSON.stringify(payload)).not.toContain("synthetic-id");
    expect(JSON.stringify(payload)).not.toContain("campus@example.test");
  });

  it("keeps Student duplicate-email responses generic and excludes the Hostel ID", async () => {
    signUpEmailMock.mockResolvedValue({
      token: null,
      user: { id: "synthetic-id", email: "campus@example.test", role: USER_ROLE.STUDENT, status: "PENDING" },
    });

    const response = await POST(registrationRequest(validBody(USER_ROLE.STUDENT)));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.data).toEqual({ accountType: USER_ROLE.STUDENT, status: "PENDING" });
    expect(JSON.stringify(payload)).not.toContain("synthetic-id");
    expect(JSON.stringify(payload)).not.toContain("campus@example.test");
    expect(JSON.stringify(payload)).not.toContain(CANONICAL_HOSTEL_ID);
  });

  it("hides internal errors when Better Auth account creation fails", async () => {
    signUpEmailMock.mockRejectedValue(new Error("mongodb password or credential detail"));
    const response = await POST(registrationRequest(validBody()));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ success: false, error: { code: "REGISTRATION_UNAVAILABLE" } });
    expect(JSON.stringify(payload)).not.toContain("mongodb");
    expect(JSON.stringify(payload)).not.toContain("credential detail");
  });

  it("keeps overlapping registration intents isolated across asynchronous work", async () => {
    const bothRequestsArrived = deferred();
    const releaseRequests = deferred();
    const observedIntents = new Map();
    let arrived = 0;

    signUpEmailMock.mockImplementation(async ({ body }) => {
      arrived += 1;
      if (arrived === 2) bothRequestsArrived.resolve();
      await releaseRequests.promise;
      observedIntents.set(body.email, getRegistrationIntent());
      return { token: null, user: { id: body.email, email: body.email } };
    });

    const studentBody = { ...validBody(USER_ROLE.STUDENT), email: "student@example.test" };
    const messAdminBody = { ...validBody(USER_ROLE.MESS_ADMIN), email: "mess-admin@example.test" };
    const studentRequest = POST(registrationRequest(studentBody));
    const messAdminRequest = POST(registrationRequest(messAdminBody));

    await bothRequestsArrived.promise;
    releaseRequests.resolve();
    const [studentResponse, messAdminResponse] = await Promise.all([studentRequest, messAdminRequest]);

    expect(studentResponse.status).toBe(202);
    expect(messAdminResponse.status).toBe(202);
    expect(observedIntents.get(studentBody.email)).toEqual({ accountType: USER_ROLE.STUDENT, hostelId: CANONICAL_HOSTEL_ID });
    expect(observedIntents.get(messAdminBody.email)).toEqual({ accountType: USER_ROLE.MESS_ADMIN });
    expect(getRegistrationIntent()).toBeNull();
  });

  it("clears a rejected signup context before processing the next registration", async () => {
    signUpEmailMock.mockRejectedValueOnce(new Error("simulated signup failure"));

    const failedResponse = await POST(registrationRequest(validBody(USER_ROLE.STUDENT)));
    expect(failedResponse.status).toBe(503);
    expect(getRegistrationIntent()).toBeNull();

    let nextIntent;
    signUpEmailMock.mockImplementationOnce(async () => {
      nextIntent = getRegistrationIntent();
      return { token: null, user: { id: "private-id" } };
    });

    const nextResponse = await POST(registrationRequest(validBody(USER_ROLE.MESS_ADMIN)));
    const payload = await nextResponse.json();

    expect(nextResponse.status).toBe(202);
    expect(nextIntent).toEqual({ accountType: USER_ROLE.MESS_ADMIN });
    expect(payload.data).toEqual({ accountType: USER_ROLE.MESS_ADMIN, status: "PENDING" });
    expect(getRegistrationIntent()).toBeNull();
  });
});
