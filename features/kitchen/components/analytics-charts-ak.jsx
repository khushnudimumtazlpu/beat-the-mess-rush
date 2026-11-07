"use client";

// ─── Analytics Charts (ak & _akk) ─────────────────────────────────────────────
// Visual analytics for waste trends, category breakdown, meal-wise loss, and efficiency.
// Integrates with real database-calculated metrics from backend Kitchen APIs.

import { TrendingDown, Leaf, IndianRupee, Scale, RefreshCw, PieChart } from "lucide-react";
import { useKitchenStore } from "../services/kitchen-store-ak";
import { buildAnalyticsSummary } from "../utils/calculations-ak";

// Colour map for category chips
const CAT_COLORS = {
  "Overproduction": "var(--rush-coral)",
  "Plate Waste": "var(--rush-lavender)",
  "Preparation Waste": "var(--rush-teal)",
};

// Bar chart — pure CSS
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
            <span className="kitchen-bar-chart__value">
              {d[valueKey]}
              {unit && ` ${unit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Donut-like category percentage display
function CategoryBreakdown({ data }) {
  const total = Object.values(data).reduce((s, v) => s + (v.weightKg || 0), 0) || 1;
  return (
    <div className="kitchen-category-breakdown">
      {Object.entries(data).map(([cat, vals]) => {
        const pct = Math.round(((vals.weightKg || 0) / total) * 100);
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
            <span className="kitchen-cat-item__weight">
              {Math.round((vals.weightKg || 0) * 10) / 10} kg
            </span>
            <span className="kitchen-cat-item__cost">₹{vals.costInr || 0}</span>
          </div>
        );
      })}
    </div>
  );
}

export function AnalyticsCharts() {
  const {
    productionRecords,
    wasteRecords,
    analyticsData,
    refreshAll,
    loading,
    isLive,
  } = useKitchenStore();

  const localSummary = buildAnalyticsSummary(productionRecords, wasteRecords);
  const summary = analyticsData || localSummary;

  const totalCooked = summary.totalCooked || localSummary.totalCooked || 0;
  const totalServed = summary.totalServed || localSummary.totalServed || 0;
  const totalWasteKg = summary.totalWasteKg ?? localSummary.totalWasteKg ?? 0;
  const totalCostLossInr = summary.totalCostLossInr ?? localSummary.totalCostLossInr ?? 0;
  const efficiencyScore = summary.efficiencyScore ?? localSummary.efficiencyScore ?? 0;
  const wastePercentage =
    summary.wastePercentage ??
    (totalCooked > 0
      ? Math.round(
          ((wasteRecords.reduce((s, r) => s + (r.portionsLost || 0), 0)) / totalCooked) *
            100 *
            10
        ) / 10
      : 0);

  const scoreColor =
    efficiencyScore >= 92
      ? "var(--rush-teal)"
      : efficiencyScore >= 80
      ? "var(--rush-lime)"
      : "var(--rush-coral)";

  const dailyTrend = summary.dailyTrend || localSummary.dailyTrend || [];
  const categoryBreakdown = summary.categoryBreakdown || localSummary.categoryBreakdown || {};
  const topWastedDishes = summary.topWastedDishes || localSummary.topWastedDishes || [];
  const mealBreakdown = summary.mealBreakdown || [];

  return (
    <div className="kitchen-analytics">
      {/* Live status & refresh bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <p className="kitchen-overline" style={{ margin: 0 }}>
          {isLive ? "Connected to Database Records" : "Demo Cache Mode"}
        </p>
        <button
          type="button"
          className="kitchen-btn kitchen-btn--ghost"
          onClick={() => refreshAll()}
          aria-label="Refresh analytics from database"
          style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh Analytics
        </button>
      </div>

      {/* KPI row */}
      <div className="kitchen-kpi-row">
        <div className="kitchen-kpi-card">
          <div
            className="kitchen-kpi-card__icon"
            style={{ background: `${scoreColor}22`, color: scoreColor }}
          >
            <TrendingDown size={20} />
          </div>
          <div>
            <span className="kitchen-kpi-card__value" style={{ color: scoreColor }}>
              {efficiencyScore}%
            </span>
            <span className="kitchen-kpi-card__label">Food Efficiency Score</span>
            <span className="kitchen-kpi-card__sub">
              {totalServed} of {totalCooked} portions served
            </span>
          </div>
        </div>

        <div className="kitchen-kpi-card">
          <div
            className="kitchen-kpi-card__icon"
            style={{ background: "rgba(197,244,103,0.15)", color: "var(--rush-lime)" }}
          >
            <Scale size={20} />
          </div>
          <div>
            <span className="kitchen-kpi-card__value">{totalWasteKg} kg</span>
            <span className="kitchen-kpi-card__label">Total Waste Logged</span>
            <span className="kitchen-kpi-card__sub">
              Across {wasteRecords.length} database logs
            </span>
          </div>
        </div>

        <div className="kitchen-kpi-card">
          <div
            className="kitchen-kpi-card__icon"
            style={{ background: "rgba(255,128,102,0.12)", color: "var(--rush-coral)" }}
          >
            <IndianRupee size={20} />
          </div>
          <div>
            <span className="kitchen-kpi-card__value">
              ₹{totalCostLossInr.toLocaleString("en-IN")}
            </span>
            <span className="kitchen-kpi-card__label">Estimated Cost Loss</span>
            <span className="kitchen-kpi-card__sub">Based on ₹80/kg benchmark</span>
          </div>
        </div>

        <div className="kitchen-kpi-card">
          <div
            className="kitchen-kpi-card__icon"
            style={{ background: "rgba(32,214,199,0.12)", color: "var(--rush-teal)" }}
          >
            <PieChart size={20} />
          </div>
          <div>
            <span className="kitchen-kpi-card__value">{wastePercentage}%</span>
            <span className="kitchen-kpi-card__label">Waste Rate</span>
            <span className="kitchen-kpi-card__sub">Waste portions / prepared</span>
          </div>
        </div>
      </div>

      {/* Charts grid */}
      <div className="kitchen-charts-grid">
        {/* Daily waste trend */}
        <div className="kitchen-chart-panel">
          <h3 className="kitchen-chart-title">Daily Waste Trend (kg)</h3>
          {dailyTrend.length > 0 ? (
            <BarChart
              data={dailyTrend}
              labelKey="dayLabel"
              valueKey="wasteKg"
              unit="kg"
            />
          ) : (
            <p className="kitchen-muted">No trend data yet.</p>
          )}
        </div>

        {/* Category breakdown */}
        <div className="kitchen-chart-panel">
          <h3 className="kitchen-chart-title">Waste by Category</h3>
          {Object.keys(categoryBreakdown).length > 0 ? (
            <CategoryBreakdown data={categoryBreakdown} />
          ) : (
            <p className="kitchen-muted">No category data yet.</p>
          )}
        </div>

        {/* Top wasted dishes */}
        <div className="kitchen-chart-panel">
          <h3 className="kitchen-chart-title">Top Wasted Dishes</h3>
          {topWastedDishes.length > 0 ? (
            <div className="kitchen-top-dishes">
              {topWastedDishes.map((d, i) => (
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

        {/* Meal-Wise Waste Breakdown */}
        {mealBreakdown.length > 0 && (
          <div className="kitchen-chart-panel">
            <h3 className="kitchen-chart-title">Meal-Wise Prepared vs Consumed</h3>
            <div className="kitchen-top-dishes">
              {mealBreakdown.map((m) => {
                const efficiency =
                  m.prepared > 0
                    ? Math.round((m.served / m.prepared) * 100)
                    : 0;
                return (
                  <div key={m.slot} className="kitchen-top-dish-row">
                    <span className="kitchen-top-dish-row__rank" style={{ textTransform: "capitalize" }}>
                      {m.slot}
                    </span>
                    <span className="kitchen-top-dish-row__name">
                      {m.served} / {m.prepared} served ({efficiency}%)
                    </span>
                    <span className="kitchen-top-dish-row__kg">{m.wasteKg} kg lost</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
