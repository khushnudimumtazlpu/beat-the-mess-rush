// All values in this file are illustrative. Replace them with approved API data
// before presenting any schedule, menu, selection, or history as campus information.
export const demoMealSlots = [
  {
    id: "breakfast",
    label: "Breakfast",
    window: "7:30–9:30 AM",
    arrivalTimes: ["7:45 AM", "8:15 AM", "8:45 AM", "9:15 AM"],
    meals: [
      { id: "idli", name: "Idli & sambar", note: "Steamed idli with a warm lentil broth", icon: "bowl" },
      { id: "poha", name: "Vegetable poha", note: "Flattened rice with herbs and peanuts", icon: "grain" },
      { id: "upma", name: "Garden upma", note: "Savory semolina with seasonal vegetables", icon: "leaf" },
    ],
  },
  {
    id: "lunch",
    label: "Lunch",
    window: "12:00–2:00 PM",
    arrivalTimes: ["12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM"],
    meals: [
      { id: "dal-rice", name: "Dal & jeera rice", note: "Comforting lentils with fragrant rice", icon: "grain" },
      { id: "roti-sabzi", name: "Roti & seasonal sabzi", note: "Soft flatbread with a vegetable curry", icon: "leaf" },
      { id: "curd-rice", name: "Curd rice bowl", note: "Cooling rice with herbs and a crunchy side", icon: "bowl" },
    ],
  },
  {
    id: "snacks",
    label: "Evening snacks",
    window: "4:00–5:30 PM",
    arrivalTimes: ["4:00 PM", "4:30 PM", "5:00 PM"],
    meals: [
      { id: "sprout-chaat", name: "Sprout chaat", note: "Bright, tangy sprouts with fresh herbs", icon: "leaf" },
      { id: "veg-sandwich", name: "Vegetable sandwich", note: "Toasted bread with a crisp garden filling", icon: "grain" },
    ],
  },
  {
    id: "dinner",
    label: "Dinner",
    window: "7:00–9:00 PM",
    arrivalTimes: ["7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM"],
    meals: [
      { id: "khichdi", name: "Vegetable khichdi", note: "Rice and lentils with a gentle spice blend", icon: "bowl" },
      { id: "paneer-roti", name: "Paneer & roti", note: "A rich tomato curry with warm flatbread", icon: "leaf" },
      { id: "rice-bowl", name: "Harvest rice bowl", note: "Rice with vegetables and a bright herb finish", icon: "grain" },
    ],
  },
];

export const demoNextMeal = {
  mess: "Demo Campus Mess",
  slotId: "lunch",
  dateLabel: "Sample schedule · today",
  window: "12:00–2:00 PM",
  menuLabel: "Dal & jeera rice, roti & seasonal sabzi, or a curd rice bowl",
};

export const demoMealHistory = [];
