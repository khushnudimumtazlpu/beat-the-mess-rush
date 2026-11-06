"use client";

// ─── Waste Entry Form (ak & _akk) ─────────────────────────────────────────────
// Lets kitchen staff log food waste after a service shift directly to the database.
// Fields: meal slot, dish name, category, weight (kg), reason.

import { useState } from "react";
import { Leaf, Check, AlertCircle, RefreshCw } from "lucide-react";
import { useKitchenStore } from "../services/kitchen-store-ak";
import { validateWaste } from "../utils/validation-ak";
import { kitchenSlots, wasteCategories } from "../data/kitchen-demo-data-ak";

const blankForm = {
  slotId: "",
  dishName: "",
  category: "",
  weightKg: "",
  reason: "",
};

// Benchmark cost estimate: ₹80 per kg (industry average across campus dining)
const COST_PER_KG = 80;

export function WasteEntryForm() {
  const { wasteRecords, addWasteRecord, refreshAll, loading } = useKitchenStore();
  const [form, setForm] = useState(blankForm);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const todayRecords = wasteRecords.filter((r) => r.date === today);

  function handleChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setServerError("");
  }

  // When slot changes, clear dishName so user picks a relevant dish
  function handleSlotChange(slotId) {
    setForm((f) => ({ ...f, slotId, dishName: "" }));
    setErrors((e) => ({ ...e, slotId: undefined, dishName: undefined }));
    setServerError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validateWaste(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    setServerError("");

    try {
      const kg = Number(form.weightKg);
      const portionsLost = Math.round(kg * 3); // standard portion calculation
      const costInr = Math.round(kg * COST_PER_KG);

      await addWasteRecord({
        date: today,
        slotId: form.slotId,
        dishName: form.dishName,
        category: form.category,
        weightKg: kg,
        portionsLost,
        costInr,
        reason: form.reason,
      });

      setForm(blankForm);
      setErrors({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setServerError(err.message || "Failed to log waste record.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedSlot = kitchenSlots.find((s) => s.id === form.slotId);

  return (
    <div className="kitchen-panel">
      <div className="kitchen-panel-header">
        <div>
          <span className="kitchen-overline">
            <Leaf size={12} aria-hidden="true" /> Post-Service Logging
          </span>
          <h2 className="kitchen-panel-title">Record Food Waste</h2>
        </div>
        <button
          className="kitchen-btn kitchen-btn--ghost"
          type="button"
          onClick={() => refreshAll()}
          title="Refresh records"
          aria-label="Refresh records"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {saved && (
        <div className="kitchen-success-banner" role="status">
          <Check size={14} aria-hidden="true" /> Waste record saved to database successfully.
        </div>
      )}

      {serverError && (
        <div className="kitchen-error-banner" role="alert" style={{ marginBlock: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(255,128,102,0.15)", borderRadius: "8px", color: "#b04533", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <AlertCircle size={15} /> {serverError}
        </div>
      )}

      <form className="kitchen-form" onSubmit={handleSubmit} noValidate>
        <div className="kitchen-form-grid">
          {/* Meal Slot */}
          <div className="kitchen-field">
            <label className="kitchen-field-label">Meal Slot <span>Required</span></label>
            <select
              className={`kitchen-field-control ${errors.slotId ? "kitchen-field-control--error" : ""}`}
              value={form.slotId}
              onChange={(e) => handleSlotChange(e.target.value)}
            >
              <option value="">Select meal slot…</option>
              {kitchenSlots.map((s) => (
                <option key={s.id} value={s.id}>{s.label} · {s.window}</option>
              ))}
            </select>
            {errors.slotId && <p className="kitchen-field-error">{errors.slotId}</p>}
          </div>

          {/* Dish Name */}
          <div className="kitchen-field">
            <label className="kitchen-field-label">Dish Name <span>Required</span></label>
            {selectedSlot ? (
              <select
                className={`kitchen-field-control ${errors.dishName ? "kitchen-field-control--error" : ""}`}
                value={form.dishName}
                onChange={(e) => handleChange("dishName", e.target.value)}
              >
                <option value="">Select dish…</option>
                {selectedSlot.dishes.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
                <option value="Other">Other</option>
              </select>
            ) : (
              <input
                className="kitchen-field-control"
                type="text"
                placeholder="Select a slot first"
                disabled
              />
            )}
            {errors.dishName && <p className="kitchen-field-error">{errors.dishName}</p>}
          </div>

          {/* Category */}
          <div className="kitchen-field">
            <label className="kitchen-field-label">Waste Category <span>Required</span></label>
            <select
              className={`kitchen-field-control ${errors.category ? "kitchen-field-control--error" : ""}`}
              value={form.category}
              onChange={(e) => handleChange("category", e.target.value)}
            >
              <option value="">Select category…</option>
              {wasteCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.label} — {c.desc}</option>
              ))}
            </select>
            {errors.category && <p className="kitchen-field-error">{errors.category}</p>}
          </div>

          {/* Weight */}
          <div className="kitchen-field">
            <label className="kitchen-field-label">Weight (kg) <span>Required</span></label>
            <input
              className={`kitchen-field-control ${errors.weightKg ? "kitchen-field-control--error" : ""}`}
              type="number"
              min="0.1"
              step="0.1"
              placeholder="e.g. 4.5"
              value={form.weightKg}
              onChange={(e) => handleChange("weightKg", e.target.value)}
            />
            {errors.weightKg && <p className="kitchen-field-error">{errors.weightKg}</p>}
            {form.weightKg && Number(form.weightKg) >= 0.1 && (
              <p className="kitchen-field-hint">
                Est. cost loss: ₹{Math.round(Number(form.weightKg) * COST_PER_KG)}
              </p>
            )}
          </div>

          {/* Reason */}
          <div className="kitchen-field kitchen-field--full">
            <label className="kitchen-field-label">Reason / Root Cause <span>Required</span></label>
            <textarea
              className={`kitchen-field-control kitchen-field-control--textarea ${errors.reason ? "kitchen-field-control--error" : ""}`}
              rows={3}
              placeholder="e.g. Low turnout during last 30 minutes of service window"
              value={form.reason}
              onChange={(e) => handleChange("reason", e.target.value)}
            />
            {errors.reason && <p className="kitchen-field-error">{errors.reason}</p>}
          </div>
        </div>

        <div className="kitchen-form-actions">
          <button className="kitchen-btn kitchen-btn--primary" type="submit" disabled={submitting}>
            {submitting ? "Saving to Database…" : "Save Waste Record"}
          </button>
          <button
            className="kitchen-btn kitchen-btn--ghost"
            type="button"
            onClick={() => {
              setForm(blankForm);
              setErrors({});
              setServerError("");
            }}
            disabled={submitting}
          >
            Clear
          </button>
        </div>
      </form>

      {/* Today's waste log */}
      {todayRecords.length > 0 && (
        <div className="kitchen-waste-recent">
          <p className="kitchen-overline" style={{ marginBottom: "0.75rem" }}>
            Logged Today ({todayRecords.length} records in Database)
          </p>
          {todayRecords.map((r) => (
            <div key={r.id} className="kitchen-waste-row">
              <span className="kitchen-waste-row__dish">{r.dishName}</span>
              <span className={`kitchen-category-chip kitchen-category-chip--${(r.category || "").replace(" ", "-").toLowerCase()}`}>
                {r.category}
              </span>
              <span className="kitchen-waste-row__weight">{r.weightKg} kg</span>
              <span className="kitchen-waste-row__cost">₹{r.costInr}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
