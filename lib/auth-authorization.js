import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth.js";
import { ACCOUNT_STATUS, hasHostelScope, hasRole, isActiveUser } from "./auth-contracts.js";

export class AuthorizationError extends Error {
  constructor(message, status = 403, code = "FORBIDDEN") {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
    this.code = code;
  }
}

export async function getCurrentSession() {
  // Read request-bound state first so Next.js does not prerender a protected
  // route and initialize authentication during the production build.
  const requestHeaders = await headers();
  const auth = await getAuth();
  return auth.api.getSession({ headers: requestHeaders });
}

export async function requireSignedInUser() {
  const session = await getCurrentSession();

  if (!session?.user) {
    throw new AuthorizationError("Sign in is required.", 401, "UNAUTHENTICATED");
  }

  return session.user;
}

export async function requirePendingUser() {
  const user = await requireSignedInUser();

  if (user.status !== ACCOUNT_STATUS.PENDING) {
    throw new AuthorizationError("This account is not awaiting approval.", 403, "NOT_PENDING");
  }

  return user;
}

export async function requireActiveRole(role) {
  return requireActiveRoles([role]);
}

export async function requireActiveRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new TypeError("At least one allowed role is required.");
  }

  const user = await requireSignedInUser();

  if (!isActiveUser(user)) {
    const isPending = user.status === ACCOUNT_STATUS.PENDING;
    throw new AuthorizationError(
      isPending ? "Your account is awaiting approval." : "This account is not active.",
      403,
      isPending ? "PENDING_APPROVAL" : "ACCOUNT_INACTIVE",
    );
  }

  if (!roles.some((role) => hasRole(user, role))) {
    throw new AuthorizationError("You do not have access to this area.", 403, "ROLE_REQUIRED");
  }

  return user;
}

export async function authorizeRouteRoles(roles, callbackPath) {
  try {
    return await requireActiveRoles(roles);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;

    if (error.code === "UNAUTHENTICATED") {
      redirect(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
    }

    if (error.code === "PENDING_APPROVAL") {
      redirect("/pending");
    }

    redirect("/access-denied");
  }
}

export async function requireHostelRole(role, hostelId) {
  const user = await requireActiveRole(role);

  if (!hasHostelScope(user, hostelId)) {
    throw new AuthorizationError("You do not have access to this hostel.", 403, "HOSTEL_SCOPE_REQUIRED");
  }

  return user;
}
