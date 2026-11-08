"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UserRoundX,
  X,
} from "lucide-react";
import { Badge } from "../../components/ui/badge.jsx";
import { Button } from "../../components/ui/button.jsx";
import { SelectField } from "../../components/ui/form-controls.jsx";
import { AdminEmptyState } from "./admin-page-primitives.jsx";
import { getAdminRequestMessage, requestAdminApi } from "./hostel-mess-api.js";
import {
  buildMessAdminListPath,
  createLatestRequestGuard,
  createMessAdminActions,
  filterMessAdmins,
  getActiveHostels,
  MESS_ADMIN_STATUSES,
  validateAssignmentHostel,
} from "./mess-admin-management.js";

const FILTER_OPTIONS = [
  { value: "", label: "All accounts" },
  ...MESS_ADMIN_STATUSES.map((status) => ({
    value: status,
    label: `${status.slice(0, 1)}${status.slice(1).toLowerCase()}`,
  })),
];

function StatusBadge({ status }) {
  const tone = status === "ACTIVE" ? "teal" : status === "PENDING" ? "lavender" : "coral";
  return <Badge tone={tone} dot>{status ?? "Unknown"}</Badge>;
}

function formatRegistrationDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function RequestNotice({ notice, onDismiss }) {
  if (!notice) return null;
  const success = notice.type === "success";
  const Icon = success ? CheckCircle2 : AlertCircle;
  return (
    <div className={`admin-notice admin-notice--${notice.type}`} role={success ? "status" : "alert"}>
      <Icon size={18} aria-hidden="true" />
      <span>{notice.message}</span>
      <button type="button" className="admin-notice__dismiss" onClick={onDismiss} aria-label="Dismiss message">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function getHostelName(hostels, hostelId) {
  return hostels.find((hostel) => hostel.id === hostelId)?.name ?? "Hostel record unavailable";
}

export function MessAdminManager() {
  const [statusFilter, setStatusFilter] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [hostelsLoading, setHostelsLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [hostelsError, setHostelsError] = useState("");
  const [notice, setNotice] = useState(null);
  const [selectedHostels, setSelectedHostels] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [busyAction, setBusyAction] = useState("");
  const requestVersion = useRef(0);
  const hostelRequestGuard = useRef(createLatestRequestGuard());

  const loadAccounts = useCallback(async () => {
    const version = ++requestVersion.current;
    setListLoading(true);
    setListError("");
    try {
      const result = await requestAdminApi(buildMessAdminListPath(statusFilter));
      if (version === requestVersion.current) setAccounts(Array.isArray(result) ? result : result?.items ?? []);
    } catch (error) {
      if (version === requestVersion.current) setListError(getAdminRequestMessage(error));
    } finally {
      if (version === requestVersion.current) setListLoading(false);
    }
  }, [statusFilter]);

  const loadHostels = useCallback(async () => {
    const request = hostelRequestGuard.current.begin();
    setHostelsLoading(true);
    setHostelsError("");
    try {
      const result = await requestAdminApi("/api/admin/hostels");
      const records = Array.isArray(result) ? result : result?.items ?? [];
      if (request.isCurrent()) setHostels(records);
      return getActiveHostels(records);
    } catch (error) {
      if (request.isCurrent()) setHostelsError(getAdminRequestMessage(error));
      throw error;
    } finally {
      if (request.isCurrent()) setHostelsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) loadAccounts(); });
    return () => { active = false; };
  }, [loadAccounts]);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) loadHostels().catch(() => {}); });
    return () => { active = false; };
  }, [loadHostels]);
  useEffect(() => () => {
    requestVersion.current += 1;
    hostelRequestGuard.current.invalidate();
  }, []);

  const filteredAccounts = filterMessAdmins(accounts, statusFilter);
  const pendingAccounts = accounts.some((account) => account.status === "PENDING");
  const activeHostels = getActiveHostels(hostels);

  function getActions() {
    return createMessAdminActions({ refresh: loadAccounts, loadActiveHostels: loadHostels });
  }

  async function performAction(actionKey, operation) {
    if (busyAction) return;
    setBusyAction(actionKey);
    setNotice(null);
    try {
      const result = await operation();
      setNotice({ type: "success", message: result.message });
      setValidationErrors((current) => ({ ...current, [actionKey]: "" }));
    } catch (error) {
      setNotice({ type: "error", message: getAdminRequestMessage(error) });
    } finally {
      setBusyAction("");
    }
  }

  function handleAssign(account) {
    const hostelId = selectedHostels[account.id] ?? "";
    const error = validateAssignmentHostel(hostelId);
    if (error) {
      setValidationErrors((current) => ({ ...current, [account.id]: error }));
      return;
    }
    setValidationErrors((current) => ({ ...current, [account.id]: "" }));
    performAction(account.id, () => getActions().assign(account.id, hostelId));
  }

  function handleReject(account) {
    if (typeof window !== "undefined" && !window.confirm(`Reject the pending request from ${account.name || account.email}?`)) return;
    performAction(account.id, () => getActions().reject(account.id));
  }

  function handleRemove(account) {
    const hostelName = getHostelName(hostels, account.hostelId);
    if (typeof window !== "undefined" && !window.confirm(
      `Remove ${account.name || account.email} from ${hostelName}? Their account will remain ACTIVE, but they will have no Hostel assignment.`,
    )) return;
    performAction(account.id, () => getActions().removeAssignment(account.id, account.hostelId));
  }

  return (
    <section className="admin-mess-admin-manager" aria-label="Mess Admin account management">
      <RequestNotice notice={notice} onDismiss={() => setNotice(null)} />

      <div className="admin-record-panel">
        <div className="admin-record-panel__heading admin-mess-admin-toolbar">
          <div>
            <span className="admin-overline">ACCOUNT DIRECTORY</span>
            <h2>Mess Admin accounts</h2>
            <p>Review requests and maintain one active Hostel assignment per account.</p>
          </div>
          <div className="admin-mess-admin-toolbar__actions">
            <SelectField
              label="Filter by status"
              value={statusFilter}
              onChange={(event) => { setNotice(null); setStatusFilter(event.target.value); }}
            >
              {FILTER_OPTIONS.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
            </SelectField>
              <Button type="button" variant="secondary" onClick={() => { loadAccounts(); loadHostels().catch(() => {}); }} disabled={listLoading}>
              {listLoading ? <LoaderCircle size={16} className="admin-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
              Refresh
            </Button>
          </div>
        </div>

        {listError ? (
          <div className="admin-inline-error" role="alert">
            <AlertCircle size={18} aria-hidden="true" /><span>{listError}</span>
            <Button type="button" variant="quiet" size="small" onClick={loadAccounts}>Try again</Button>
          </div>
        ) : null}

        {listLoading ? (
          <div className="admin-mess-admin-loading" role="status" aria-live="polite">
            <LoaderCircle className="admin-spin" size={19} aria-hidden="true" /> Loading Mess Admin accounts...
          </div>
        ) : !listError && filteredAccounts.length === 0 ? (
          <AdminEmptyState
            icon={ShieldCheck}
            title={statusFilter ? `No ${statusFilter.toLowerCase()} Mess Admin accounts` : "No Mess Admin accounts yet"}
            description="Accounts will appear here when a Mess Admin registers. No campus records are being simulated."
          />
        ) : !listError ? (
          <div className="admin-mess-admin-list" aria-label="Mess Admin accounts">
            {filteredAccounts.map((account) => {
              const isBusy = busyAction === account.id;
              const assignmentError = validationErrors[account.id];
              return (
                <article className="admin-mess-admin-card" key={account.id} aria-labelledby={`mess-admin-${account.id}`}>
                  <div className="admin-mess-admin-card__identity">
                    <span className="admin-mess-admin-card__avatar" aria-hidden="true"><Building2 size={19} /></span>
                    <div className="admin-mess-admin-card__details">
                      <h3 id={`mess-admin-${account.id}`}>{account.name || "Name unavailable"}</h3>
                      <a href={`mailto:${account.email}`} className="admin-mess-admin-card__email">{account.email}</a>
                    </div>
                    <StatusBadge status={account.status} />
                  </div>

                  <dl className="admin-mess-admin-card__meta">
                    <div><dt>Hostel assignment</dt><dd>{account.hostelId ? getHostelName(hostels, account.hostelId) : "Unassigned"}</dd></div>
                    <div><dt>Registered</dt><dd>{formatRegistrationDate(account.createdAt)}</dd></div>
                  </dl>

                  {account.status === "PENDING" ? (
                    <div className="admin-mess-admin-actions admin-mess-admin-actions--pending">
                      <SelectField
                        label={`Assign ${account.name || account.email} to an active Hostel`}
                        value={selectedHostels[account.id] ?? ""}
                        onChange={(event) => {
                          setSelectedHostels((current) => ({ ...current, [account.id]: event.target.value }));
                          setValidationErrors((current) => ({ ...current, [account.id]: "" }));
                        }}
                        error={assignmentError}
                        disabled={hostelsLoading || isBusy || activeHostels.length === 0}
                        required
                      >
                        <option value="">{hostelsLoading ? "Loading active Hostels..." : "Select a Hostel"}</option>
                        {activeHostels.map((hostel) => <option key={hostel.id} value={hostel.id}>{hostel.name}</option>)}
                      </SelectField>
                      {hostelsError ? <p className="admin-mess-admin-hostel-error" role="alert">Could not load Hostels: {hostelsError}</p> : null}
                      {!hostelsLoading && !hostelsError && activeHostels.length === 0 ? <p className="admin-mess-admin-hostel-error">No active Hostels are available for assignment.</p> : null}
                      <div className="admin-mess-admin-actions__buttons">
                        <Button type="button" disabled={isBusy || hostelsLoading || activeHostels.length === 0} onClick={() => handleAssign(account)}>
                          {isBusy ? <LoaderCircle className="admin-spin" size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                          Approve &amp; Assign
                        </Button>
                        <Button type="button" variant="quiet" disabled={isBusy} onClick={() => handleReject(account)}>
                          {isBusy ? <LoaderCircle className="admin-spin" size={16} aria-hidden="true" /> : <UserRoundX size={16} aria-hidden="true" />}
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {account.status === "ACTIVE" && account.hostelId ? (
                    <div className="admin-mess-admin-actions admin-mess-admin-actions--remove">
                      <p>This account is active and assigned to <strong>{getHostelName(hostels, account.hostelId)}</strong>.</p>
                      <Button type="button" variant="secondary" disabled={isBusy} onClick={() => handleRemove(account)}>
                        {isBusy ? <LoaderCircle className="admin-spin" size={16} aria-hidden="true" /> : <UserRoundX size={16} aria-hidden="true" />}
                        Remove Assignment
                      </Button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
      {pendingAccounts && hostelsError ? <p className="admin-sr-only" role="status">Hostel options are unavailable until the request succeeds.</p> : null}
    </section>
  );
}
