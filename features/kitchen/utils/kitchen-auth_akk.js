import "server-only";
import { headers } from "next/headers";
import { getAuth } from "../../../lib/auth.js";
import { getMongoDb } from "../../../lib/mongodb.js";
import {
  USER_ROLE,
  ACCOUNT_STATUS,
  MESS_COLLECTION,
  isActiveUser,
  hasRole,
} from "../../../lib/auth-contracts.js";
import { AuthorizationError } from "../../../lib/auth-authorization.js";
import { toObjectId, isValidObjectIdHex } from "../../../lib/mongo-ids.js";

/**
 * Authorize kitchen API request and extract authenticated tenant scope.
 *
 * Rules:
 * - Only ACTIVE users with MESS_ADMIN or SUPER_ADMIN role are allowed.
 * - MESS_ADMIN is strictly locked to user.hostelId and user.messId (preventing cross-hostel and cross-mess data access).
 * - Request-supplied messId cannot override MESS_ADMIN's assigned messId.
 * - SUPER_ADMIN can query/manage any hostel, but messId is validated against the hostel.
 * - No silent fallbacks allowed; valid tenant IDs are required.
 */
export async function authorizeKitchenRequest(
  requestedHostelId = null,
  requestedMessId = null
) {
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
      const devMess = requestHeaders.get("x-dev-mess");
      if (devRole && [USER_ROLE.MESS_ADMIN, USER_ROLE.SUPER_ADMIN].includes(devRole)) {
        user = {
          id: "dev-user-01",
          role: devRole,
          status: ACCOUNT_STATUS.ACTIVE,
          hostelId: devHostel || undefined,
          messId: devMess || undefined,
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

  let effectiveHostelId = user.hostelId;
  let effectiveMessId = user.messId;

  if (isMessAdmin) {
    if (!effectiveHostelId) {
      throw new AuthorizationError(
        "Hostel assignment is required for mess admin.",
        403,
        "HOSTEL_REQUIRED"
      );
    }

    if (!effectiveMessId) {
      throw new AuthorizationError(
        "Mess assignment is required for kitchen operations.",
        403,
        "MESS_REQUIRED"
      );
    }

    // MESS_ADMIN requests are strictly locked to their assigned hostel
    if (requestedHostelId && String(requestedHostelId) !== String(effectiveHostelId)) {
      throw new AuthorizationError(
        "You do not have access to this hostel's kitchen records.",
        403,
        "HOSTEL_SCOPE_REQUIRED"
      );
    }

    // MESS_ADMIN requests are strictly restricted to their assigned mess on the server side
    if (requestedMessId && String(requestedMessId) !== String(effectiveMessId)) {
      throw new AuthorizationError(
        "You do not have access to this mess's kitchen records.",
        403,
        "MESS_SCOPE_REQUIRED"
      );
    }
  } else if (isSuperAdmin) {
    if (requestedHostelId) {
      effectiveHostelId = String(requestedHostelId);
    }
    if (requestedMessId) {
      effectiveMessId = String(requestedMessId);
    }

    if (!effectiveHostelId) {
      throw new AuthorizationError(
        "Hostel ID is required for Super Admin.",
        400,
        "HOSTEL_REQUIRED"
      );
    }

    if (!effectiveMessId) {
      throw new AuthorizationError(
        "Mess ID is required for kitchen operations.",
        400,
        "MESS_REQUIRED"
      );
    }

    // Validate that the selected mess document exists and belongs to the selected hostel
    const db = await getMongoDb();
    const messObjectId = isValidObjectIdHex(effectiveMessId)
      ? toObjectId(effectiveMessId, "Mess ID")
      : effectiveMessId;
    const query = isValidObjectIdHex(effectiveMessId)
      ? { $or: [{ _id: messObjectId }, { _id: String(effectiveMessId) }] }
      : { _id: effectiveMessId };
    const messDoc = await db.collection(MESS_COLLECTION).findOne(query);

    if (!messDoc) {
      throw new AuthorizationError(
        "The specified mess was not found.",
        404,
        "MESS_NOT_FOUND"
      );
    }

    if (!messDoc.hostelId || String(messDoc.hostelId) !== String(effectiveHostelId)) {
      throw new AuthorizationError(
        "The specified mess does not belong to the selected hostel.",
        400,
        "MESS_HOSTEL_MISMATCH"
      );
    }
  }

  return {
    user,
    hostelId: String(effectiveHostelId),
    messId: String(effectiveMessId),
  };
}
