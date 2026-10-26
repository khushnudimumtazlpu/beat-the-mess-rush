import MealPlanner from "../../../features/student/meal-planner";

export default async function StudentMealsPage({ searchParams }) {
  const { slot } = await searchParams;
  return <MealPlanner initialSlotId={slot} />;
}
