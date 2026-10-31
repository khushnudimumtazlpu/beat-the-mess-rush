"use client";

// ─── Waste Entry Form (ak) ────────────────────────────────────────────────────
// Lets kitchen staff log food waste after a service shift.
// Fields: meal slot, dish name, category, weight (kg), reason.

import { useState } from "react";
import { Leaf, Check } from "lucide-react";
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

// Rough cost estimate: ₹80 per kg (illustrative average across all dishes)
const COST_PER_KG = 80;

export function WasteEntryForm() {
  const { wasteRecords, addWasteRecord } = useKitchenStore();
  const [form, setForm] = useState(blankForm);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const todayRecords = wasteRecords.filter((r) => r.date === today);

  function handleChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  // When slot changes, clear dishName so user picks a relevant dish
  function handleSlotChange(slotId) {
    setForm((f) => ({ ...f, slotId, dishName: "" }));
    setErrors((e) => ({ ...e, slotId: undefined, dishName: undefined }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validateWaste(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const kg = Number(form.weightKg);
    const portionsLost = Math.round(kg * 3); // rough estimate: ~3 portions per kg
    const costInr = Math.round(kg * COST_PER_KG);

    addWasteRecord({
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
      </div>

      {saved && (
        <div className="kitchen-success-banner" role="status">
          <Check size={14} aria-hidden="true" /> Waste record saved successfully.
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
            <label className="kitchen-field-label">Reason / Notes <span>Required</span></label>
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
          <button className="kitchen-btn kitchen-btn--primary" type="submit">
            Save Waste Record
          </button>
          <button className="kitchen-btn kitchen-btn--ghost" type="button" onClick={() => { setForm(blankForm); setErrors({}); }}>
            Clear
          </button>
        </div>
      </form>

      {/* Today's waste log */}
      {todayRecords.length > 0 && (
        <div className="kitchen-waste-recent">
          <p className="kitchen-overline" style={{ marginBottom: "0.75rem" }}>Logged Today</p>
          {todayRecords.map((r) => (
            <div key={r.id} className="kitchen-waste-row">
              <span className="kitchen-waste-row__dish">{r.dishName}</span>
              <span className={`kitchen-category-chip kitchen-category-chip--${r.category.replace(" ", "-").toLowerCase()}`}>{r.category}</span>
              <span className="kitchen-waste-row__weight">{r.weightKg} kg</span>
              <span className="kitchen-waste-row__cost">₹{r.costInr}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
