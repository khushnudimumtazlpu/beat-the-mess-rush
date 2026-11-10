import { describe, expect, it, vi } from "vitest";
import {
  createStudentApprovalActions,
  getStudentApprovalErrorMessage,
  requestPendingStudents,
  studentApprovalErrorNeedsSignIn,
  STUDENT_APPROVAL_API_ROOTS,
} from "./student-approval-workflow.js";

describe("Student approval UI workflow", () => {
  it("loads pending records from the role-specific API and filters non-pending records defensively", async () => {
    const request = vi.fn().mockResolvedValue([
      { id: "student-a", status: "PENDING", role: "STUDENT" },
      { id: "student-b", status: "ACTIVE", role: "STUDENT" },
      { id: "admin-a", status: "PENDING", role: "MESS_ADMIN" },
    ]);

    await expect(requestPendingStudents({ audience: "messAdmin", request })).resolves.toEqual([
      { id: "student-a", status: "PENDING", role: "STUDENT" },
    ]);
    expect(request).toHaveBeenCalledWith(STUDENT_APPROVAL_API_ROOTS.messAdmin);

    await requestPendingStudents({ audience: "superAdmin", request });
    expect(request).toHaveBeenLastCalledWith(STUDENT_APPROVAL_API_ROOTS.superAdmin);
  });

  it("approves and refreshes without sending role, status, or Hostel values", async () => {
    const request = vi.fn().mockResolvedValue({ status: "ACTIVE" });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const actions = createStudentApprovalActions({ audience: "superAdmin", request, refresh });

    await expect(actions.approve("student/123")).resolves.toMatchObject({ message: "Student approved." });
    expect(request).toHaveBeenCalledWith("/api/admin/students/student%2F123/approve", { method: "POST" });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("rejects and refreshes after a successful decision", async () => {
    const request = vi.fn().mockResolvedValue({ status: "REJECTED" });
    const refresh = vi.fn();
    const actions = createStudentApprovalActions({ audience: "messAdmin", request, refresh });

    await actions.reject("student-id");
    expect(request).toHaveBeenCalledWith("/api/mess-admin/students/student-id/reject", { method: "POST" });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("preserves a conflict and does not refresh after a failed decision", async () => {
    const conflict = Object.assign(new Error("Only pending Students can be changed."), { status: 409, code: "STUDENT_NOT_PENDING" });
    const request = vi.fn().mockRejectedValue(conflict);
    const refresh = vi.fn();
    const actions = createStudentApprovalActions({ audience: "superAdmin", request, refresh });

    await expect(actions.approve("student-id")).rejects.toMatchObject({ status: 409, code: "STUDENT_NOT_PENDING" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports refresh failures without claiming that the decision failed", async () => {
    const request = vi.fn().mockResolvedValue({ status: "ACTIVE" });
    const refresh = vi.fn().mockRejectedValue(new Error("offline"));
    const actions = createStudentApprovalActions({ audience: "messAdmin", request, refresh });

    await expect(actions.approve("student-id")).resolves.toMatchObject({
      message: expect.stringContaining("decision was saved, but the list could not refresh"),
    });
  });

  it("provides safe messages for expired and unauthorized sessions", () => {
    expect(getStudentApprovalErrorMessage({ status: 401 })).toMatch(/session has expired/i);
    expect(getStudentApprovalErrorMessage({ status: 403 })).toMatch(/no longer has access/i);
    expect(getStudentApprovalErrorMessage(new Error("offline"))).toMatch(/Something went wrong/);
    expect(studentApprovalErrorNeedsSignIn({ status: 401 })).toBe(true);
    expect(studentApprovalErrorNeedsSignIn({ status: 403 })).toBe(false);
  });
});
