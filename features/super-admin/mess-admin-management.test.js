import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMessAdminListPath,
  createLatestRequestGuard,
  createMessAdminActions,
  filterMessAdmins,
  getActiveHostels,
  validateAssignmentHostel,
} from "./mess-admin-management.js";

const accounts = [
  { id: "pending-1", name: "Asha", email: "asha@example.test", status: "PENDING", hostelId: null },
  { id: "active-1", name: "Dev", email: "dev@example.test", status: "ACTIVE", hostelId: "hostel-a" },
  { id: "rejected-1", name: "Mina", email: "mina@example.test", status: "REJECTED", hostelId: null },
  { id: "suspended-1", name: "Raj", email: "raj@example.test", status: "SUSPENDED", hostelId: null },
];

afterEach(() => vi.unstubAllGlobals());

describe("Mess Admin management UI behavior", () => {
  it("builds status-filtered list requests and filters account data", () => {
    expect(buildMessAdminListPath("")).toBe("/api/admin/mess-admins");
    expect(buildMessAdminListPath("PENDING")).toBe("/api/admin/mess-admins?status=PENDING");
    expect(filterMessAdmins(accounts, "ACTIVE")).toEqual([accounts[1]]);
    expect(filterMessAdmins(accounts, "")).toHaveLength(4);
  });

  it("requires Hostel selection before assignment", async () => {
    expect(validateAssignmentHostel("")).toMatch(/Select an active Hostel/);
    const refresh = vi.fn();
    const request = vi.fn();
    const actions = createMessAdminActions({ request, refresh });
    await expect(actions.assign("pending-1", "")).rejects.toThrow("Select an active Hostel");
    expect(request).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("approves and assigns using only hostelId, then refreshes the list", async () => {
    const request = vi.fn().mockResolvedValue({ hostelId: "hostel-a", messAdminId: "pending-1" });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const loadActiveHostels = vi.fn().mockResolvedValue([{ id: "hostel-a", status: "ACTIVE" }]);
    const actions = createMessAdminActions({ request, refresh, loadActiveHostels });

    await expect(actions.assign("pending-1", "hostel-a")).resolves.toMatchObject({
      message: "Mess Admin approved and assigned.",
    });
    expect(request).toHaveBeenCalledWith("/api/admin/mess-admins/pending-1/assign", {
      method: "POST",
      body: { hostelId: "hostel-a" },
    });
    expect(loadActiveHostels).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("revalidates the selected Hostel before assignment and rejects inactive options", async () => {
    const request = vi.fn();
    const loadActiveHostels = vi.fn().mockResolvedValue([
      { id: "hostel-a", status: "INACTIVE" },
      { id: "hostel-b", status: "ACTIVE" },
    ]);
    const refresh = vi.fn();
    const actions = createMessAdminActions({ request, refresh, loadActiveHostels });

    await expect(actions.assign("pending-1", "hostel-a")).rejects.toMatchObject({
      status: 409,
      code: "HOSTEL_INACTIVE",
    });
    expect(loadActiveHostels).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(getActiveHostels([
      { id: "hostel-a", status: "INACTIVE" },
      { id: "hostel-b", status: "ACTIVE" },
    ])).toEqual([{ id: "hostel-b", status: "ACTIVE" }]);
  });

  it("does not let an older pending Hostel response overwrite the latest response", async () => {
    const guard = createLatestRequestGuard();
    let visibleHostels = [];
    let visibleRequest = null;
    let resolveOld;
    let resolveNew;
    const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
    const newResponse = new Promise((resolve) => { resolveNew = resolve; });
    const oldRequest = guard.begin();
    const oldTask = oldResponse.then((records) => {
      if (oldRequest.isCurrent()) {
        visibleHostels = getActiveHostels(records);
        visibleRequest = "old";
      }
    });
    const newRequest = guard.begin();
    const newTask = newResponse.then((records) => {
      if (newRequest.isCurrent()) {
        visibleHostels = getActiveHostels(records);
        visibleRequest = "new";
      }
    });

    resolveNew([{ id: "hostel-new", status: "ACTIVE" }]);
    await newTask;
    resolveOld([{ id: "hostel-old", status: "ACTIVE" }]);
    await oldTask;

    expect(visibleRequest).toBe("new");
    expect(visibleHostels).toEqual([{ id: "hostel-new", status: "ACTIVE" }]);
  });

  it("rejects a pending account without sending a request body and refreshes", async () => {
    const request = vi.fn().mockResolvedValue({ status: "REJECTED" });
    const refresh = vi.fn();
    const actions = createMessAdminActions({ request, refresh });

    await actions.reject("pending-1");
    expect(request).toHaveBeenCalledWith("/api/admin/mess-admins/pending-1/reject", { method: "POST" });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("removes an active assignment with the expected Hostel ID and refreshes", async () => {
    const request = vi.fn().mockResolvedValue({ status: "ACTIVE", hostelId: null });
    const refresh = vi.fn();
    const actions = createMessAdminActions({ request, refresh });

    const result = await actions.removeAssignment("active-1", "hostel-a");
    expect(request).toHaveBeenCalledWith("/api/admin/mess-admins/active-1/assignment", {
      method: "DELETE",
      body: { hostelId: "hostel-a" },
    });
    expect(result.message).toMatch(/remains active and unassigned/);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("surfaces API errors and 409 assignment conflicts without refreshing", async () => {
    const conflict = Object.assign(new Error("The assignment changed. Refresh and try again."), { status: 409, code: "ASSIGNMENT_MISMATCH" });
    const request = vi.fn().mockRejectedValue(conflict);
    const refresh = vi.fn();
    const actions = createMessAdminActions({ request, refresh });

    await expect(actions.removeAssignment("active-1", "hostel-a")).rejects.toMatchObject({ status: 409, code: "ASSIGNMENT_MISMATCH" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports when a successful mutation could not refresh the list", async () => {
    const request = vi.fn().mockResolvedValue({ status: "REJECTED" });
    const refresh = vi.fn().mockRejectedValue(new Error("offline"));
    const actions = createMessAdminActions({ request, refresh });

    await expect(actions.reject("pending-1")).resolves.toMatchObject({
      message: expect.stringContaining("change was saved, but the list could not refresh"),
    });
  });
});
