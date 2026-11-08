import { AdminRequestError, requestAdminApi } from "./hostel-mess-api.js";

export const MESS_ADMIN_STATUSES = ["PENDING", "ACTIVE", "REJECTED", "SUSPENDED"];

export function buildMessAdminListPath(status) {
  return status ? `/api/admin/mess-admins?status=${encodeURIComponent(status)}` : "/api/admin/mess-admins";
}

export function filterMessAdmins(accounts, status) {
  return status ? accounts.filter((account) => account.status === status) : accounts;
}

export function createLatestRequestGuard() {
  let latestRequest = 0;
  return {
    begin() {
      const requestId = ++latestRequest;
      return { isCurrent: () => requestId === latestRequest };
    },
    invalidate() {
      latestRequest += 1;
    },
  };
}

export function getActiveHostels(hostels) {
  return hostels.filter((hostel) => hostel.status === "ACTIVE");
}

export function validateAssignmentHostel(hostelId) {
  return typeof hostelId === "string" && hostelId.length > 0
    ? ""
    : "Select an active Hostel before approving this request.";
}

export function createMessAdminActions({ request = requestAdminApi, refresh, loadActiveHostels }) {
  async function run(path, options, successMessage) {
    const data = await request(path, options);
    let refreshError = "";
    try {
      await refresh();
    } catch {
      refreshError = " The change was saved, but the list could not refresh. Use Refresh to reload it.";
    }
    return { data, message: `${successMessage}${refreshError}` };
  }

  return {
    assign(messAdminId, hostelId) {
      const validationError = validateAssignmentHostel(hostelId);
      if (validationError) return Promise.reject(new Error(validationError));
      return (async () => {
        const response = loadActiveHostels
          ? await loadActiveHostels()
          : await request("/api/admin/hostels");
        const activeHostels = getActiveHostels(Array.isArray(response) ? response : response?.items ?? []);
        if (!activeHostels.some((hostel) => hostel.id === hostelId)) {
          throw new AdminRequestError(
            "The selected Hostel is no longer active or available. Choose an active Hostel and try again.",
            { code: "HOSTEL_INACTIVE", status: 409 },
          );
        }
        return run(
          `/api/admin/mess-admins/${encodeURIComponent(messAdminId)}/assign`,
          { method: "POST", body: { hostelId } },
          "Mess Admin approved and assigned.",
        );
      })();
    },
    reject(messAdminId) {
      return run(
        `/api/admin/mess-admins/${encodeURIComponent(messAdminId)}/reject`,
        { method: "POST" },
        "Mess Admin request rejected.",
      );
    },
    removeAssignment(messAdminId, hostelId) {
      if (!hostelId) return Promise.reject(new Error("This account has no Hostel assignment to remove."));
      return run(
        `/api/admin/mess-admins/${encodeURIComponent(messAdminId)}/assignment`,
        { method: "DELETE", body: { hostelId } },
        "Hostel assignment removed. The account remains active and unassigned.",
      );
    },
  };
}
