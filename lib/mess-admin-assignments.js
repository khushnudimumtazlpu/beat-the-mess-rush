import "server-only";
import { ObjectId } from "mongodb";
import { AuthorizationError, requireActiveRole } from "./auth-authorization.js";
import { ACCOUNT_STATUS, HOSTEL_COLLECTION, USER_COLLECTION, USER_ROLE } from "./auth-contracts.js";
import { getMongoClient, getMongoDb } from "./mongodb.js";

const ACTIVE_HOSTEL_ADMIN_INDEX = "one_active_mess_admin_per_hostel";

function asObjectId(value, label) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw new TypeError(`${label} must be a valid ObjectId hex string.`);
  }
  return new ObjectId(value);
}

export async function ensureActiveHostelAdminIndex() {
  const db = await getMongoDb();
  await db.collection(USER_COLLECTION).createIndex(
    { hostelId: 1 },
    {
      name: ACTIVE_HOSTEL_ADMIN_INDEX,
      unique: true,
      partialFilterExpression: {
        role: USER_ROLE.MESS_ADMIN,
        status: ACCOUNT_STATUS.ACTIVE,
        hostelId: { $type: "string" },
      },
    },
  );
}

/**
 * Approve and assign a pending Mess Admin, or safely reassign an existing
 * hostel to another approved admin. A transaction plus a unique partial index
 * prevents concurrent requests from leaving two active admins for one hostel.
 * Only one-hostel assignment is permitted per Mess Admin account.
 */
export async function assignHostelMessAdmin({ hostelId, messAdminId }) {
  const actor = await requireActiveRole(USER_ROLE.SUPER_ADMIN);
  const targetHostelId = asObjectId(hostelId, "hostelId");
  const targetAdminId = asObjectId(messAdminId, "messAdminId");

  await ensureActiveHostelAdminIndex();

  const client = await getMongoClient();
  const db = await getMongoDb();
  const users = db.collection(USER_COLLECTION);
  const session = client.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const hostel = await db.collection(HOSTEL_COLLECTION).findOne(
        { _id: targetHostelId },
        { session, projection: { _id: 1, status: 1 } },
      );
      if (!hostel) {
        throw new AuthorizationError("The selected hostel does not exist.", 404, "HOSTEL_NOT_FOUND");
      }
      if (hostel.status !== "ACTIVE") {
        throw new AuthorizationError("Cannot assign a Mess Admin to an inactive Hostel.", 409, "HOSTEL_INACTIVE");
      }

      // Write the active-state check in this transaction. This conflicts with a
      // concurrent Hostel deactivation instead of relying on a snapshot read.
      const activeHostelGuard = await db.collection(HOSTEL_COLLECTION).updateOne(
        { _id: targetHostelId, status: "ACTIVE" },
        { $set: { updatedAt: new Date() } },
        { session },
      );
      if (activeHostelGuard.matchedCount !== 1) {
        throw new AuthorizationError("Cannot assign a Mess Admin to an inactive Hostel.", 409, "HOSTEL_INACTIVE");
      }

      const nextAdmin = await users.findOne(
        { _id: targetAdminId },
        { session, projection: { role: 1, status: 1, hostelId: 1 } },
      );
      if (!nextAdmin || nextAdmin.role !== USER_ROLE.MESS_ADMIN) {
        throw new AuthorizationError("The selected account is not a Mess Admin.", 400, "INVALID_MESS_ADMIN");
      }
      if (![ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.ACTIVE].includes(nextAdmin.status)) {
        throw new AuthorizationError("Only pending or active Mess Admins can be assigned.", 409, "ADMIN_NOT_ASSIGNABLE");
      }

      const hostelIdValue = targetHostelId.toHexString();
      if (
        nextAdmin.status === ACCOUNT_STATUS.ACTIVE &&
        nextAdmin.hostelId &&
        nextAdmin.hostelId !== hostelIdValue
      ) {
        throw new AuthorizationError("This Mess Admin is already assigned to another hostel.", 409, "ADMIN_ALREADY_ASSIGNED");
      }

      const currentAdmin = await users.findOne(
        {
          role: USER_ROLE.MESS_ADMIN,
          status: ACCOUNT_STATUS.ACTIVE,
          hostelId: hostelIdValue,
          _id: { $ne: targetAdminId },
        },
        { session, projection: { _id: 1 } },
      );

      if (currentAdmin) {
        await users.updateOne(
          { _id: currentAdmin._id, role: USER_ROLE.MESS_ADMIN, status: ACCOUNT_STATUS.ACTIVE },
          { $set: { hostelId: null, updatedAt: new Date() } },
          { session },
        );
      }

      await users.updateOne(
        { _id: targetAdminId, role: USER_ROLE.MESS_ADMIN },
        {
          $set: {
            status: ACCOUNT_STATUS.ACTIVE,
            hostelId: hostelIdValue,
            updatedAt: new Date(),
          },
        },
        { session },
      );

      result = {
        hostelId: hostelIdValue,
        messAdminId: targetAdminId.toHexString(),
        previousMessAdminId: currentAdmin?._id.toHexString() ?? null,
        assignedBy: actor.id,
      };
    });

    return result;
  } catch (error) {
    if (error?.code === 11000) {
      throw new AuthorizationError(
        "Another active Mess Admin was assigned to this hostel at the same time. Refresh and try again.",
        409,
        "HOSTEL_ADMIN_CONFLICT",
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
