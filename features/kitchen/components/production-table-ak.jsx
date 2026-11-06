"use client";

// ─── Production Table (ak & _akk) ─────────────────────────────────────────────
// Lists production records for the active slot connected to the real backend database.
// Allows logging a new batch and updating status / portions served inline.

import { useState } from "react";
import { Plus, Check, AlertCircle, RefreshCw, Edit2 } from "lucide-react";
import { useKitchenStore } from "../services/kitchen-store-ak";
import { validateProduction } from "../utils/validation-ak";
import { kitchenSlots, productionStatuses } from "../data/kitchen-demo-data-ak";
import { withBuffer } from "../utils/calculations-ak";
import { mockDemandSummary } from "../data/kitchen-demo-data-ak";

const STATUS_COLORS = {
  Preparing: "coral",
  Ready: "teal",
  Completed: "lime",
};

const blankForm = {
  dishId: "",
  plannedPortions: "",
  actualPrepared: "",
  portionsServed: "",
  chef: "",
  status: "Preparing",
};

export function ProductionTable({ activeSlotId }) {
  const {
    productionRecords,
    addProductionRecord,
    updateProductionRecord,
    demandData,
    loading,
    refreshAll,
  } = useKitchenStore();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [editingServedId, setEditingServedId] = useState(null);
  const [servedInput, setServedInput] = useState("");

  // Records for this slot only (or all if not filtered)
  const slotRecords = productionRecords.filter((r) => r.slotId === activeSlotId);
  const slot = kitchenSlots.find((s) => s.id === activeSlotId);
  const demand =
    demandData && demandData.slotId === activeSlotId
      ? demandData
      : mockDemandSummary[activeSlotId];

  function handleChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setServerError("");
  }

  // Auto-fill planned portions from demand when dish changes
  function handleDishChange(dishId) {
    let planned = "";
    if (demand) {
      const match = demand.dishBreakdown?.find((d) => d.dishId === dishId);
      if (match) {
        planned = match.recommendedTarget || withBuffer(match.studentDemand, demand.bufferPct ?? 8);
      }
    }
    setForm((f) => ({ ...f, dishId, plannedPortions: planned }));
    setErrors((e) => ({ ...e, dishId: undefined }));
    setServerError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validateProduction(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    setServerError("");

    try {
      const today = new Date().toISOString().split("T")[0];
      const dishName = slot?.dishes.find((d) => d.id === form.dishId)?.name ?? form.dishId;

      await addProductionRecord({
        date: today,
        slotId: activeSlotId,
        dishId: form.dishId,
        dishName,
        plannedPortions: Number(form.plannedPortions) || 0,
        actualPrepared: Number(form.actualPrepared),
        portionsServed: Number(form.portionsServed) || 0,
        status: form.status,
        chef: form.chef || "Kitchen Staff",
      });

      setForm(blankForm);
      setErrors({});
      setShowForm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setServerError(err.message || "Failed to save record.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(recordId, nextStatus) {
    try {
      await updateProductionRecord(recordId, { status: nextStatus });
    } catch (err) {
      setServerError(err.message || "Failed to update status.");
    }
  }

  async function handleServedSave(record) {
    const val = Number(servedInput);
    if (!Number.isFinite(val) || val < 0) {
      setServerError("Portions served must be 0 or more.");
      return;
    }
    if (val > record.actualPrepared) {
      setServerError("Portions served cannot exceed portions prepared.");
      return;
    }

    try {
      await updateProductionRecord(record.id, { portionsServed: val });
      setEditingServedId(null);
      setServedInput("");
      setServerError("");
    } catch (err) {
      setServerError(err.message || "Failed to update portions served.");
    }
  }

  return (
    <div className="kitchen-panel">
      <div className="kitchen-panel-header">
        <div>
          <span className="kitchen-overline">Database Records</span>
          <h2 className="kitchen-panel-title">Production Log</h2>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="kitchen-btn kitchen-btn--ghost"
            type="button"
            onClick={() => refreshAll()}
            title="Refresh database records"
            aria-label="Refresh records"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            className="kitchen-btn kitchen-btn--primary"
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setErrors({});
              setServerError("");
            }}
          >
            <Plus size={15} aria-hidden="true" /> Log Batch
          </button>
        </div>
      </div>

      {saved && (
        <div className="kitchen-success-banner" role="status">
          <Check size={14} aria-hidden="true" /> Production record saved to database.
        </div>
      )}

      {serverError && (
        <div className="kitchen-error-banner" role="alert" style={{ marginBlock: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(255,128,102,0.15)", borderRadius: "8px", color: "#b04533", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <AlertCircle size={15} /> {serverError}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form className="kitchen-form kitchen-form--inline" onSubmit={handleSubmit} noValidate>
          <div className="kitchen-form-grid">
            {/* Dish */}
            <div className="kitchen-field">
              <label className="kitchen-field-label">Dish <span>Required</span></label>
              <select
                className={`kitchen-field-control ${errors.dishId ? "kitchen-field-control--error" : ""}`}
                value={form.dishId}
                onChange={(e) => handleDishChange(e.target.value)}
              >
                <option value="">Select dish…</option>
                {slot?.dishes.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {errors.dishId && <p className="kitchen-field-error">{errors.dishId}</p>}
            </div>

            {/* Planned */}
            <div className="kitchen-field">
              <label className="kitchen-field-label">Planned Portions</label>
              <input
                className="kitchen-field-control"
                type="number"
                min="1"
                placeholder="Auto-filled from demand"
                value={form.plannedPortions}
                onChange={(e) => handleChange("plannedPortions", e.target.value)}
              />
            </div>

            {/* Actual Prepared */}
            <div className="kitchen-field">
              <label className="kitchen-field-label">Actually Prepared <span>Required</span></label>
              <input
                className={`kitchen-field-control ${errors.actualPrepared ? "kitchen-field-control--error" : ""}`}
                type="number"
                min="1"
                placeholder="e.g. 230"
                value={form.actualPrepared}
                onChange={(e) => handleChange("actualPrepared", e.target.value)}
              />
              {errors.actualPrepared && <p className="kitchen-field-error">{errors.actualPrepared}</p>}
            </div>

            {/* Portions Served */}
            <div className="kitchen-field">
              <label className="kitchen-field-label">Portions Served <span>Required</span></label>
              <input
                className={`kitchen-field-control ${errors.portionsServed ? "kitchen-field-control--error" : ""}`}
                type="number"
                min="0"
                placeholder="e.g. 214"
                value={form.portionsServed}
                onChange={(e) => handleChange("portionsServed", e.target.value)}
              />
              {errors.portionsServed && <p className="kitchen-field-error">{errors.portionsServed}</p>}
            </div>

            {/* Chef */}
            <div className="kitchen-field">
              <label className="kitchen-field-label">Prepared By</label>
              <input
                className="kitchen-field-control"
                type="text"
                placeholder="e.g. Chef Ramesh"
                value={form.chef}
                onChange={(e) => handleChange("chef", e.target.value)}
              />
            </div>

            {/* Status */}
            <div className="kitchen-field">
              <label className="kitchen-field-label">Status</label>
              <select
                className="kitchen-field-control"
                value={form.status}
                onChange={(e) => handleChange("status", e.target.value)}
              >
                {productionStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="kitchen-form-actions">
            <button className="kitchen-btn kitchen-btn--primary" type="submit" disabled={submitting}>
              {submitting ? "Saving to DB…" : "Save Record"}
            </button>
            <button
              className="kitchen-btn kitchen-btn--ghost"
              type="button"
              onClick={() => setShowForm(false)}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Records table */}
      {slotRecords.length === 0 ? (
        <p className="kitchen-muted">No production records for this slot yet.</p>
      ) : (
        <div className="kitchen-table-wrap">
          <table className="kitchen-table">
            <thead>
              <tr>
                <th>Dish</th>
                <th>Planned</th>
                <th>Prepared</th>
                <th>Served</th>
                <th>Leftover</th>
                <th>Chef</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {slotRecords.map((r) => {
                const leftover = (r.actualPrepared ?? 0) - (r.portionsServed ?? 0);
                const isEditingServed = editingServedId === r.id;

                return (
                  <tr key={r.id}>
                    <td className="kitchen-table__dish">{r.dishName}</td>
                    <td>{r.plannedPortions}</td>
                    <td>{r.actualPrepared}</td>
                    <td>
                      {isEditingServed ? (
                        <span style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
                          <input
                            type="number"
                            min="0"
                            max={r.actualPrepared}
                            value={servedInput}
                            onChange={(e) => setServedInput(e.target.value)}
                            style={{ width: "4rem", padding: "0.2rem 0.4rem", borderRadius: "4px", border: "1px solid #ccc" }}
                          />
                          <button
                            type="button"
                            className="kitchen-btn kitchen-btn--primary"
                            style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
                            onClick={() => handleServedSave(r)}
                          >
                            <Check size={12} />
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                          {r.portionsServed}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingServedId(r.id);
                              setServedInput(String(r.portionsServed ?? 0));
                            }}
                            title="Update served count"
                            style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.6 }}
                          >
                            <Edit2 size={12} />
                          </button>
                        </span>
                      )}
                    </td>
                    <td className={leftover > 10 ? "kitchen-table__warn" : ""}>{leftover}</td>
                    <td className="kitchen-table__muted">{r.chef}</td>
                    <td>
                      <select
                        className={`kitchen-status-badge kitchen-status-badge--${STATUS_COLORS[r.status] ?? "neutral"}`}
                        value={r.status}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                        aria-label="Update status"
                      >
                        {productionStatuses.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
