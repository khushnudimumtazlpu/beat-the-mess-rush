import { loadEnvConfig } from "@next/env";
import { getAuth } from "../lib/auth.js";
import { getMongoDb } from "../lib/mongodb.js";
import { bootstrapSuperAdmin } from "../lib/super-admin-bootstrap.js";

loadEnvConfig(process.cwd());

const auth = await getAuth();
const db = await getMongoDb();
const result = await bootstrapSuperAdmin({ auth, db });

console.info(
  result.alreadyActive
    ? "The verified Super Admin account is already active."
    : "Created the verified Super Admin account.",
);
console.info("Bootstrap completed. Passwords and secrets were not logged.");
