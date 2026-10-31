// ─── Kitchen Demo Data (ak) ───────────────────────────────────────────────────
// All data is illustrative / mock. Nothing is persisted to a database.
// This file is the single source of truth for the kitchen module demo.

// ── Meal Slots ────────────────────────────────────────────────────────────────
export const kitchenSlots = [
  {
    id: "breakfast",
    label: "Breakfast",
    window: "7:30 – 9:30 AM",
    dishes: [
      { id: "idli", name: "Idli & Sambar", costPerPortion: 18 },
      { id: "poha", name: "Vegetable Poha", costPerPortion: 14 },
      { id: "upma", name: "Garden Upma", costPerPortion: 16 },
    ],
  },
  {
    id: "lunch",
    label: "Lunch",
    window: "12:00 – 2:00 PM",
    dishes: [
      { id: "dal-rice", name: "Dal & Jeera Rice", costPerPortion: 30 },
      { id: "roti-sabzi", name: "Roti & Seasonal Sabzi", costPerPortion: 28 },
      { id: "curd-rice", name: "Curd Rice Bowl", costPerPortion: 22 },
    ],
  },
  {
    id: "snacks",
    label: "Evening Snacks",
    window: "4:00 – 5:30 PM",
    dishes: [
      { id: "sprout-chaat", name: "Sprout Chaat", costPerPortion: 20 },
      { id: "veg-sandwich", name: "Vegetable Sandwich", costPerPortion: 25 },
    ],
  },
  {
    id: "dinner",
    label: "Dinner",
    window: "7:00 – 9:00 PM",
    dishes: [
      { id: "khichdi", name: "Vegetable Khichdi", costPerPortion: 28 },
      { id: "paneer-roti", name: "Paneer & Roti", costPerPortion: 45 },
      { id: "rice-bowl", name: "Harvest Rice Bowl", costPerPortion: 32 },
    ],
  },
];

// ── Demand Summary (student signals aggregated) ───────────────────────────────
// Represents what students have declared they will eat today
export const mockDemandSummary = {
  lunch: {
    slotId: "lunch",
    slotLabel: "Lunch (12:00 – 2:00 PM)",
    totalStudentIntent: 420,
    bufferPct: 8,
    dishBreakdown: [
      { dishId: "dal-rice", dishName: "Dal & Jeera Rice", studentDemand: 210 },
      { dishId: "roti-sabzi", dishName: "Roti & Seasonal Sabzi", studentDemand: 150 },
      { dishId: "curd-rice", dishName: "Curd Rice Bowl", studentDemand: 60 },
    ],
    hourlyFlow: [
      { time: "12:00 PM", students: 90 },
      { time: "12:30 PM", students: 170 },
      { time: "1:00 PM", students: 120 },
      { time: "1:30 PM", students: 40 },
    ],
  },
  breakfast: {
    slotId: "breakfast",
    slotLabel: "Breakfast (7:30 – 9:30 AM)",
    totalStudentIntent: 185,
    bufferPct: 8,
    dishBreakdown: [
      { dishId: "idli", dishName: "Idli & Sambar", studentDemand: 90 },
      { dishId: "poha", dishName: "Vegetable Poha", studentDemand: 60 },
      { dishId: "upma", dishName: "Garden Upma", studentDemand: 35 },
    ],
    hourlyFlow: [
      { time: "7:45 AM", students: 50 },
      { time: "8:15 AM", students: 80 },
      { time: "8:45 AM", students: 40 },
      { time: "9:15 AM", students: 15 },
    ],
  },
  dinner: {
    slotId: "dinner",
    slotLabel: "Dinner (7:00 – 9:00 PM)",
    totalStudentIntent: 310,
    bufferPct: 8,
    dishBreakdown: [
      { dishId: "khichdi", dishName: "Vegetable Khichdi", studentDemand: 120 },
      { dishId: "paneer-roti", dishName: "Paneer & Roti", studentDemand: 130 },
      { dishId: "rice-bowl", dishName: "Harvest Rice Bowl", studentDemand: 60 },
    ],
    hourlyFlow: [
      { time: "7:00 PM", students: 80 },
      { time: "7:30 PM", students: 120 },
      { time: "8:00 PM", students: 80 },
      { time: "8:30 PM", students: 30 },
    ],
  },
};

// ── Pre-populated Production Records ─────────────────────────────────────────
// Simulates records that kitchen staff logged over the past few shifts
export const initialProductionRecords = [
  {
    id: "prod-lunch-dal",
    date: "2026-10-28",
    slotId: "lunch",
    dishId: "dal-rice",
    dishName: "Dal & Jeera Rice",
    plannedPortions: 227,
    actualPrepared: 230,
    portionsServed: 214,
    status: "Completed",
    chef: "Chef Ramesh",
  },
  {
    id: "prod-lunch-roti",
    date: "2026-10-28",
    slotId: "lunch",
    dishId: "roti-sabzi",
    dishName: "Roti & Seasonal Sabzi",
    plannedPortions: 162,
    actualPrepared: 165,
    portionsServed: 152,
    status: "Completed",
    chef: "Chef Priya",
  },
  {
    id: "prod-lunch-curd",
    date: "2026-10-28",
    slotId: "lunch",
    dishId: "curd-rice",
    dishName: "Curd Rice Bowl",
    plannedPortions: 65,
    actualPrepared: 60,
    portionsServed: 58,
    status: "Completed",
    chef: "Chef Ramesh",
  },
  {
    id: "prod-breakfast-idli",
    date: "2026-10-28",
    slotId: "breakfast",
    dishId: "idli",
    dishName: "Idli & Sambar",
    plannedPortions: 97,
    actualPrepared: 100,
    portionsServed: 88,
    status: "Completed",
    chef: "Chef Meena",
  },
  {
    id: "prod-breakfast-poha",
    date: "2026-10-28",
    slotId: "breakfast",
    dishId: "poha",
    dishName: "Vegetable Poha",
    plannedPortions: 65,
    actualPrepared: 65,
    portionsServed: 60,
    status: "Completed",
    chef: "Chef Meena",
  },
];

// ── Pre-populated Waste Records ───────────────────────────────────────────────
// Simulates waste logs from previous shifts (7 days)
export const initialWasteRecords = [
  {
    id: "waste-001",
    date: "2026-10-28",
    slotId: "lunch",
    dishName: "Dal & Jeera Rice",
    category: "Overproduction",
    weightKg: 4.8,
    portionsLost: 16,
    costInr: 480,
    reason: "Lower footfall during last 30 min of service",
  },
  {
    id: "waste-002",
    date: "2026-10-28",
    slotId: "lunch",
    dishName: "Roti & Seasonal Sabzi",
    category: "Overproduction",
    weightKg: 3.9,
    portionsLost: 13,
    costInr: 364,
    reason: "Over-estimate on student intake",
  },
  {
    id: "waste-003",
    date: "2026-10-28",
    slotId: "breakfast",
    dishName: "Idli & Sambar",
    category: "Plate Waste",
    weightKg: 2.1,
    portionsLost: 9,
    costInr: 162,
    reason: "Students took large portions but did not finish",
  },
  {
    id: "waste-004",
    date: "2026-10-27",
    slotId: "dinner",
    dishName: "Paneer & Roti",
    category: "Preparation Waste",
    weightKg: 1.5,
    portionsLost: 5,
    costInr: 225,
    reason: "Trimming and preparation offcuts",
  },
  {
    id: "waste-005",
    date: "2026-10-27",
    slotId: "lunch",
    dishName: "Curd Rice Bowl",
    category: "Overproduction",
    weightKg: 5.2,
    portionsLost: 18,
    costInr: 396,
    reason: "Low demand on Wednesday lunch",
  },
  {
    id: "waste-006",
    date: "2026-10-26",
    slotId: "lunch",
    dishName: "Garden Upma",
    category: "Overproduction",
    weightKg: 6.1,
    portionsLost: 22,
    costInr: 352,
    reason: "Overproduction — low breakfast preference midweek",
  },
  {
    id: "waste-007",
    date: "2026-10-26",
    slotId: "dinner",
    dishName: "Vegetable Khichdi",
    category: "Plate Waste",
    weightKg: 3.3,
    portionsLost: 12,
    costInr: 336,
    reason: "Students preferred Paneer Roti more on this shift",
  },
  {
    id: "waste-008",
    date: "2026-10-25",
    slotId: "lunch",
    dishName: "Dal & Jeera Rice",
    category: "Overproduction",
    weightKg: 5.5,
    portionsLost: 19,
    costInr: 570,
    reason: "Holiday — campus attendance lower than expected",
  },
  {
    id: "waste-009",
    date: "2026-10-25",
    slotId: "breakfast",
    dishName: "Garden Upma",
    category: "Preparation Waste",
    weightKg: 0.8,
    portionsLost: 3,
    costInr: 48,
    reason: "Batch overcooked — quality check rejected",
  },
  {
    id: "waste-010",
    date: "2026-10-24",
    slotId: "dinner",
    dishName: "Harvest Rice Bowl",
    category: "Overproduction",
    weightKg: 4.4,
    portionsLost: 15,
    costInr: 480,
    reason: "Friday low-turnout pattern",
  },
];

// ── Waste Categories ──────────────────────────────────────────────────────────
export const wasteCategories = [
  { id: "Overproduction", label: "Overproduction", desc: "Food cooked but not served" },
  { id: "Plate Waste", label: "Plate Waste", desc: "Food taken but not eaten by students" },
  { id: "Preparation Waste", label: "Preparation Waste", desc: "Offcuts, spoilage during cooking" },
];

// ── Status options for production records ─────────────────────────────────────
export const productionStatuses = ["Preparing", "Ready", "Completed"];
