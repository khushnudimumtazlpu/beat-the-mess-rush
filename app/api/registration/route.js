import "server-only";
import { getAuth } from "../../../lib/auth.js";
import { ACCOUNT_STATUS, USER_ROLE } from "../../../lib/auth-contracts.js";
import { withRegistrationIntent } from "../../../lib/registration-context.js";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set(["name", "email", "password", "accountType"]);
const REGISTRABLE_ACCOUNT_TYPES = new Set([USER_ROLE.STUDENT, USER_ROLE.MESS_ADMIN]);
// Match Better Auth 1.7.15's installed Zod `z.email()` validator.
const EMAIL_PATTERN = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+\-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

function errorResponse(status, code, message) {
  return Response.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function successResponse(accountType) {
  return Response.json(
    {
      success: true,
      data: { accountType, status: ACCOUNT_STATUS.PENDING },
      message: "If the email is available, your registration request has been received. You can sign in after approval.",
    },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}

async function readRegistrationBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: errorResponse(400, "INVALID_JSON", "Request body must contain valid JSON.") };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: errorResponse(400, "INVALID_BODY", "Request body must be a JSON object.") };
  }

  if (Object.keys(body).some((field) => !ALLOWED_FIELDS.has(field))) {
    return { error: errorResponse(400, "INVALID_FIELDS", "Request contains unsupported fields.") };
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body.password;
  const accountType = body.accountType;

  if (name.length < 2 || name.length > 80) {
    return { error: errorResponse(400, "INVALID_NAME", "Name must contain 2 to 80 characters.") };
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { error: errorResponse(400, "INVALID_EMAIL", "Provide a valid email address.") };
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return { error: errorResponse(400, "INVALID_PASSWORD", "Password must contain 10 to 128 characters.") };
  }
  if (typeof accountType !== "string" || !REGISTRABLE_ACCOUNT_TYPES.has(accountType)) {
    return { error: errorResponse(400, "INVALID_ACCOUNT_TYPE", "Account type must be STUDENT or MESS_ADMIN.") };
  }

  return { value: { name, email, password, accountType } };
}

export async function POST(request) {
  const parsed = await readRegistrationBody(request);
  if (parsed.error) return parsed.error;

  const { name, email, password, accountType } = parsed.value;

  try {
    const auth = await getAuth();
    await withRegistrationIntent(accountType, () => auth.api.signUpEmail({
      body: { name, email, password },
    }));

    // Better Auth's autoSignIn:false behavior intentionally returns a generic
    // success for duplicate emails. Keep this response identical so email
    // existence is not disclosed; tokens and account details are never echoed.
    return successResponse(accountType);
  } catch {
    return errorResponse(
      503,
      "REGISTRATION_UNAVAILABLE",
      "Registration is temporarily unavailable. Please try again.",
    );
  }
}
