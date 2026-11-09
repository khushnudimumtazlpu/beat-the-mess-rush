import "server-only";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getMongoClient, getMongoDb } from "./mongodb.js";
import { ACCOUNT_STATUS, ROLE_VALUES, STATUS_VALUES, USER_ROLE } from "./auth-contracts.js";
import { getRegistrationIntent } from "./registration-context.js";

const globalForAuth = globalThis;

function getAuthConfig() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;

  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 characters.");
  }

  // Length catches a missing or short secret; it does not prove randomness.
  // Generate this value with a cryptographically secure random generator and
  // keep it in a server-only environment variable (never NEXT_PUBLIC_*).

  if (!baseURL) {
    throw new Error("BETTER_AUTH_URL is required before authentication can start.");
  }

  return { secret, baseURL };
}

export async function getAuth() {
  if (!globalForAuth.__rushlessAuthPromise) {
    globalForAuth.__rushlessAuthPromise = (async () => {
      const [{ secret, baseURL }, client, db] = await Promise.all([
        Promise.resolve(getAuthConfig()),
        getMongoClient(),
        getMongoDb(),
      ]);

      return betterAuth({
        appName: "RushLess",
        baseURL,
        secret,
        database: mongodbAdapter(db, { client, transaction: true }),
        emailAndPassword: {
          enabled: true,
          autoSignIn: false,
          requireEmailVerification: false,
          minPasswordLength: 10,
          maxPasswordLength: 128,
        },
        user: {
          additionalFields: {
            role: {
              type: ROLE_VALUES,
              required: false,
              defaultValue: "STUDENT",
              input: false,
            },
            status: {
              type: STATUS_VALUES,
              required: false,
              defaultValue: ACCOUNT_STATUS.PENDING,
              input: false,
            },
            hostelId: {
              type: "string",
              required: false,
              input: false,
            },
          },
        },
        databaseHooks: {
          user: {
            create: {
              before: async () => {
                const intent = getRegistrationIntent();
                if (!intent) return;

                if (intent.accountType !== USER_ROLE.STUDENT && intent.accountType !== USER_ROLE.MESS_ADMIN) {
                  throw new Error("Unsupported public registration account type.");
                }

                return {
                  data: {
                    role: intent.accountType,
                    status: ACCOUNT_STATUS.PENDING,
                    ...(intent.accountType === USER_ROLE.STUDENT
                      ? { hostelId: intent.hostelId }
                      : {}),
                  },
                };
              },
            },
          },
        },
        session: {
          cookieCache: { enabled: false },
        },
      });
    })().catch((error) => {
      globalForAuth.__rushlessAuthPromise = undefined;
      throw error;
    });
  }

  return globalForAuth.__rushlessAuthPromise;
}
