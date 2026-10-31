// ─── Calculations Utility (ak) ────────────────────────────────────────────────
// Pure helper functions — no side-effects, easy to test.

/**
 * Add a buffer % to student demand and return the recommended cooking target.
 * e.g. demand=200, bufferPct=8 → 216
 */
export function withBuffer(demand, bufferPct) {
  return Math.ceil(demand * (1 + bufferPct / 100));
}

/**
 * Calculate the Food Efficiency Score as a percentage.
 * Score = (portionsServed / portionsCooked) * 100
 * Clamped between 0 and 100.
 */
export function efficiencyScore(portionsServed, portionsCooked) {
  if (!portionsCooked || portionsCooked === 0) return 0;
  return Math.min(100, Math.round((portionsServed / portionsCooked) * 100 * 10) / 10);
}

/**
 * Estimate cost loss from waste records.
 * Each waste record already contains costInr.
 * Returns total cost in ₹.
 */
export function totalCostLoss(wasteRecords) {
  return wasteRecords.reduce((sum, r) => sum + (r.costInr ?? 0), 0);
}

/**
 * Total waste weight in kg from an array of waste records.
 */
export function totalWasteKg(wasteRecords) {
  return wasteRecords.reduce((sum, r) => sum + (r.weightKg ?? 0), 0);
}

/**
 * Group waste records by category and return counts / weight per category.
 */
export function wasteByCategory(wasteRecords) {
  const categories = {};
  for (const r of wasteRecords) {
    if (!categories[r.category]) {
      categories[r.category] = { count: 0, weightKg: 0, costInr: 0 };
    }
    categories[r.category].count += 1;
    categories[r.category].weightKg += r.weightKg ?? 0;
    categories[r.category].costInr += r.costInr ?? 0;
  }
  return categories;
}

/**
 * Group waste records by date (YYYY-MM-DD) summing weight.
 * Returns array sorted ascending by date.
 */
export function wasteTrendByDay(wasteRecords) {
  const byDate = {};
  for (const r of wasteRecords) {
    byDate[r.date] = (byDate[r.date] ?? 0) + (r.weightKg ?? 0);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, wasteKg]) => ({
      date,
      dayLabel: new Date(date).toLocaleDateString("en-IN", { weekday: "short" }),
      wasteKg: Math.round(wasteKg * 10) / 10,
    }));
}

/**
 * Find the top-N most wasted dishes from waste records.
 */
export function topWastedDishes(wasteRecords, limit = 3) {
  const dishes = {};
  for (const r of wasteRecords) {
    if (!dishes[r.dishName]) {
      dishes[r.dishName] = { dishName: r.dishName, weightKg: 0, costInr: 0 };
    }
    dishes[r.dishName].weightKg += r.weightKg ?? 0;
    dishes[r.dishName].costInr += r.costInr ?? 0;
  }
  return Object.values(dishes)
    .sort((a, b) => b.weightKg - a.weightKg)
    .slice(0, limit)
    .map((d) => ({
      ...d,
      weightKg: Math.round(d.weightKg * 10) / 10,
    }));
}

/**
 * Build a full analytics summary from production + waste records.
 */
export function buildAnalyticsSummary(productionRecords, wasteRecords) {
  const totalCooked = productionRecords.reduce((s, r) => s + (r.actualPrepared ?? 0), 0);
  const totalServed = productionRecords.reduce((s, r) => s + (r.portionsServed ?? 0), 0);
  const score = efficiencyScore(totalServed, totalCooked);
  const wasteKg = Math.round(totalWasteKg(wasteRecords) * 10) / 10;
  const costLoss = totalCostLoss(wasteRecords);
  const catBreakdown = wasteByCategory(wasteRecords);
  const trend = wasteTrendByDay(wasteRecords);
  const top = topWastedDishes(wasteRecords);

  return {
    totalCooked,
    totalServed,
    efficiencyScore: score,
    totalWasteKg: wasteKg,
    totalCostLossInr: costLoss,
    categoryBreakdown: catBreakdown,
    dailyTrend: trend,
    topWastedDishes: top,
  };
}
