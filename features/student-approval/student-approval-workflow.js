import { getAdminRequestMessage, requestAdminApi } from "../super-admin/hostel-mess-api.js";

export const STUDENT_APPROVAL_API_ROOTS = Object.freeze({
  messAdmin: "/api/mess-admin/students",
  superAdmin: "/api/admin/students",
});

export async function requestPendingStudents({ audience, request = requestAdminApi }) {
  const apiRoot = STUDENT_APPROVAL_API_ROOTS[audience];
  if (!apiRoot) throw new TypeError("A supported Student approval audience is required.");

  const response = await request(apiRoot);
  const records = Array.isArray(response) ? response : response?.items;
  return Array.isArray(records)
    ? records.filter((student) => student?.status === "PENDING" && student?.role !== "MESS_ADMIN" && student?.role !== "SUPER_ADMIN")
    : [];
}

export function getStudentApprovalErrorMessage(error) {
  if (error?.status === 401) return "Your session has expired. Sign in again to continue.";
  if (error?.status === 403) return "Your account no longer has access to Student approvals. Contact your administrator if this seems wrong.";
  return getAdminRequestMessage(error);
}

export function studentApprovalErrorNeedsSignIn(error) {
  return error?.status === 401;
}

export function createStudentApprovalActions({ audience, request = requestAdminApi, refresh }) {
  const apiRoot = STUDENT_APPROVAL_API_ROOTS[audience];
  if (!apiRoot) throw new TypeError("A supported Student approval audience is required.");

  async function decide(studentId, decision) {
    if (decision !== "approve" && decision !== "reject") {
      throw new TypeError("A supported Student decision is required.");
    }

    const result = await request(`${apiRoot}/${encodeURIComponent(studentId)}/${decision}`, {
      method: "POST",
    });
    let message = decision === "approve" ? "Student approved." : "Student rejected.";
    try {
      await refresh();
    } catch {
      message += " The decision was saved, but the list could not refresh. Use Refresh to reload.";
    }
    return { data: result, message };
  }

  return {
    approve(studentId) {
      return decide(studentId, "approve");
    },
    reject(studentId) {
      return decide(studentId, "reject");
    },
  };
}
