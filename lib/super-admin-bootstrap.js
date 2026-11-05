import "server-only";
import {
  ACCOUNT_STATUS,
  USER_COLLECTION,
  USER_ROLE,
} from "./auth-contracts.js";

const PRIMARY_ADMIN_INDEX = "one_bootstrap_super_admin";
const CONFIRMATION_PHRASE = "CREATE_OR_RECOVER_SUPER_ADMIN";

function readBootstrapConfig(env) {
  const required = [
    "MONGODB_URI",
    "MONGODB_DB_NAME",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "SUPER_ADMIN_NAME",
    "SUPER_ADMIN_EMAIL",
    "SUPER_ADMIN_PASSWORD",
    "SUPER_ADMIN_PASSWORD_CONFIRM",
    "SUPER_ADMIN_BOOTSTRAP_CONFIRM",
  ];

  for (const key of required) {
    if (!env[key]) throw new Error(`${key} must be set to run Super Admin bootstrap.`);
  }

  if (env.SUPER_ADMIN_BOOTSTRAP_CONFIRM !== CONFIRMATION_PHRASE) {
    throw new Error(`Set SUPER_ADMIN_BOOTSTRAP_CONFIRM to ${CONFIRMATION_PHRASE} to continue.`);
  }

  if (env.SUPER_ADMIN_PASSWORD !== env.SUPER_ADMIN_PASSWORD_CONFIRM) {
    throw new Error("The Super Admin password confirmation does not match.");
  }

  if (env.SUPER_ADMIN_PASSWORD.length < 10 || env.SUPER_ADMIN_PASSWORD.length > 128) {
    throw new Error("The Super Admin password must be between 10 and 128 characters.");
  }

  if (env.SUPER_ADMIN_ALLOW_MULTIPLE && env.SUPER_ADMIN_ALLOW_MULTIPLE !== "true") {
    throw new Error("Set SUPER_ADMIN_ALLOW_MULTIPLE to exactly 'true' or leave it empty.");
  }

  return {
    name: env.SUPER_ADMIN_NAME.trim(),
    email: env.SUPER_ADMIN_EMAIL.trim().toLowerCase(),
    password: env.SUPER_ADMIN_PASSWORD,
    allowMultiple: env.SUPER_ADMIN_ALLOW_MULTIPLE === "true",
  };
}

async function verifyCredentials({ auth, db, candidate, email, password }) {
  // Better Auth 1.7.15's public verifyPassword endpoint requires an existing
  // session. signInEmail is therefore used to verify credentials, while this
  // scoped adapter wrapper records the session even if signInEmail throws
  // after creating it but before returning its token.
  const context = await auth.$context;
  const adapter = context.internalAdapter;
  const createSession = adapter.createSession;
  let createdSession;

  adapter.createSession = async (...args) => {
    const session = await createSession.apply(adapter, args);
    if (args[0] === candidate._id.toString()) createdSession = session;
    return session;
  };

  try {
    const verified = await auth.api.signInEmail({ body: { email, password } });
    if (verified.user.id !== candidate._id.toString()) {
      throw new Error("Credential verification returned a different account.");
    }
  } finally {
    adapter.createSession = createSession;

    if (createdSession?.token) {
      const removed = await db.collection("session").deleteOne({ token: createdSession.token });
      if (removed.deletedCount !== 1) {
        throw new Error("Could not remove the temporary bootstrap verification session; no promotion was made.");
      }
    } else if (createdSession) {
      throw new Error("Better Auth created a verification session without a cleanup token; no promotion was made.");
    }
  }
}

async function getActiveSuperAdmins(users) {
  return users
    .find({ role: USER_ROLE.SUPER_ADMIN, status: ACCOUNT_STATUS.ACTIVE })
    .project({ _id: 1, email: 1, role: 1, status: 1, bootstrapPrimary: 1 })
    .toArray();
}

function isStudentEligibleForPromotion(user) {
  return (
    user?.role === USER_ROLE.STUDENT &&
    [ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.ACTIVE].includes(user.status)
  );
}

/**
 * Create or recover the initial Super Admin account.
 *
 * Better Auth creates the credential account first. This function then proves
 * control of that exact account with Better Auth sign-in before changing its
 * role/status. Account creation and promotion are deliberately separate: a
 * failed promotion leaves a recoverable pending Student, not a partial admin.
 */
export async function bootstrapSuperAdmin({ auth, db, env = process.env }) {
  const config = readBootstrapConfig(env);
  const users = db.collection(USER_COLLECTION);

  await users.createIndex(
    { bootstrapPrimary: 1 },
    {
      name: PRIMARY_ADMIN_INDEX,
      unique: true,
      partialFilterExpression: {
        role: USER_ROLE.SUPER_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        bootstrapPrimary: true,
      },
    },
  );

  const activeSuperAdmins = await getActiveSuperAdmins(users);
  const intendedUser = await users.findOne({ email: config.email });
  const sameExistingAdmin = activeSuperAdmins.find(
    (admin) => admin.email === config.email,
  );

  if (sameExistingAdmin) {
    await verifyCredentials({
      auth,
      db,
      candidate: sameExistingAdmin,
      email: config.email,
      password: config.password,
    });
    return { userId: sameExistingAdmin._id.toString(), alreadyActive: true };
  }

  if (activeSuperAdmins.length > 0 && !config.allowMultiple) {
    throw new Error(
      "An active Super Admin already exists. Use that account, or set SUPER_ADMIN_ALLOW_MULTIPLE=true after deliberate review.",
    );
  }

  let candidate = intendedUser;
  if (!candidate) {
    try {
      await auth.api.signUpEmail({
        body: {
          name: config.name,
          email: config.email,
          password: config.password,
        },
      });
    } catch (error) {
      // Another invocation may have created this account. Re-read by email;
      // never trust a response ID or promote solely because an email was given.
      candidate = await users.findOne({ email: config.email });
      if (!candidate) throw error;
    }

    candidate = await users.findOne({ email: config.email });
  }

  if (!candidate) throw new Error("Better Auth did not create the requested account.");
  if (!isStudentEligibleForPromotion(candidate)) {
    throw new Error("Only an existing pending or active Student account can be promoted by this seed process.");
  }

  await verifyCredentials({
    auth,
    db,
    candidate,
    email: config.email,
    password: config.password,
  });

  const promotion = await users.updateOne(
    {
      _id: candidate._id,
      email: config.email,
      role: USER_ROLE.STUDENT,
      status: candidate.status,
    },
    {
      $set: {
        role: USER_ROLE.SUPER_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        bootstrapPrimary: !config.allowMultiple,
        updatedAt: new Date(),
      },
      $unset: { hostelId: "" },
    },
  );

  if (promotion.matchedCount !== 1) {
    const latest = await users.findOne({ _id: candidate._id });
    if (
      latest?.role === USER_ROLE.SUPER_ADMIN &&
      latest.status === ACCOUNT_STATUS.ACTIVE
    ) {
      return { userId: latest._id.toString(), alreadyActive: true };
    }
    throw new Error("The verified account changed before promotion; no Super Admin role was granted.");
  }

  return { userId: candidate._id.toString(), alreadyActive: false };
}
