# Queue Mutation Version Contract

## 1. Purpose

The `queueMutationVersion` field prevents a Queue from being created while its parent Counter, Mess, or Hostel is being deactivated.

Queue creation and parent-entity deactivation must write to the same parent document inside their respective MongoDB transactions. This creates a write conflict when both operations overlap.

## 2. Field Definition

The following collections use `queueMutationVersion`:

- Counters
- Messes
- Hostels

The field is a numeric mutation version.

### Missing field behavior

MongoDB `$inc` initializes a missing numeric field to `1`.

- Missing field: becomes `1`.
- Existing numeric field: increments by `1`.
- Existing non-numeric field: operation fails and the transaction must abort.

No separate initialization migration is required for this field.

## 3. Queue Creation Transaction

Before inserting a Queue, the transaction must conditionally update all three parent documents.

### Counter guard

Filter:

- `_id` matches the selected Counter.
- `hostelId` matches the selected Hostel.
- `messId` matches the selected Mess.
- `status` equals `"ACTIVE"`.

Update:

`$inc: { queueMutationVersion: 1 }`

### Mess guard

Filter:

- `_id` matches the selected Mess.
- `hostelId` matches the selected Hostel.
- `status` equals `"ACTIVE"`.

Update:

`$inc: { queueMutationVersion: 1 }`

### Hostel guard

Filter:

- `_id` matches the selected Hostel.
- `status` equals `"ACTIVE"`.

Update:

`$inc: { queueMutationVersion: 1 }`

### Matched document validation

Every guard must match exactly one document.

If `matchedCount !== 1`:

1. Abort the transaction.
2. Do not create the Queue.
3. Do not create the initial Queue history record.
4. Return a conflict response.

## 4. Atomic Queue Creation

The following operations must happen in one MongoDB transaction:

1. Increment Counter `queueMutationVersion`.
2. Increment Mess `queueMutationVersion`.
3. Increment Hostel `queueMutationVersion`.
4. Insert the Queue document.
5. Insert the initial Queue history record.

If any operation fails, the entire transaction must abort.

## 5. Parent-Entity Deactivation Contract

Every future Counter, Mess, or Hostel deactivation transaction must:

1. Update the affected parent document.
2. Change its status to inactive.
3. Increment `queueMutationVersion` in the same update.
4. Close its affected active Queues.
5. Insert the required Queue history records.
6. Commit all operations atomically.

The deactivation transaction must write to the same parent document that Queue creation updates.

Hostel and Mess deactivation implementation is owned by the Super Admin module. This document defines the shared contract; it does not assign duplicate implementation ownership.

## 6. Transaction Retry Behavior

MongoDB transactions can encounter transient write conflicts.

When a transaction is retried:

1. All three parent guards must execute again.
2. Each parent must still satisfy the ACTIVE status filter.
3. If a parent is now inactive, Queue creation must abort.
4. No Queue or initial history record may be inserted after a failed guard.

## 7. Implementation Rules

- Never trust frontend-supplied `updatedBy`.
- Derive the actor from the authenticated session.
- Keep Queue creation and initial history insertion atomic.
- Do not create a Queue under an inactive Counter, Mess, or Hostel.
- Do not implement duplicate Hostel or Mess deactivation logic in the Database + Queue module.
- Keep this contract consistent across Database, Queue, Kitchen, and Super Admin modules.

## 8. Testing Expectations

Tests should verify:

- Successful increments for Counter, Mess, and Hostel.
- Queue and initial history insertion in the same transaction.
- Queue creation rejection when Counter is inactive.
- Queue creation rejection when Mess is inactive.
- Queue creation rejection when Hostel is inactive.
- Transaction retry behavior.
- Queue creation rejection if a parent becomes inactive before a retry.
- Deactivation updates increment the same `queueMutationVersion` field.

Mocked transaction tests verify application logic. Actual concurrent transaction behavior should be verified separately using a MongoDB replica-set integration test environment.