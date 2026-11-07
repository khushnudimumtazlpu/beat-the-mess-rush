import "server-only";
import { headers } from "next/headers";
import { getAuth } from "../../../lib/auth.js";
import {
  USER_ROLE,
  ACCOUNT_STATUS,
  isActiveUser,
  hasRole,
} from "../../../lib/auth-contracts.js";
import { AuthorizationError } from "../../../lib/auth-authorization.js";

/**
 * Authorize kitchen API request and extract authenticated tenant scope.
 *
 * Rules:
 * - Only ACTIVE users with MESS_ADMIN or SUPER_ADMIN role are allowed.
 * - MESS_ADMIN is strictly locked to user.hostelId (preventing cross-hostel data access).
 * - SUPER_ADMIN can manage any hostel, allowing an optional requestedHostelId override.
 */
export async function authorizeKitchenRequest(requestedHostelId = null) {
  const requestHeaders = await headers();
  let user = null;

  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: requestHeaders });
    user = session?.user;
  } catch (error) {
    // Restrict dev header inspection strictly to test environments
    if (process.env.NODE_ENV === "test") {
      const devRole = requestHeaders.get("x-dev-role");
      const devHostel = requestHeaders.get("x-dev-hostel");
      if (devRole && [USER_ROLE.MESS_ADMIN, USER_ROLE.SUPER_ADMIN].includes(devRole)) {
        user = {
          id: "dev-user-01",
          role: devRole,
          status: ACCOUNT_STATUS.ACTIVE,
          hostelId: devHostel || "hostel-main",
        };
      }
    }

    if (!user) {
      throw new AuthorizationError(
        error?.message || "Sign in is required.",
        401,
        "UNAUTHENTICATED"
      );
    }
  }

  if (!user) {
    throw new AuthorizationError("Sign in is required.", 401, "UNAUTHENTICATED");
  }

  if (!isActiveUser(user)) {
    throw new AuthorizationError(
      user.status === ACCOUNT_STATUS.PENDING
        ? "Your account is awaiting approval."
        : "This account is not active.",
      403,
      user.status === ACCOUNT_STATUS.PENDING ? "PENDING_APPROVAL" : "ACCOUNT_INACTIVE"
    );
  }

  const isMessAdmin = hasRole(user, USER_ROLE.MESS_ADMIN);
  const isSuperAdmin = hasRole(user, USER_ROLE.SUPER_ADMIN);

  if (!isMessAdmin && !isSuperAdmin) {
    throw new AuthorizationError(
      "You do not have access to the Kitchen Management module.",
      403,
      "ROLE_REQUIRED"
    );
  }

  let effectiveHostelId = user.hostelId || "hostel-main";

  if (isSuperAdmin && requestedHostelId) {
    effectiveHostelId = String(requestedHostelId);
  } else if (isMessAdmin && requestedHostelId && requestedHostelId !== user.hostelId) {
    throw new AuthorizationError(
      "You do not have access to this hostel's kitchen records.",
      403,
      "HOSTEL_SCOPE_REQUIRED"
    );
  }

  return {
    user,
    hostelId: effectiveHostelId,
    messId: user.messId || "default-mess",
  };
}
