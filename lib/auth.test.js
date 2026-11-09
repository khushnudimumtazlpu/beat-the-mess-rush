import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("Better Auth configuration", () => {
  afterEach(() => {
    delete globalThis.__rushlessAuthPromise;
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;
    vi.clearAllMocks();
  });

  it("uses the shared role and account status contracts for custom fields", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-value-with-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";

    await expect(getAuth()).resolves.toBeDefined();

    const config = betterAuth.mock.calls[0][0];
    expect(config.user.additionalFields.role.type).toEqual(ROLE_VALUES);
    expect(config.user.additionalFields.role.input).toBe(false);
    expect(config.user.additionalFields.status.type).toEqual(STATUS_VALUES);
    expect(config.user.additionalFields.status.input).toBe(false);
    expect(config.user.additionalFields.status.defaultValue).toBe(ACCOUNT_STATUS.PENDING);
    expect(config.user.additionalFields.hostelId.input).toBe(false);
  });

  it.each([
    [USER_ROLE.STUDENT, USER_ROLE.STUDENT],
    [USER_ROLE.MESS_ADMIN, USER_ROLE.MESS_ADMIN],
  ])("assigns %s and PENDING from the server registration context", async (accountType, expectedRole) => {
    process.env.BETTER_AUTH_SECRET = "test-secret-value-with-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    await getAuth();

    const hook = betterAuth.mock.calls.at(-1)[0].databaseHooks.user.create.before;
    const result = await withRegistrationIntent(accountType, () => hook({ role: USER_ROLE.STUDENT }));

    expect(result).toEqual({ data: { role: expectedRole, status: ACCOUNT_STATUS.PENDING } });
    expect(result.data).not.toHaveProperty("hostelId");
  });

  it("leaves non-registration Better Auth creation to its existing safe defaults", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-value-with-at-least-32-characters";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    await getAuth();

    const hook = betterAuth.mock.calls.at(-1)[0].databaseHooks.user.create.before;
    await expect(hook({ role: USER_ROLE.STUDENT })).resolves.toBeUndefined();
  });
});
