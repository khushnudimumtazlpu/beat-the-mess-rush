"use client";

// ─── Demand Card (ak & _akk) ──────────────────────────────────────────────────
// Shows student demand signals aggregated for a meal slot from the backend database.
// Displays recommended cooking target with buffer applied.

import { ChevronDown, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { withBuffer } from "../utils/calculations-ak";
import { mockDemandSummary, kitchenSlots } from "../data/kitchen-demo-data-ak";
import { useKitchenStore } from "../services/kitchen-store-ak";

export function DemandCard({ activeSlotId, onSlotChange }) {
  const [open, setOpen] = useState(false);
  const { demandData, fetchDemandForSlot, isLive } = useKitchenStore();
  const [slotDemand, setSlotDemand] = useState(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDemandForSlot(activeSlotId)
      .then((data) => {
        if (!cancelled && data) {
          setSlotDemand(data);
        }
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSlotId, fetchDemandForSlot]);

  function handleSelect(newSlot) {
    setFetching(true);
    onSlotChange(newSlot);
  }

  // Use backend data if available for this slot, otherwise fallback to baseline
  const demand =
    slotDemand && slotDemand.slotId === activeSlotId
      ? slotDemand
      : demandData && demandData.slotId === activeSlotId
      ? demandData
      : mockDemandSummary[activeSlotId];

  if (!demand) {
    return (
      <div className="kitchen-panel kitchen-demand-card">
        <p className="kitchen-muted">No demand data available for this slot.</p>
      </div>
    );
  }

  const bufferPct = demand.bufferPct ?? 8;
  const target = demand.recommendedTarget || withBuffer(demand.totalStudentIntent, bufferPct);

  return (
    <div className="kitchen-panel kitchen-demand-card">
      <div className="kitchen-demand-header">
        <div>
          <span className="kitchen-overline">
            Student Demand Signal {isLive && <span className="kitchen-live-dot" title="Live Database Data" />}
          </span>
          <h2 className="kitchen-panel-title">{demand.slotLabel}</h2>
        </div>
        {/* Slot selector */}
        <div className="kitchen-slot-select-wrap">
          <select
            className="kitchen-slot-select"
            value={activeSlotId}
            onChange={(e) => handleSelect(e.target.value)}
            aria-label="Choose meal slot"
            disabled={fetching}
          >
            {kitchenSlots.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          {fetching ? (
            <RefreshCw size={14} className="kitchen-slot-select-icon animate-spin" aria-hidden="true" />
          ) : (
            <ChevronDown size={14} className="kitchen-slot-select-icon" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="kitchen-demand-stats">
        <div className="kitchen-stat">
          <span className="kitchen-stat__value">{demand.totalStudentIntent}</span>
          <span className="kitchen-stat__label">Student Intent</span>
        </div>
        <div className="kitchen-stat">
          <span className="kitchen-stat__value">{bufferPct}%</span>
          <span className="kitchen-stat__label">Safety Buffer</span>
        </div>
        <div className="kitchen-stat kitchen-stat--highlight">
          <span className="kitchen-stat__value">{target}</span>
          <span className="kitchen-stat__label">Recommended Target</span>
        </div>
      </div>

      {/* Dish breakdown table */}
      <div className="kitchen-demand-table">
        <div className="kitchen-demand-table__head">
          <span>Dish</span>
          <span>Student Demand</span>
          <span>Cook Target (+ {bufferPct}%)</span>
        </div>
        {demand.dishBreakdown?.map((d) => (
          <div key={d.dishId} className="kitchen-demand-table__row">
            <span>{d.dishName}</span>
            <span>{d.studentDemand}</span>
            <span className="kitchen-demand-table__target">
              {d.recommendedTarget || withBuffer(d.studentDemand, bufferPct)}
            </span>
          </div>
        ))}
      </div>

      {/* Hourly flow toggle */}
      {demand.hourlyFlow?.length > 0 && (
        <>
          <button
            className="kitchen-toggle-btn"
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "Hide" : "Show"} hourly arrival flow
            <ChevronDown
              size={14}
              aria-hidden="true"
              style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
            />
          </button>

          {open && (
            <div className="kitchen-flow-grid">
              {demand.hourlyFlow.map((f) => (
                <div key={f.time} className="kitchen-flow-slot">
                  <span className="kitchen-flow-slot__time">{f.time}</span>
                  <div className="kitchen-flow-slot__bar-wrap">
                    <div
                      className="kitchen-flow-slot__bar"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((f.students / (demand.totalStudentIntent || 1)) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="kitchen-flow-slot__count">{f.students}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
