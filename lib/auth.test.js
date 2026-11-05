import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_STATUS, ROLE_VALUES, STATUS_VALUES } from "./auth-contracts.js";

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
});
