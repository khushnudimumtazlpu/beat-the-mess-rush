"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Badge } from "../../components/ui/badge.jsx";
import { Button } from "../../components/ui/button.jsx";
import { InputField, TextAreaField } from "../../components/ui/form-controls.jsx";
import { AdminEmptyState } from "./admin-page-primitives.jsx";
import {
  getAdminRequestMessage,
  requestAdminApi,
  validateHostelInput,
  validateMessInput,
} from "./hostel-mess-api.js";

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"];
const EMPTY_VALUES = { name: "", code: "", description: "" };

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

export function messDataMatchesHostel(dataHostelId, selectedHostelId) {
  return Boolean(dataHostelId && selectedHostelId && dataHostelId === selectedHostelId);
}

function fetchHostels() {
  return requestAdminApi("/api/admin/hostels");
}

function fetchMesses(hostelId) {
  return requestAdminApi(`/api/admin/hostels/${encodeURIComponent(hostelId)}/messes`);
}

function StatusBadge({ status }) {
  const active = status === "ACTIVE";
  return <Badge tone={active ? "teal" : "coral"} dot>{status}</Badge>;
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

function FormActions({ onCancel, submitting, submitLabel }) {
  return (
    <div className="admin-form-actions">
      <Button type="button" variant="quiet" onClick={onCancel} disabled={submitting}>Cancel</Button>
      <Button type="submit" disabled={submitting}>
        {submitting ? <LoaderCircle className="admin-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
        {submitting ? "Saving..." : submitLabel}
      </Button>
    </div>
  );
}

export function HostelMessManager() {
  const [hostels, setHostels] = useState([]);
  const [hostelsLoading, setHostelsLoading] = useState(true);
  const [hostelsError, setHostelsError] = useState("");
  const [selectedHostelId, setSelectedHostelId] = useState("");
  const [messes, setMesses] = useState([]);
  const [messesHostelId, setMessesHostelId] = useState("");
  const [messesLoading, setMessesLoading] = useState(false);
  const [messesError, setMessesError] = useState("");
  const [messesErrorHostelId, setMessesErrorHostelId] = useState("");
  const [hostelForm, setHostelForm] = useState(null);
  const [messForm, setMessForm] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const messRequestGuard = useRef(null);
  if (messRequestGuard.current == null) messRequestGuard.current = createLatestRequestGuard();

  const loadHostels = useCallback(async () => {
    setHostelsLoading(true);
    setHostelsError("");
    try {
      const records = await fetchHostels();
      setHostels(records);
      setSelectedHostelId((current) => (
        records.some((hostel) => hostel.id === current) ? current : records[0]?.id ?? ""
      ));
    } catch (error) {
      setHostelsError(getAdminRequestMessage(error));
    } finally {
      setHostelsLoading(false);
    }
  }, []);

  const loadMesses = useCallback(async (hostelId) => {
    const request = messRequestGuard.current.begin();
    setMessesLoading(true);
    setMessesError("");
    setMessesErrorHostelId("");
    setMessesHostelId("");
    setMesses([]);
    try {
      const records = await fetchMesses(hostelId);
      if (request.isCurrent()) {
        setMesses(records);
        setMessesHostelId(hostelId);
      }
    } catch (error) {
      if (request.isCurrent()) {
        setMesses([]);
        setMessesError(getAdminRequestMessage(error));
        setMessesErrorHostelId(hostelId);
      }
    } finally {
      if (request.isCurrent()) setMessesLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(fetchHostels)
      .then((records) => {
        if (!active) return;
        setHostels(records);
        setSelectedHostelId((current) => (
          records.some((hostel) => hostel.id === current) ? current : records[0]?.id ?? ""
        ));
      })
      .catch((error) => { if (active) setHostelsError(getAdminRequestMessage(error)); })
      .finally(() => { if (active) setHostelsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedHostelId) return undefined;
    let active = true;
    const request = messRequestGuard.current.begin();
    Promise.resolve()
      .then(() => fetchMesses(selectedHostelId))
      .then((records) => {
        if (active && request.isCurrent()) {
          setMesses(records);
          setMessesHostelId(selectedHostelId);
        }
      })
      .catch((error) => {
        if (active && request.isCurrent()) {
          setMesses([]);
          setMessesError(getAdminRequestMessage(error));
          setMessesErrorHostelId(selectedHostelId);
        }
      })
      .finally(() => {
        if (active && request.isCurrent()) setMessesLoading(false);
      });
    Promise.resolve().then(() => {
      if (active && request.isCurrent()) {
        setMessesLoading(true);
        setMessesError("");
        setMessesErrorHostelId("");
      }
    });
    return () => {
      active = false;
      messRequestGuard.current.invalidate();
    };
  }, [selectedHostelId]);

  const selectedHostel = hostels.find((hostel) => hostel.id === selectedHostelId) ?? null;
  const hasSelectedHostelMesses = messDataMatchesHostel(messesHostelId, selectedHostelId);
  const selectedHostelMessesError = messDataMatchesHostel(messesErrorHostelId, selectedHostelId)
    ? messesError
    : "";

  function startHostelForm(hostel = null) {
    setNotice(null);
    setHostelForm({
      id: hostel?.id ?? null,
      mode: hostel ? "edit" : "create",
      values: hostel ? {
        name: hostel.name,
        code: hostel.code,
        description: hostel.description ?? "",
      } : { ...EMPTY_VALUES },
      errors: {},
      submitting: false,
    });
    setMessForm(null);
  }

  function startMessForm(mess = null) {
    setNotice(null);
    setMessForm({
      id: mess?.id ?? null,
      mode: mess ? "edit" : "create",
      values: mess ? {
        name: mess.name,
        code: mess.code,
        description: mess.description ?? "",
        mealTypes: [...mess.mealTypes],
      } : { ...EMPTY_VALUES, mealTypes: [] },
      errors: {},
      submitting: false,
    });
    setHostelForm(null);
  }

  function updateFormValue(formName, field, value) {
    const update = formName === "hostel" ? setHostelForm : setMessForm;
    update((form) => form ? {
      ...form,
      values: { ...form.values, [field]: value },
      errors: { ...form.errors, [field]: undefined },
    } : form);
  }

  async function submitHostel(event) {
    event.preventDefault();
    if (!hostelForm) return;
    const errors = validateHostelInput(hostelForm.values);
    if (Object.keys(errors).length) {
      setHostelForm((form) => ({ ...form, errors }));
      return;
    }
    setHostelForm((form) => ({ ...form, submitting: true, errors: {} }));
    const payload = {
      name: hostelForm.values.name.trim(),
      code: hostelForm.values.code.trim().toUpperCase(),
      description: hostelForm.values.description.trim(),
    };
    try {
      const isEdit = hostelForm.mode === "edit";
      const result = await requestAdminApi(
        isEdit ? `/api/admin/hostels/${encodeURIComponent(hostelForm.id)}` : "/api/admin/hostels",
        { method: isEdit ? "PATCH" : "POST", body: payload },
      );
      setHostels((records) => isEdit
        ? records.map((record) => record.id === result.id ? result : record)
        : [result, ...records]);
      setSelectedHostelId(result.id);
      setHostelForm(null);
      setNotice({ type: "success", message: isEdit ? "Hostel details updated." : "Hostel created." });
    } catch (error) {
      setHostelForm((form) => ({ ...form, submitting: false }));
      setNotice({ type: "error", message: getAdminRequestMessage(error) });
    }
  }

  async function submitMess(event) {
    event.preventDefault();
    if (!messForm || !selectedHostel) return;
    const errors = validateMessInput(messForm.values);
    if (Object.keys(errors).length) {
      setMessForm((form) => ({ ...form, errors }));
      return;
    }
    setMessForm((form) => ({ ...form, submitting: true, errors: {} }));
    const payload = {
      name: messForm.values.name.trim(),
      code: messForm.values.code.trim().toUpperCase(),
      description: messForm.values.description.trim(),
      mealTypes: messForm.values.mealTypes,
    };
    const basePath = `/api/admin/hostels/${encodeURIComponent(selectedHostel.id)}/messes`;
    try {
      const isEdit = messForm.mode === "edit";
      const result = await requestAdminApi(
        isEdit ? `${basePath}/${encodeURIComponent(messForm.id)}` : basePath,
        { method: isEdit ? "PATCH" : "POST", body: payload },
      );
      setMessForm(null);
      setNotice({ type: "success", message: isEdit ? "Mess details updated." : "Mess created." });
      await loadMesses(selectedHostel.id);
      if (!result || !result.id) setMessesError("The server response did not include the saved Mess.");
    } catch (error) {
      setMessForm((form) => ({ ...form, submitting: false }));
      setNotice({ type: "error", message: getAdminRequestMessage(error) });
    }
  }

  async function changeHostelStatus(hostel) {
    const nextStatus = hostel.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (nextStatus === "INACTIVE" && !window.confirm(
      `Deactivate ${hostel.name}? All child Messes will become inactive and its open Queues will close. Queue records and history are preserved. Reactivating this Hostel will not reactivate Messes or reopen Queues.`,
    )) return;
    setBusyAction(`hostel:${hostel.id}`);
    setNotice(null);
    try {
      const result = await requestAdminApi(`/api/admin/hostels/${encodeURIComponent(hostel.id)}/status`, {
        method: "PATCH",
        body: { status: nextStatus },
      });
      setHostels((records) => records.map((record) => record.id === result.id ? result : record));
      if (selectedHostelId === hostel.id && nextStatus === "INACTIVE") await loadMesses(hostel.id);
      setNotice({ type: "success", message: `${hostel.name} is now ${nextStatus}.` });
    } catch (error) {
      setNotice({ type: "error", message: getAdminRequestMessage(error) });
    } finally {
      setBusyAction("");
    }
  }

  async function changeMessStatus(mess) {
    const nextStatus = mess.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (nextStatus === "INACTIVE" && !window.confirm(
      `Deactivate ${mess.name}? Its open Queues will close and Queue history will be preserved. Other Messes will not be affected.`,
    )) return;
    if (!selectedHostel) return;
    setBusyAction(`mess:${mess.id}`);
    setNotice(null);
    try {
      await requestAdminApi(
        `/api/admin/hostels/${encodeURIComponent(selectedHostel.id)}/messes/${encodeURIComponent(mess.id)}/status`,
        { method: "PATCH", body: { status: nextStatus } },
      );
      await loadMesses(selectedHostel.id);
      setNotice({ type: "success", message: `${mess.name} is now ${nextStatus}.` });
    } catch (error) {
      setNotice({ type: "error", message: getAdminRequestMessage(error) });
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="admin-hostel-manager">
      <RequestNotice notice={notice} onDismiss={() => setNotice(null)} />

      <section className="admin-record-panel admin-hostel-panel" aria-labelledby="hostels-title">
        <div className="admin-record-panel__heading">
          <div>
            <span className="admin-overline">CAMPUS DIRECTORY</span>
            <h2 id="hostels-title">Hostels</h2>
            <p>Select a hostel to manage its Messes.</p>
          </div>
          <Button onClick={() => startHostelForm()}>
            <Plus size={17} aria-hidden="true" /> Add Hostel
          </Button>
        </div>

        {hostelsLoading ? (
          <div className="admin-record-skeleton" role="status" aria-live="polite" aria-busy="true">
            <span className="admin-skeleton" /><span className="admin-skeleton" /><span className="admin-skeleton" />
            <span className="admin-sr-only">Loading hostels</span>
          </div>
        ) : hostelsError ? (
          <div className="admin-inline-error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{hostelsError}</span>
            <Button variant="secondary" size="small" onClick={() => void loadHostels()}>
              <RefreshCw size={15} aria-hidden="true" /> Retry
            </Button>
          </div>
        ) : hostels.length === 0 ? (
          <AdminEmptyState
            icon={Building2}
            title="No hostels yet"
            description="Create the first hostel to establish a home for campus Messes."
          />
        ) : (
          <div className="admin-hostel-list" role="list" aria-label="Hostel records">
            {hostels.map((hostel) => {
              const selected = selectedHostelId === hostel.id;
              return (
                <article className={`admin-hostel-card${selected ? " is-selected" : ""}`} key={hostel.id} role="listitem">
                  <button
                    type="button"
                    className="admin-hostel-card__select"
                    aria-pressed={selected}
                    onClick={() => { setSelectedHostelId(hostel.id); setHostelForm(null); setMessForm(null); setNotice(null); }}
                  >
                    <span className="admin-hostel-card__icon"><Building2 size={19} aria-hidden="true" /></span>
                    <span className="admin-hostel-card__copy">
                      <strong>{hostel.name}</strong>
                      <span>{hostel.code}</span>
                    </span>
                    <StatusBadge status={hostel.status} />
                    <ChevronRight className="admin-hostel-card__chevron" size={17} aria-hidden="true" />
                  </button>
                  <div className="admin-hostel-card__actions" aria-label={`${hostel.name} actions`}>
                    <Button variant="quiet" size="small" onClick={() => startHostelForm(hostel)} aria-label={`Edit ${hostel.name}`}>
                      <Pencil size={14} aria-hidden="true" /> Edit
                    </Button>
                    <Button
                      variant={hostel.status === "ACTIVE" ? "secondary" : "quiet"}
                      size="small"
                      disabled={busyAction === `hostel:${hostel.id}`}
                      onClick={() => void changeHostelStatus(hostel)}
                    >
                      {busyAction === `hostel:${hostel.id}` ? <LoaderCircle className="admin-spin" size={14} aria-hidden="true" /> : <Power size={14} aria-hidden="true" />}
                      {hostel.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {hostelForm ? (
          <form className="admin-record-form" onSubmit={submitHostel} noValidate aria-labelledby="hostel-form-title">
            <div className="admin-record-form__heading">
              <div>
                <span className="admin-overline">{hostelForm.mode === "edit" ? "UPDATE RECORD" : "NEW CAMPUS LOCATION"}</span>
                <h3 id="hostel-form-title">{hostelForm.mode === "edit" ? "Edit hostel" : "Create hostel"}</h3>
              </div>
              <button type="button" className="admin-icon-button" aria-label="Close hostel form" onClick={() => setHostelForm(null)}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="admin-form-grid">
              <InputField label="Hostel name" name="name" value={hostelForm.values.name} error={hostelForm.errors.name} required maxLength={80} onChange={(event) => updateFormValue("hostel", "name", event.target.value)} />
              <InputField label="Hostel code" name="code" value={hostelForm.values.code} error={hostelForm.errors.code} hint="3–20 letters, numbers, or hyphens." required maxLength={20} onChange={(event) => updateFormValue("hostel", "code", event.target.value)} />
              <TextAreaField label="Description" name="description" value={hostelForm.values.description} error={hostelForm.errors.description} hint="Optional, up to 250 characters." maxLength={250} onChange={(event) => updateFormValue("hostel", "description", event.target.value)} />
            </div>
            <FormActions onCancel={() => setHostelForm(null)} submitting={hostelForm.submitting} submitLabel={hostelForm.mode === "edit" ? "Save changes" : "Create hostel"} />
          </form>
        ) : null}
      </section>

      <section className="admin-record-panel admin-mess-panel" aria-labelledby="messes-title">
        <div className="admin-record-panel__heading">
          <div>
            <span className="admin-overline">HOSTEL OPERATIONS</span>
            <h2 id="messes-title">{selectedHostel ? selectedHostel.name : "Messes"}</h2>
            <p>{selectedHostel ? `Messes associated with ${selectedHostel.code}.` : "Select a hostel to view its Messes."}</p>
          </div>
          <Button onClick={() => startMessForm()} disabled={!selectedHostel || selectedHostel.status !== "ACTIVE"}>
            <Plus size={17} aria-hidden="true" /> Add Mess
          </Button>
        </div>

        {selectedHostel && selectedHostel.status === "INACTIVE" ? (
          <div className="admin-inline-note"><AlertCircle size={17} aria-hidden="true" /> This Hostel is inactive. Activate it before creating or reactivating a Mess.</div>
        ) : null}
        {!selectedHostel && !hostelsLoading && !hostelsError ? (
          <AdminEmptyState icon={UtensilsCrossed} title="Choose a hostel first" description="Select a hostel above to load its associated Messes." />
        ) : null}
        {selectedHostel && (messesLoading || (!hasSelectedHostelMesses && !selectedHostelMessesError)) ? (
          <div className="admin-record-skeleton admin-record-skeleton--messes" role="status" aria-live="polite" aria-busy="true">
            <span className="admin-skeleton" /><span className="admin-skeleton" />
            <span className="admin-sr-only">Loading Messes</span>
          </div>
        ) : null}
        {selectedHostel && !messesLoading && selectedHostelMessesError ? (
          <div className="admin-inline-error" role="alert">
            <AlertCircle size={18} aria-hidden="true" /><span>{selectedHostelMessesError}</span>
            <Button variant="secondary" size="small" onClick={() => void loadMesses(selectedHostel.id)}>
              <RefreshCw size={15} aria-hidden="true" /> Retry
            </Button>
          </div>
        ) : null}
        {selectedHostel && !messesLoading && hasSelectedHostelMesses && !selectedHostelMessesError && messes.length === 0 ? (
          <AdminEmptyState icon={UtensilsCrossed} title="No Messes in this Hostel" description="Add a Mess and select the meal services it supports." />
        ) : null}
        {selectedHostel && !messesLoading && hasSelectedHostelMesses && !selectedHostelMessesError && messes.length > 0 ? (
          <div className="admin-mess-list" aria-label={`Messes in ${selectedHostel.name}`}>
            {messes.map((mess) => (
              <article className="admin-mess-card" key={mess.id}>
                <div className="admin-mess-card__top">
                  <span className="admin-mess-card__icon"><UtensilsCrossed size={18} aria-hidden="true" /></span>
                  <div className="admin-mess-card__identity">
                    <h3>{mess.name}</h3>
                    <span>{mess.code}</span>
                  </div>
                  <StatusBadge status={mess.status} />
                </div>
                {mess.description ? <p className="admin-mess-card__description">{mess.description}</p> : null}
                <div className="admin-mess-card__meals" aria-label="Meal types">
                  {mess.mealTypes.map((mealType) => <Badge key={mealType} tone="lavender">{mealType}</Badge>)}
                </div>
                <div className="admin-mess-card__actions">
                  <Button variant="quiet" size="small" onClick={() => startMessForm(mess)} aria-label={`Edit ${mess.name}`}>
                    <Pencil size={14} aria-hidden="true" /> Edit
                  </Button>
                  <Button
                    variant={mess.status === "ACTIVE" ? "secondary" : "quiet"}
                    size="small"
                    disabled={busyAction === `mess:${mess.id}` || (mess.status === "INACTIVE" && selectedHostel.status !== "ACTIVE")}
                    onClick={() => void changeMessStatus(mess)}
                  >
                    {busyAction === `mess:${mess.id}` ? <LoaderCircle className="admin-spin" size={14} aria-hidden="true" /> : <Power size={14} aria-hidden="true" />}
                    {mess.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {messForm && selectedHostel ? (
          <form className="admin-record-form" onSubmit={submitMess} noValidate aria-labelledby="mess-form-title">
            <div className="admin-record-form__heading">
              <div>
                <span className="admin-overline">{messForm.mode === "edit" ? "UPDATE RECORD" : `NEW MESS · ${selectedHostel.code}`}</span>
                <h3 id="mess-form-title">{messForm.mode === "edit" ? "Edit Mess" : "Create Mess"}</h3>
              </div>
              <button type="button" className="admin-icon-button" aria-label="Close Mess form" onClick={() => setMessForm(null)}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="admin-form-grid">
              <InputField label="Mess name" name="name" value={messForm.values.name} error={messForm.errors.name} required maxLength={80} onChange={(event) => updateFormValue("mess", "name", event.target.value)} />
              <InputField label="Mess code" name="code" value={messForm.values.code} error={messForm.errors.code} hint="Unique within this Hostel; 3–20 letters, numbers, or hyphens." required maxLength={20} onChange={(event) => updateFormValue("mess", "code", event.target.value)} />
              <TextAreaField label="Description" name="description" value={messForm.values.description} error={messForm.errors.description} hint="Optional, up to 250 characters." maxLength={250} onChange={(event) => updateFormValue("mess", "description", event.target.value)} />
              <fieldset
                className="admin-meal-types"
                aria-invalid={messForm.errors.mealTypes ? "true" : undefined}
                aria-describedby={messForm.errors.mealTypes ? "mess-meal-types-error" : undefined}
              >
                <legend>Meal types <span>Required · select at least one</span></legend>
                <div className="admin-meal-types__options">
                  {MEAL_TYPES.map((mealType) => {
                    const checked = messForm.values.mealTypes.includes(mealType);
                    return (
                      <label className={`admin-meal-option${checked ? " is-selected" : ""}`} key={mealType}>
                        <input
                          type="checkbox"
                          name="mealTypes"
                          value={mealType}
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...messForm.values.mealTypes, mealType]
                              : messForm.values.mealTypes.filter((value) => value !== mealType);
                            updateFormValue("mess", "mealTypes", next);
                          }}
                        />
                        <span>{mealType}</span>
                      </label>
                    );
                  })}
                </div>
                {messForm.errors.mealTypes ? <p className="ui-field__error" id="mess-meal-types-error" role="alert">{messForm.errors.mealTypes}</p> : null}
              </fieldset>
            </div>
            <FormActions onCancel={() => setMessForm(null)} submitting={messForm.submitting} submitLabel={messForm.mode === "edit" ? "Save changes" : "Create Mess"} />
          </form>
        ) : null}
      </section>
    </div>
  );
}
