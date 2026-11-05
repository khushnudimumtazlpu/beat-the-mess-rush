import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { ACCOUNT_STATUS, USER_ROLE } from "./auth-contracts.js";

vi.mock("server-only", () => ({}));

const { bootstrapSuperAdmin } = await import("./super-admin-bootstrap.js");

const validEnv = {
  MONGODB_URI: "mongodb://example.invalid",
  MONGODB_DB_NAME: "rushless",
  BETTER_AUTH_SECRET: "secure-test-secret-value-long-enough-000000",
  BETTER_AUTH_URL: "http://localhost:3000",
  SUPER_ADMIN_NAME: "Campus Operator",
  SUPER_ADMIN_EMAIL: "operator@example.test",
  SUPER_ADMIN_PASSWORD: "a-secure-test-password",
  SUPER_ADMIN_PASSWORD_CONFIRM: "a-secure-test-password",
  SUPER_ADMIN_BOOTSTRAP_CONFIRM: "CREATE_OR_RECOVER_SUPER_ADMIN",
};

function createHarness({
  initialUsers = [],
  expectedPassword = validEnv.SUPER_ADMIN_PASSWORD,
  failAfterSessionCreation = false,
} = {}) {
  const state = {
    users: initialUsers,
    sessions: [],
    passwordById: new Map(initialUsers.map((user) => [user._id.toString(), expectedPassword])),
    signUpEmail: vi.fn(async ({ body }) => {
      if (state.users.some((user) => user.email === body.email.toLowerCase())) {
        return { user: { id: new ObjectId().toString() } };
      }
      const user = {
        _id: new ObjectId(),
        email: body.email.toLowerCase(),
        role: USER_ROLE.STUDENT,
        status: ACCOUNT_STATUS.PENDING,
      };
      state.users.push(user);
      state.passwordById.set(user._id.toString(), body.password);
      return { user: { id: user._id.toString() } };
    }),
    signInEmail: vi.fn(async ({ body }) => {
      const user = state.users.find((item) => item.email === body.email.toLowerCase());
      if (!user || state.passwordById.get(user._id.toString()) !== body.password) {
        throw new Error("Invalid email or password");
      }
      const session = await internalAdapter.createSession(user._id.toString());
      if (failAfterSessionCreation) throw new Error("Sign-in response failed after session creation");
      const { token } = session;
      return { token, user: { id: user._id.toString() } };
    }),
  };

  const internalAdapter = {
    createSession: vi.fn(async (userId) => {
      const token = `temporary-session-${state.sessions.length + 1}`;
      const session = { token, userId };
      state.sessions.push(session);
      return session;
    }),
  };

  const users = {
    createIndex: vi.fn(async () => "one_bootstrap_super_admin"),
    findOne: vi.fn(async (filter) => state.users.find((user) =>
      Object.entries(filter).every(([key, value]) => user[key]?.toString() === value?.toString()),
    ) ?? null),
    find: vi.fn((filter) => ({
      project: () => ({
        toArray: async () => state.users.filter((user) =>
          Object.entries(filter).every(([key, value]) => user[key] === value),
        ),
      }),
    })),
    updateOne: vi.fn(async (filter, update) => {
      const user = state.users.find((item) =>
        Object.entries(filter).every(([key, value]) => item[key]?.toString() === value?.toString()),
      );
      if (!user) return { matchedCount: 0 };
      Object.assign(user, update.$set);
      for (const key of Object.keys(update.$unset ?? {})) delete user[key];
      return { matchedCount: 1 };
    }),
  };

  const sessions = {
    deleteOne: vi.fn(async ({ token }) => {
      const index = state.sessions.findIndex((session) => session.token === token);
      if (index === -1) return { deletedCount: 0 };
      state.sessions.splice(index, 1);
      return { deletedCount: 1 };
    }),
  };

  const db = {
    collection: (name) => name === "user" ? users : sessions,
  };
  const auth = {
    $context: Promise.resolve({ internalAdapter }),
    api: { signUpEmail: state.signUpEmail, signInEmail: state.signInEmail },
  };

  return { state, users, sessions, auth, db, internalAdapter };
}

function pendingStudent(email = validEnv.SUPER_ADMIN_EMAIL) {
  return {
    _id: new ObjectId(),
    email,
    role: USER_ROLE.STUDENT,
    status: ACCOUNT_STATUS.PENDING,
  };
}

describe("Super Admin bootstrap", () => {
  it("creates, verifies, then promotes the intended account", async () => {
    const h = createHarness();

    const result = await bootstrapSuperAdmin({ ...h, env: validEnv });

    expect(result.alreadyActive).toBe(false);
    expect(h.state.users[0]).toMatchObject({
      email: "operator@example.test",
      role: USER_ROLE.SUPER_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      bootstrapPrimary: true,
    });
    expect(h.state.sessions).toHaveLength(0);
    expect(h.state.signInEmail).toHaveBeenCalledOnce();
  });

  it("makes a duplicate run idempotent for the same verified account", async () => {
    const h = createHarness();

    await bootstrapSuperAdmin({ ...h, env: validEnv });
    const second = await bootstrapSuperAdmin({ ...h, env: validEnv });

    expect(second.alreadyActive).toBe(true);
    expect(h.state.users).toHaveLength(1);
    expect(h.state.signUpEmail).toHaveBeenCalledOnce();
  });

  it("does not promote an existing account when credentials fail", async () => {
    const existing = pendingStudent();
    const h = createHarness({ initialUsers: [existing], expectedPassword: "the-real-password-123" });

    await expect(bootstrapSuperAdmin({ ...h, env: validEnv })).rejects.toThrow("Invalid email or password");
    expect(existing.role).toBe(USER_ROLE.STUDENT);
    expect(existing.status).toBe(ACCOUNT_STATUS.PENDING);
  });

  it("deletes a temporary session when sign-in fails after creating it", async () => {
    const h = createHarness({ failAfterSessionCreation: true });
    const originalCreateSession = h.internalAdapter.createSession;

    await expect(bootstrapSuperAdmin({ ...h, env: validEnv })).rejects.toThrow(
      "Sign-in response failed after session creation",
    );

    expect(h.state.sessions).toHaveLength(0);
    expect(h.state.users[0]).toMatchObject({
      role: USER_ROLE.STUDENT,
      status: ACCOUNT_STATUS.PENDING,
    });
    expect(h.internalAdapter.createSession).toHaveBeenCalledOnce();
    expect(h.internalAdapter.createSession).toBe(originalCreateSession);
  });

  it("does not promote when temporary-session deletion fails", async () => {
    const h = createHarness({ failAfterSessionCreation: true });
    h.sessions.deleteOne.mockResolvedValueOnce({ deletedCount: 0 });

    await expect(bootstrapSuperAdmin({ ...h, env: validEnv })).rejects.toThrow(
      "Could not remove the temporary bootstrap verification session",
    );

    expect(h.state.sessions).toHaveLength(1);
    expect(h.state.users[0]).toMatchObject({
      role: USER_ROLE.STUDENT,
      status: ACCOUNT_STATUS.PENDING,
    });
  });

  it("can recover a pending account after an interrupted promotion", async () => {
    const h = createHarness();
    h.users.updateOne.mockImplementationOnce(async () => ({ matchedCount: 0 }));

    await expect(bootstrapSuperAdmin({ ...h, env: validEnv })).rejects.toThrow("changed before promotion");
    expect(h.state.users[0].role).toBe(USER_ROLE.STUDENT);

    const recovered = await bootstrapSuperAdmin({ ...h, env: validEnv });
    expect(recovered.alreadyActive).toBe(false);
    expect(h.state.users[0].role).toBe(USER_ROLE.SUPER_ADMIN);
  });

  it("blocks another Super Admin unless the explicit override is set", async () => {
    const existing = {
      ...pendingStudent("root@example.test"),
      role: USER_ROLE.SUPER_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      bootstrapPrimary: true,
    };
    const h = createHarness({ initialUsers: [existing] });
    const nextEnv = { ...validEnv, SUPER_ADMIN_EMAIL: "second@example.test" };

    await expect(bootstrapSuperAdmin({ ...h, env: nextEnv })).rejects.toThrow("already exists");
    expect(h.state.signUpEmail).not.toHaveBeenCalled();

    const overrideHarness = createHarness({ initialUsers: [existing] });
    const override = await bootstrapSuperAdmin({
      ...overrideHarness,
      env: { ...nextEnv, SUPER_ADMIN_ALLOW_MULTIPLE: "true" },
    });
    expect(override.alreadyActive).toBe(false);
    expect(overrideHarness.state.users[1].bootstrapPrimary).toBe(false);
  });

  it("requires matching password confirmation and explicit bootstrap confirmation", async () => {
    const h = createHarness();

    await expect(bootstrapSuperAdmin({
      ...h,
      env: { ...validEnv, SUPER_ADMIN_PASSWORD_CONFIRM: "different-password" },
    })).rejects.toThrow("password confirmation does not match");
    await expect(bootstrapSuperAdmin({
      ...h,
      env: { ...validEnv, SUPER_ADMIN_BOOTSTRAP_CONFIRM: "" },
    })).rejects.toThrow("SUPER_ADMIN_BOOTSTRAP_CONFIRM");
  });
});
