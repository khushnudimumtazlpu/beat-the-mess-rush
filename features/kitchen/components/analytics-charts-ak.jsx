"use client";

// ─── Analytics Charts (ak) ────────────────────────────────────────────────────
// Visual analytics for waste trends, category breakdown, and top wasted dishes.
// Uses pure CSS/inline styles — no chart library needed.

import { TrendingDown, Leaf, IndianRupee, Scale } from "lucide-react";
import { useKitchenStore } from "../services/kitchen-store-ak";
import { buildAnalyticsSummary } from "../utils/calculations-ak";

// Colour map for category chips
const CAT_COLORS = {
  "Overproduction": "var(--rush-coral)",
  "Plate Waste": "var(--rush-lavender)",
  "Preparation Waste": "var(--rush-teal)",
};

// Bar chart — pure CSS, no library
function BarChart({ data, labelKey, valueKey, unit = "" }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div className="kitchen-bar-chart">
      {data.map((d, i) => {
        const pct = Math.round((d[valueKey] / max) * 100);
        return (
          <div key={i} className="kitchen-bar-chart__row">
            <span className="kitchen-bar-chart__label">{d[labelKey]}</span>
            <div className="kitchen-bar-chart__track">
              <div
                className="kitchen-bar-chart__fill"
                style={{ width: `${pct}%` }}
                title={`${d[valueKey]} ${unit}`}
              />
            </div>
            <span className="kitchen-bar-chart__value">{d[valueKey]}{unit && ` ${unit}`}</span>
          </div>
        );
      })}
    </div>
  );
}

// Donut-like category percentage display
function CategoryBreakdown({ data }) {
  const total = Object.values(data).reduce((s, v) => s + v.weightKg, 0) || 1;
  return (
    <div className="kitchen-category-breakdown">
      {Object.entries(data).map(([cat, vals]) => {
        const pct = Math.round((vals.weightKg / total) * 100);
        return (
          <div key={cat} className="kitchen-cat-item">
            <div
              className="kitchen-cat-item__swatch"
              style={{ background: CAT_COLORS[cat] ?? "var(--rush-muted)" }}
            />
            <div className="kitchen-cat-item__info">
              <span className="kitchen-cat-item__name">{cat}</span>
              <span className="kitchen-cat-item__pct">{pct}%</span>
            </div>
            <div className="kitchen-cat-item__bar-wrap">
              <div
                className="kitchen-cat-item__bar"
                style={{
                  width: `${pct}%`,
                  background: CAT_COLORS[cat] ?? "var(--rush-muted)",
                }}
              />
            </div>
            <span className="kitchen-cat-item__weight">{Math.round(vals.weightKg * 10) / 10} kg</span>
            <span className="kitchen-cat-item__cost">₹{vals.costInr}</span>
          </div>
        );
      })}
    </div>
  );
}

export function AnalyticsCharts() {
  const { productionRecords, wasteRecords } = useKitchenStore();
  const summary = buildAnalyticsSummary(productionRecords, wasteRecords);

  const scoreColor =
    summary.efficiencyScore >= 92 ? "var(--rush-teal)"
    : summary.efficiencyScore >= 80 ? "var(--rush-lime)"
    : "var(--rush-coral)";

  return (
    <div className="kitchen-analytics">
      {/* KPI row */}
      <div className="kitchen-kpi-row">
        <div className="kitchen-kpi-card">
          <div className="kitchen-kpi-card__icon" style={{ background: `${scoreColor}22`, color: scoreColor }}>
            <TrendingDown size={20} />
          </div>
          <div>
            <span className="kitchen-kpi-card__value" style={{ color: scoreColor }}>
              {summary.efficiencyScore}%
            </span>
            <span className="kitchen-kpi-card__label">Food Efficiency Score</span>
            <span className="kitchen-kpi-card__sub">{summary.totalServed} of {summary.totalCooked} portions served</span>
          </div>
        </div>

        <div className="kitchen-kpi-card">
          <div className="kitchen-kpi-card__icon" style={{ background: "rgba(197,244,103,0.15)", color: "var(--rush-lime)" }}>
            <Scale size={20} />
          </div>
          <div>
            <span className="kitchen-kpi-card__value">{summary.totalWasteKg} kg</span>
            <span className="kitchen-kpi-card__label">Total Waste Logged</span>
            <span className="kitchen-kpi-card__sub">Across {wasteRecords.length} records</span>
          </div>
        </div>

        <div className="kitchen-kpi-card">
          <div className="kitchen-kpi-card__icon" style={{ background: "rgba(255,128,102,0.12)", color: "var(--rush-coral)" }}>
            <IndianRupee size={20} />
          </div>
          <div>
            <span className="kitchen-kpi-card__value">₹{summary.totalCostLossInr.toLocaleString("en-IN")}</span>
            <span className="kitchen-kpi-card__label">Estimated Cost Loss</span>
            <span className="kitchen-kpi-card__sub">Based on ₹80/kg avg cost</span>
          </div>
        </div>

        <div className="kitchen-kpi-card">
          <div className="kitchen-kpi-card__icon" style={{ background: "rgba(32,214,199,0.12)", color: "var(--rush-teal)" }}>
            <Leaf size={20} />
          </div>
          <div>
            <span className="kitchen-kpi-card__value">
              {wasteRecords.reduce((s, r) => s + (r.portionsLost ?? 0), 0)}
            </span>
            <span className="kitchen-kpi-card__label">Portions Lost</span>
            <span className="kitchen-kpi-card__sub">Estimated from weight</span>
          </div>
        </div>
      </div>

      {/* Charts grid */}
      <div className="kitchen-charts-grid">
        {/* Daily waste trend */}
        <div className="kitchen-chart-panel">
          <h3 className="kitchen-chart-title">Daily Waste Trend (kg)</h3>
          {summary.dailyTrend.length > 0 ? (
            <BarChart data={summary.dailyTrend} labelKey="dayLabel" valueKey="wasteKg" unit="kg" />
          ) : (
            <p className="kitchen-muted">No trend data yet.</p>
          )}
        </div>

        {/* Category breakdown */}
        <div className="kitchen-chart-panel">
          <h3 className="kitchen-chart-title">Waste by Category</h3>
          {Object.keys(summary.categoryBreakdown).length > 0 ? (
            <CategoryBreakdown data={summary.categoryBreakdown} />
          ) : (
            <p className="kitchen-muted">No category data yet.</p>
          )}
        </div>

        {/* Top wasted dishes */}
        <div className="kitchen-chart-panel">
          <h3 className="kitchen-chart-title">Top Wasted Dishes</h3>
          {summary.topWastedDishes.length > 0 ? (
            <div className="kitchen-top-dishes">
              {summary.topWastedDishes.map((d, i) => (
                <div key={i} className="kitchen-top-dish-row">
                  <span className="kitchen-top-dish-row__rank">#{i + 1}</span>
                  <span className="kitchen-top-dish-row__name">{d.dishName}</span>
                  <span className="kitchen-top-dish-row__kg">{d.weightKg} kg</span>
                  <span className="kitchen-top-dish-row__cost">₹{d.costInr}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="kitchen-muted">No dish data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
