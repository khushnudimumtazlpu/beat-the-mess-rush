import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { ACCOUNT_STATUS, ROLE_VALUES, STATUS_VALUES, USER_ROLE } from "./auth-contracts.js";
import { withRegistrationIntent } from "./registration-context.js";

vi.mock("server-only", () => ({}));
vi.mock("better-auth", () => ({
  betterAuth: vi.fn((options) => ({ options })),
}));
vi.mock("@better-auth/mongo-adapter", () => ({
  mongodbAdapter: vi.fn(() => "mock-database-adapter"),
}));
vi.mock("./mongodb.js", () => ({
  getMongoClient: vi.fn(async () => "mock-mongo-client"),
  getMongoDb: vi.fn(async () => "mock-mongo-database"),
}));

const { betterAuth } = await import("better-auth");
const { getAuth } = await import("./auth.js");
const HOSTEL_ID = new ObjectId("507f1f77bcf86cd799439011").toHexString();

describe("Better Auth configuration", () => {
  afterEach(() => {
    delete globalThis.__rushlessAuthPromise;
    delete globalThis.__rushlessAuthRegistrationIntentStorage;
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_BRANCH_URL;
    vi.clearAllMocks();
  });

  it("uses the shared role and account status contracts for custom fields", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-value-with-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";

    await expect(getAuth()).resolves.toBeDefined();

    const config = betterAuth.mock.calls[0][0];
    expect(config.emailAndPassword.autoSignIn).toBe(false);
    expect(config.user.additionalFields.role.type).toEqual(ROLE_VALUES);
    expect(config.user.additionalFields.role.input).toBe(false);
    expect(config.user.additionalFields.status.type).toEqual(STATUS_VALUES);
    expect(config.user.additionalFields.status.input).toBe(false);
    expect(config.user.additionalFields.status.defaultValue).toBe(ACCOUNT_STATUS.PENDING);
    expect(config.user.additionalFields.hostelId.input).toBe(false);
  });

  it("trusts only Vercel-provided Preview hosts and ignores request-supplied origins", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-value-with-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "https://beat-the-mess-rush.vercel.app";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "beat-the-mess-rush-pr-21-abc123.vercel.app";
    process.env.VERCEL_BRANCH_URL = "beat-the-mess-rush-git-main-khushnudimumtaz-5356s-projects.vercel.app";

    await getAuth();

    const trustedOrigins = betterAuth.mock.calls.at(-1)[0].trustedOrigins;
    const request = new Request("https://attacker.example/api/auth/sign-in/email", {
      headers: { Origin: "https://attacker.example" },
    });
    await expect(trustedOrigins(request)).resolves.toEqual([
      "https://beat-the-mess-rush.vercel.app",
      "https://beat-the-mess-rush-pr-21-abc123.vercel.app",
      "https://beat-the-mess-rush-git-main-khushnudimumtaz-5356s-projects.vercel.app",
    ]);

    process.env.VERCEL_BRANCH_URL = "https://attacker.example/path";
    await expect(trustedOrigins(request)).resolves.toEqual([
      "https://beat-the-mess-rush.vercel.app",
      "https://beat-the-mess-rush-pr-21-abc123.vercel.app",
    ]);

    process.env.VERCEL_ENV = "production";
    await expect(trustedOrigins(request)).resolves.toEqual([
      "https://beat-the-mess-rush.vercel.app",
    ]);
    await expect(trustedOrigins(request)).resolves.not.toContain("https://attacker.example");
  });

  it("normalizes and deduplicates the canonical production origin", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-value-with-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "https://beat-the-mess-rush.vercel.app/";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "beat-the-mess-rush.vercel.app";
    process.env.VERCEL_BRANCH_URL = "beat-the-mess-rush.vercel.app";

    await getAuth();

    const trustedOrigins = betterAuth.mock.calls.at(-1)[0].trustedOrigins;
    await expect(trustedOrigins()).resolves.toEqual([
      "https://beat-the-mess-rush.vercel.app",
    ]);
  });

  it.each([
    [USER_ROLE.STUDENT, USER_ROLE.STUDENT],
    [USER_ROLE.MESS_ADMIN, USER_ROLE.MESS_ADMIN],
  ])("assigns %s and PENDING from the server registration context", async (accountType, expectedRole) => {
    process.env.BETTER_AUTH_SECRET = "test-secret-value-with-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    await getAuth();

    const hook = betterAuth.mock.calls.at(-1)[0].databaseHooks.user.create.before;
    const options = accountType === USER_ROLE.STUDENT ? { hostelId: HOSTEL_ID.toUpperCase() } : undefined;
    const result = await withRegistrationIntent(accountType, () => hook({ role: USER_ROLE.STUDENT }), options);

    expect(result).toEqual({
      data: {
        role: expectedRole,
        status: ACCOUNT_STATUS.PENDING,
        ...(accountType === USER_ROLE.STUDENT ? { hostelId: HOSTEL_ID } : {}),
      },
    });
    if (accountType === USER_ROLE.MESS_ADMIN) expect(result.data).not.toHaveProperty("hostelId");
  });

  it("preserves Mess Admin intent when the registration route and auth hook use separate module instances", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-value-with-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    await getAuth();

    const hook = betterAuth.mock.calls.at(-1)[0].databaseHooks.user.create.before;
    vi.resetModules();
    const registrationRouteContext = await import("./registration-context.js");
    const result = await registrationRouteContext.withRegistrationIntent(
      USER_ROLE.MESS_ADMIN,
      () => hook({ role: USER_ROLE.STUDENT }),
    );

    expect(result).toEqual({
      data: {
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.PENDING,
      },
    });
  });

  it("rebuilds a cached auth instance when its registration context has changed", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-value-with-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    await getAuth();
    const previousAuthOptions = betterAuth.mock.calls.at(-1)[0];

    // Simulate Next.js hot reload replacing the registration context while
    // the old globally cached Better Auth instance is still present.
    globalThis.__rushlessAuthRegistrationIntentStorage = {};
    await getAuth();

    expect(betterAuth).toHaveBeenCalledTimes(2);
    expect(betterAuth.mock.calls.at(-1)[0]).not.toBe(previousAuthOptions);
  });

  it("requires a valid server-provided Hostel ID if supplied for Student registration intent", async () => {
    const callback = vi.fn();
    expect(withRegistrationIntent(USER_ROLE.STUDENT, () => "ok")).toBe("ok");
    expect(() => withRegistrationIntent(USER_ROLE.STUDENT, callback, { hostelId: "invalid" })).toThrow(/validated Hostel ID/);
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not permit a Hostel ID in Mess Admin registration intent", async () => {
    const callback = vi.fn();
    expect(() => withRegistrationIntent(USER_ROLE.MESS_ADMIN, callback, { hostelId: HOSTEL_ID })).toThrow(/cannot include a Hostel ID/);
    expect(callback).not.toHaveBeenCalled();
  });

  it("leaves non-registration Better Auth creation to its existing safe defaults", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-value-with-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    await getAuth();

    const hook = betterAuth.mock.calls.at(-1)[0].databaseHooks.user.create.before;
    await expect(hook({ role: USER_ROLE.STUDENT })).resolves.toBeUndefined();
  });
});
