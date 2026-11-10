"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, GraduationCap, LoaderCircle, RefreshCw, ShieldAlert, X } from "lucide-react";
import { Badge } from "../../components/ui/badge.jsx";
import { Button } from "../../components/ui/button.jsx";
import { AdminEmptyState, AdminPageHeading } from "../super-admin/admin-page-primitives.jsx";
import { getAdminRequestMessage, requestAdminApi } from "../super-admin/hostel-mess-api.js";
import {
  createStudentApprovalActions,
  getStudentApprovalErrorMessage,
  requestPendingStudents,
  studentApprovalErrorNeedsSignIn,
} from "./student-approval-workflow.js";

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function Notice({ notice, onDismiss }) {
  if (!notice) return null;
  const isSuccess = notice.type === "success";
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;
  return (
    <div className={`admin-notice admin-notice--${notice.type}`} role={isSuccess ? "status" : "alert"}>
      <Icon size={18} aria-hidden="true" />
      <span>{notice.message}</span>
      {notice.loginRequired ? (
        <Link className="font-semibold underline underline-offset-4" href="/login">Sign in</Link>
      ) : null}
      <button type="button" className="admin-notice__dismiss" onClick={onDismiss} aria-label="Dismiss message">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="admin-mess-admin-loading" role="status" aria-live="polite">
      <LoaderCircle className="admin-spin" size={18} aria-hidden="true" />
      <span>Loading pending Student requests…</span>
    </div>
  );
}

export function StudentApprovalManager({ audience }) {
  const isSuperAdmin = audience === "superAdmin";
  const title = isSuperAdmin ? "Student approvals" : "Students at your Hostel";
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busyStudentId, setBusyStudentId] = useState("");
  const requestVersion = useRef(0);
  const actionLock = useRef(false);

  const loadStudents = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const records = await requestPendingStudents({ audience, request: requestAdminApi });
      if (version === requestVersion.current) setStudents(records);
      return records;
    } catch (requestError) {
      if (version === requestVersion.current) {
        setError(getStudentApprovalErrorMessage(requestError));
      }
      throw requestError;
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [audience]);

  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(() => {
      if (mounted) loadStudents().catch(() => {});
    });
    return () => {
      mounted = false;
      requestVersion.current += 1;
    };
  }, [loadStudents]);

  async function performDecision(student, decision) {
    if (actionLock.current) return;
    if (decision === "reject" && !window.confirm(`Reject the pending request from ${student.name || student.email}?`)) return;

    actionLock.current = true;
    setBusyStudentId(student.id);
    setNotice(null);
    try {
      const actions = createStudentApprovalActions({
        audience,
        request: requestAdminApi,
        refresh: loadStudents,
      });
      const result = await actions[decision](student.id);
      setNotice({ type: "success", message: result.message });
    } catch (decisionError) {
      setNotice({
        type: "error",
        message: getStudentApprovalErrorMessage(decisionError),
        loginRequired: studentApprovalErrorNeedsSignIn(decisionError),
      });
    } finally {
      actionLock.current = false;
      setBusyStudentId("");
    }
  }

  return (
    <div className="admin-hostel-page">
      <AdminPageHeading
        eyebrow={isSuperAdmin ? "SUPER ADMIN" : "MESS ADMIN"}
        title={title}
        description={isSuperAdmin
          ? "Review pending Student registrations across every Hostel."
          : "Review pending Student registrations assigned to your Hostel."}
      />

      <section className="admin-record-panel" aria-labelledby="student-approval-list-title">
        <div className="admin-record-panel__heading">
          <div>
            <Badge tone="lavender" dot>Pending review</Badge>
            <h2 id="student-approval-list-title">Registration requests</h2>
            <p>{loading ? "Loading requests" : `${students.length} pending ${students.length === 1 ? "request" : "requests"}`}</p>
          </div>
          <Button variant="secondary" size="small" onClick={() => loadStudents().catch(() => {})} disabled={loading || Boolean(busyStudentId)}>
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </Button>
        </div>

        <Notice notice={notice} onDismiss={() => setNotice(null)} />

        {error ? (
          <div className="admin-inline-error" role="alert">
            <ShieldAlert size={18} aria-hidden="true" />
            <span>{error}</span>
            {error.toLowerCase().includes("session has expired") ? (
              <Link className="font-semibold underline underline-offset-4" href="/login">Sign in</Link>
            ) : null}
          </div>
        ) : null}

        {loading ? <LoadingState /> : null}

        {!loading && !error && students.length === 0 ? (
          <AdminEmptyState
            icon={GraduationCap}
            title="No pending Student requests"
            description="New registrations awaiting approval will appear here."
          />
        ) : null}

        {!loading && !error && students.length > 0 ? (
          <div className="grid gap-3">
            {students.map((student) => (
              <article className="admin-mess-admin-card" key={student.id}>
                <div className="admin-mess-admin-card__identity">
                  <span className="admin-mess-admin-card__avatar" aria-hidden="true"><GraduationCap size={20} /></span>
                  <div className="admin-mess-admin-card__details">
                    <h3>{student.name || "Student"}</h3>
                    <span className="admin-mess-admin-card__email">{student.email || "Email unavailable"}</span>
                  </div>
                  <Badge tone="lavender" dot>PENDING</Badge>
                </div>
                <dl className="admin-mess-admin-card__meta">
                  <div>
                    <dt>Registered</dt>
                    <dd><time dateTime={student.createdAt ?? undefined}>{formatDate(student.createdAt)}</time></dd>
                  </div>
                  {isSuperAdmin ? (
                    <div>
                      <dt>Hostel</dt>
                      <dd>{student.hostelId || "Assignment unavailable"}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="admin-mess-admin-actions">
                  <p className="m-0 text-sm text-muted">Approving activates this Student account.</p>
                  <div className="admin-mess-admin-actions__buttons">
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => performDecision(student, "approve")}
                      disabled={Boolean(busyStudentId)}
                    >
                      {busyStudentId === student.id ? <LoaderCircle className="admin-spin" size={15} aria-hidden="true" /> : null}
                      {busyStudentId === student.id ? "Saving…" : "Approve"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => performDecision(student, "reject")}
                      disabled={Boolean(busyStudentId)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
