"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  Leaf,
  Soup,
  Utensils,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/layout/page-primitives";
import { demoMealSlots } from "./data/demo-data";
import { Reveal } from "../landing/landing-motion";

const portionChoices = [
  { id: "regular", label: "Regular", note: "A balanced plate" },
  { id: "large", label: "Large", note: "A little more" },
];

const mealIcon = {
  bowl: Soup,
  grain: Utensils,
  leaf: Leaf,
};

export default function MealPlanner({ initialSlotId }) {
  const initialSlot = demoMealSlots.some((slot) => slot.id === initialSlotId) ? initialSlotId : "lunch";
  const [slotId, setSlotId] = useState(initialSlot);
  const [mealId, setMealId] = useState("");
  const [portion, setPortion] = useState("regular");
  const [arrival, setArrival] = useState("");
  const [errors, setErrors] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const mealGroupRef = useRef(null);
  const arrivalRef = useRef(null);

  const selectedSlot = useMemo(
    () => demoMealSlots.find((slot) => slot.id === slotId) ?? demoMealSlots[0],
    [slotId],
  );
  const selectedMeal = selectedSlot.meals.find((meal) => meal.id === mealId);

  function chooseSlot(nextSlotId) {
    setSlotId(nextSlotId);
    setMealId("");
    setArrival("");
    setErrors({});
    setConfirmation(null);
  }

  function submitPlan(event) {
    event.preventDefault();
    const nextErrors = {};

    if (!selectedMeal) nextErrors.meal = "Choose one meal idea to continue.";
    if (!arrival) nextErrors.arrival = "Choose an expected arrival time.";

    setErrors(nextErrors);
    setConfirmation(null);

    if (Object.keys(nextErrors).length) {
      if (nextErrors.meal) mealGroupRef.current?.querySelector("input")?.focus();
      else arrivalRef.current?.focus();
      return;
    }

    setConfirmation({
      slot: selectedSlot.label,
      meal: selectedMeal.name,
      portion: portionChoices.find((choice) => choice.id === portion)?.label,
      arrival,
    });
  }

  return (
    <div className="student-page meal-planner-page">
      <PageContainer>
        <Reveal className="student-page-heading student-page-heading--compact">
          <div>
            <Link href="/student" className="student-back-link"><ArrowLeft size={15} aria-hidden="true" /> Student overview</Link>
            <span className="student-overline"><Utensils size={14} aria-hidden="true" /> MEAL PLANNER</span>
            <h1>Plan a meal <em>that fits.</em></h1>
            <p>Choose a meal idea and an arrival window. This demo form does not reserve food or send your selection.</p>
          </div>
          <Badge tone="lavender" dot>Demo menu</Badge>
        </Reveal>

        <div className="meal-planner-layout">
          <Reveal className="meal-planner-main" delay={0.05}>
            <form className="meal-planner-form student-panel" onSubmit={submitPlan} noValidate>
              <div className="planner-step-heading"><span className="planner-step-heading__number">01</span><div><span className="student-overline">PICK A WINDOW</span><h2>When are you thinking?</h2></div></div>

              <fieldset className="meal-slot-options" aria-describedby="slot-demo-note">
                <legend className="visually-hidden">Choose a demo meal window</legend>
                {demoMealSlots.map((slot) => (
                  <label key={slot.id} className={`meal-slot-option ${slotId === slot.id ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="meal-slot"
                      value={slot.id}
                      checked={slotId === slot.id}
                      onChange={() => chooseSlot(slot.id)}
                    />
                    <span className="meal-slot-option__name">{slot.label}</span>
                    <span className="meal-slot-option__time">{slot.window}</span>
                    <span className="meal-slot-option__check"><Check size={12} aria-hidden="true" /></span>
                  </label>
                ))}
              </fieldset>
              <p className="student-field-hint" id="slot-demo-note">Illustrative time windows only; campus schedules are not connected.</p>

              <div className="planner-step-heading planner-step-heading--spaced"><span className="planner-step-heading__number">02</span><div><span className="student-overline">CHOOSE YOUR MEAL</span><h2>What sounds good?</h2></div></div>
              <fieldset
                ref={mealGroupRef}
                className="meal-choice-grid"
                aria-describedby={errors.meal ? "meal-choice-error" : "meal-choice-hint"}
                aria-invalid={errors.meal ? "true" : undefined}
              >
                <legend className="visually-hidden">Choose one {selectedSlot.label.toLowerCase()} meal idea</legend>
                {selectedSlot.meals.map((meal) => {
                  const Icon = mealIcon[meal.icon] ?? Soup;
                  return (
                    <label key={meal.id} className={`meal-choice ${mealId === meal.id ? "is-selected" : ""}`}>
                      <input
                        type="radio"
                        name="meal-option"
                        value={meal.id}
                        checked={mealId === meal.id}
                        onChange={() => {
                          setMealId(meal.id);
                          setErrors((current) => ({ ...current, meal: undefined }));
                          setConfirmation(null);
                        }}
                      />
                      <span className="meal-choice__icon"><Icon size={20} aria-hidden="true" /></span>
                      <span className="meal-choice__copy"><strong>{meal.name}</strong><small>{meal.note}</small></span>
                      <span className="meal-choice__radio" aria-hidden="true" />
                    </label>
                  );
                })}
              </fieldset>
              {errors.meal ? <p className="student-form-error" id="meal-choice-error" role="alert">{errors.meal}</p> : <p className="student-field-hint" id="meal-choice-hint">One sample menu idea per meal window.</p>}

              <div className="planner-step-heading planner-step-heading--spaced"><span className="planner-step-heading__number">03</span><div><span className="student-overline">PORTION &amp; ARRIVAL</span><h2>Make it your own.</h2></div></div>
              <fieldset className="portion-options">
                <legend className="meal-form-label">Portion size</legend>
                {portionChoices.map((choice) => (
                  <label key={choice.id} className={`portion-option ${portion === choice.id ? "is-selected" : ""}`}>
                    <input type="radio" name="portion" value={choice.id} checked={portion === choice.id} onChange={() => setPortion(choice.id)} />
                    <span className="portion-option__copy"><strong>{choice.label}</strong><small>{choice.note}</small></span>
                    <span className="meal-choice__radio" aria-hidden="true" />
                  </label>
                ))}
              </fieldset>

              <div className="arrival-field">
                <label htmlFor="arrival-time" className="meal-form-label">Expected arrival time <span>Required</span></label>
                <div className="arrival-select-wrap"><Clock3 size={17} aria-hidden="true" /><select
                  ref={arrivalRef}
                  id="arrival-time"
                  value={arrival}
                  onChange={(event) => {
                    setArrival(event.target.value);
                    setErrors((current) => ({ ...current, arrival: undefined }));
                    setConfirmation(null);
                  }}
                  aria-invalid={errors.arrival ? "true" : undefined}
                  aria-describedby={errors.arrival ? "arrival-error" : "arrival-hint"}
                  required
                >
                  <option value="">Choose a sample arrival window</option>
                  {selectedSlot.arrivalTimes.map((time) => <option key={time} value={time}>{time}</option>)}
                </select></div>
                {errors.arrival ? <p className="student-form-error" id="arrival-error" role="alert">{errors.arrival}</p> : <p className="student-field-hint" id="arrival-hint">Sample time options; this does not affect a real queue.</p>}
              </div>

              <div className="meal-planner-submit">
                <Button type="submit" size="large">Review demo selection <ArrowRight size={17} aria-hidden="true" /></Button>
                <span>Nothing is reserved, sent, or stored.</span>
              </div>

              {confirmation ? (
                <div className="student-form-success" role="status" aria-live="polite">
                  <span className="student-form-success__icon"><Check size={17} aria-hidden="true" /></span>
                  <div><strong>Demo selection ready</strong><p>{confirmation.meal} · {confirmation.portion} portion · {confirmation.arrival}. This is shown for demonstration only and was not submitted or saved.</p></div>
                  <Badge tone="lavender">Demo</Badge>
                </div>
              ) : null}
            </form>
          </Reveal>

          <Reveal className="meal-planner-aside" delay={0.12}>
            <div className="planner-aside-photo">
              <div className="planner-aside-photo__image" aria-hidden="true" />
              <span className="planner-aside-photo__label"><Soup size={14} aria-hidden="true" /> SIMPLE CHOICES. SHARED SIGNALS.</span>
            </div>
            <div className="planner-aside-card student-panel">
              <span className="student-panel__eyebrow">WHY PLAN AHEAD?</span>
              <h2>A useful signal starts with a choice.</h2>
              <p>In the integrated app, meal selections can help teams understand expected demand. This demo doesn’t send student data anywhere.</p>
              <div className="planner-aside-card__line"><span className="planner-aside-card__check"><Check size={13} /></span> Your choice stays on this page</div>
              <div className="planner-aside-card__line"><span className="planner-aside-card__check"><Check size={13} /></span> No real meal availability shown</div>
              <Badge tone="neutral">Demo mode</Badge>
            </div>
          </Reveal>
        </div>
      </PageContainer>
    </div>
  );
}
