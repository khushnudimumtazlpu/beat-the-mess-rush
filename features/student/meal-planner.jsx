"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Leaf,
  RefreshCw,
  Soup,
  Utensils,
  X,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/layout/page-primitives";
import { Reveal } from "../landing/landing-motion";
import {
  cancelStudentDemand,
  createStudentDemand,
  getActiveStudentMesses,
  getCurrentStudentDemands,
  getIndiaServiceDate,
  resolveActiveMessSelection,
  StudentDemandApiError,
  toExpectedArrivalAt,
  updateStudentDemand,
} from "./demand-api.js";

const MEAL_OPTIONS = [
  { mealType: "BREAKFAST", label: "Breakfast", icon: Soup },
  { mealType: "LUNCH", label: "Lunch", icon: Utensils },
  { mealType: "SNACKS", label: "Snacks", icon: Leaf },
  { mealType: "DINNER", label: "Dinner", icon: Soup },
];

const PORTIONS = [
  { id: "REGULAR", label: "Regular", note: "Standard portion" },
  { id: "LARGE", label: "Large", note: "Larger portion" },
];

function messageFor(error) {
  if (error?.code === "DUPLICATE_STUDENT_DEMAND") {
    return "A demand already exists for this meal and service date. Refresh your current demands.";
  }
  if (error?.code === "MESS_SELECTION_REQUIRED") {
    return "Choose one of the active Messes to continue.";
  }
  if (error?.status === 409) return error.message || "This demand changed. Refresh and try again.";
  return error?.message || "We could not save your meal demand. Try again.";
}

function ApiAlert({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="student-api-alert" role="alert">
      <p>{error.message}</p>
      {error.status === 401 ? <Link href="/login">Sign in again</Link> : null}
      {onRetry ? <Button variant="secondary" size="small" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /> Retry</Button> : null}
    </div>
  );
}

function formatArrival(value) {
  if (!value) return "Arrival time not set";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function activeDemandLabel(demand) {
  const meal = MEAL_OPTIONS.find(({ mealType }) => mealType === demand.mealType)?.label ?? demand.mealType;
  return `${meal} · ${demand.portion.toLowerCase()} portion · ${formatArrival(demand.expectedArrivalAt)}`;
}

export default function MealPlanner({ initialSlotId }) {
  const initialMealType = MEAL_OPTIONS.find(({ mealType, label }) =>
    mealType.toLowerCase() === initialSlotId?.toLowerCase() || label.toLowerCase() === initialSlotId?.toLowerCase(),
  )?.mealType ?? "LUNCH";
  const [mealType, setMealType] = useState(initialMealType);
  const [portion, setPortion] = useState("REGULAR");
  const [arrivalTime, setArrivalTime] = useState("");
  const [demands, setDemands] = useState([]);
  const [activeMesses, setActiveMesses] = useState([]);
  const [messSelection, setMessSelection] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isMessLoading, setIsMessLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [messLoadError, setMessLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState("");
  const [serviceDate, setServiceDate] = useState(() => getIndiaServiceDate());
  const [refreshKey, setRefreshKey] = useState(0);
  const [messRefreshKey, setMessRefreshKey] = useState(0);
  const controllerRef = useRef(null);
  const messControllerRef = useRef(null);
  const arrivalRef = useRef(null);
  const mealTypeRef = useRef(initialMealType);

  useEffect(() => () => {
    controllerRef.current?.abort();
    messControllerRef.current?.abort();
  }, []);

  const selectedDemand = useMemo(
    () => demands.find((demand) => demand.mealType === mealType && demand.status === "ACTIVE") ?? null,
    [demands, mealType],
  );
  const selectedMessId = messSelection || resolveActiveMessSelection(activeMesses, selectedDemand?.mess?.id);

  const loadDemands = useCallback(async ({ date = serviceDate } = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const result = await getCurrentStudentDemands({ serviceDate: date, signal: controller.signal });
      if (!controller.signal.aborted) {
        const records = Array.isArray(result?.demands) ? result.demands : [];
        const selected = records.find((demand) => demand.mealType === mealTypeRef.current && demand.status === "ACTIVE");
        setDemands(records);
        setPortion(selected?.portion ?? "REGULAR");
        setArrivalTime(selected?.expectedArrivalAt?.slice(11, 16) ?? "");
        setLoadError(null);
        return true;
      }
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(error);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
    return false;
  }, [serviceDate]);

  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    getCurrentStudentDemands({ serviceDate, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      const records = Array.isArray(result?.demands) ? result.demands : [];
      const selected = records.find((demand) => demand.mealType === mealTypeRef.current && demand.status === "ACTIVE");
      setDemands(records);
      setPortion(selected?.portion ?? "REGULAR");
      setArrivalTime(selected?.expectedArrivalAt?.slice(11, 16) ?? "");
      setLoadError(null);
    }).catch((error) => {
      if (!controller.signal.aborted) setLoadError(error);
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [serviceDate, refreshKey]);

  useEffect(() => {
    messControllerRef.current?.abort();
    const controller = new AbortController();
    messControllerRef.current = controller;
    getActiveStudentMesses({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      const records = Array.isArray(result?.messes) ? result.messes : [];
      setActiveMesses(records);
      setMessSelection((current) => records.some((mess) => mess.id === current) ? current : "");
      setMessLoadError(null);
    }).catch((error) => {
      if (!controller.signal.aborted) setMessLoadError(error);
    }).finally(() => {
      if (!controller.signal.aborted) setIsMessLoading(false);
    });
    return () => controller.abort();
  }, [messRefreshKey]);

  const selectedMeal = MEAL_OPTIONS.find((option) => option.mealType === mealType) ?? MEAL_OPTIONS[1];

  function chooseMeal(nextMealType) {
    mealTypeRef.current = nextMealType;
    setMealType(nextMealType);
    const existing = demands.find((demand) => demand.mealType === nextMealType && demand.status === "ACTIVE");
    setPortion(existing?.portion ?? "REGULAR");
    setArrivalTime(existing?.expectedArrivalAt?.slice(11, 16) ?? "");
    setMessSelection(existing?.mess?.id && activeMesses.some((mess) => mess.id === existing.mess.id) ? existing.mess.id : "");
    setActionError(null);
    setSuccess("");
  }

  async function submitPlan(event) {
    event.preventDefault();
    setActionError(null);
    setSuccess("");
    if (!arrivalTime) {
      setActionError(new StudentDemandApiError("Choose an expected arrival time."));
      arrivalRef.current?.focus();
      return;
    }

    let expectedArrivalAt;
    const mutationTime = new Date();
    const mutationServiceDate = getIndiaServiceDate(mutationTime);
    try {
      expectedArrivalAt = toExpectedArrivalAt(arrivalTime, mutationTime);
    } catch (error) {
      setActionError({ message: messageFor(error), status: error?.status, code: error?.code });
      arrivalRef.current?.focus();
      return;
    }

    if (mutationServiceDate !== serviceDate) {
      setServiceDate(mutationServiceDate);
      setIsLoading(true);
    }
    setIsSubmitting(true);
    try {
      messControllerRef.current?.abort();
      const messController = new AbortController();
      messControllerRef.current = messController;
      let latestMessResult;
      try {
        latestMessResult = await getActiveStudentMesses({ signal: messController.signal });
      } catch (error) {
        if (messController.signal.aborted) return;
        setMessLoadError(error);
        throw error;
      }
      if (messController.signal.aborted) return;
      const latestMesses = Array.isArray(latestMessResult?.messes) ? latestMessResult.messes : [];
      setActiveMesses(latestMesses);
      setMessLoadError(null);
      const chosenMessId = resolveActiveMessSelection(latestMesses, selectedMessId);
      setMessSelection(chosenMessId);
      if (!chosenMessId) {
        throw new StudentDemandApiError(
          latestMesses.length ? "Choose one of your active Messes before saving." : "No active Mess is available for your Hostel.",
          { status: 409, code: latestMesses.length ? "MESS_SELECTION_REQUIRED" : "NO_ACTIVE_MESS" },
        );
      }
      const payload = {
        mealType,
        portion,
        expectedArrivalAt,
        messId: chosenMessId,
      };
      if (selectedDemand) {
        await updateStudentDemand(selectedDemand.id, payload);
        setSuccess("Your meal demand was updated.");
      } else {
        await createStudentDemand(payload);
        setSuccess("Your meal demand was saved.");
      }
      const refreshed = await loadDemands({ date: mutationServiceDate });
      if (!refreshed) setSuccess("Your demand was saved, but the list could not refresh. Try refreshing the page.");
    } catch (error) {
      setActionError({ message: messageFor(error), status: error?.status, code: error?.code });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelDemand(demand) {
    if (isSubmitting) return;
    const mealLabel = MEAL_OPTIONS.find((option) => option.mealType === demand.mealType)?.label ?? "this meal";
    if (!window.confirm(`Cancel your ${mealLabel.toLowerCase()} demand?`)) return;
    setIsSubmitting(true);
    setActionError(null);
    setSuccess("");
    try {
      await cancelStudentDemand(demand.id);
      setSuccess(`${mealLabel} demand cancelled.`);
      const cancellationDate = getIndiaServiceDate();
      if (cancellationDate !== serviceDate) {
        setServiceDate(cancellationDate);
        setIsLoading(true);
      }
      const refreshed = await loadDemands({ date: cancellationDate });
      if (!refreshed) setSuccess("Your demand was cancelled, but the list could not refresh. Try refreshing the page.");
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  function retryLoad() {
    setIsLoading(true);
    setLoadError(null);
    setRefreshKey((key) => key + 1);
  }

  function retryMessLoad() {
    setIsMessLoading(true);
    setMessLoadError(null);
    setMessRefreshKey((key) => key + 1);
  }

  return (
    <div className="student-page meal-planner-page">
      <PageContainer>
        <Reveal className="student-page-heading student-page-heading--compact">
          <div>
            <Link href="/student" className="student-back-link"><ArrowLeft size={15} aria-hidden="true" /> Student overview</Link>
            <span className="student-overline"><Utensils size={14} aria-hidden="true" /> MEAL PLANNER</span>
            <h1>Plan a meal <em>that fits.</em></h1>
            <p>Save or update your meal demand for {serviceDate}.</p>
          </div>
          <Badge tone="teal" dot>Connected to your account</Badge>
        </Reveal>

        <div className="meal-planner-layout">
          <Reveal className="meal-planner-main" delay={0.05}>
            <form className="meal-planner-form student-panel" onSubmit={submitPlan} noValidate>
              <div className="planner-step-heading"><span className="planner-step-heading__number">01</span><div><span className="student-overline">PICK A MEAL</span><h2>What are you planning?</h2></div></div>
              <fieldset className="meal-slot-options" aria-describedby="meal-slot-hint" disabled={isLoading || isMessLoading || isSubmitting}>
                <legend className="visually-hidden">Choose a meal</legend>
                {MEAL_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const hasDemand = demands.some((demand) => demand.mealType === option.mealType && demand.status === "ACTIVE");
                  return (
                    <label key={option.mealType} className={`meal-slot-option ${mealType === option.mealType ? "is-selected" : ""}`}>
                      <input type="radio" name="meal-type" value={option.mealType} checked={mealType === option.mealType} onChange={() => chooseMeal(option.mealType)} />
                      <span className="meal-slot-option__name"><Icon size={16} aria-hidden="true" /> {option.label}</span>
                      <span className="meal-slot-option__time">{hasDemand ? "Demand saved" : "No demand yet"}</span>
                      <span className="meal-slot-option__check"><Check size={12} aria-hidden="true" /></span>
                    </label>
                  );
                })}
              </fieldset>
              <p className="student-field-hint" id="meal-slot-hint">One demand is allowed per meal and service date.</p>

              <div className="planner-step-heading planner-step-heading--spaced"><span className="planner-step-heading__number">02</span><div><span className="student-overline">PORTION &amp; ARRIVAL</span><h2>Make it your own.</h2></div></div>
              {selectedDemand ? <p className="student-demand-editing" role="status">Editing your saved {selectedMeal.label.toLowerCase()} demand.</p> : null}
              <fieldset className="portion-options" disabled={isLoading || isMessLoading || isSubmitting}>
                <legend className="meal-form-label">Portion size</legend>
                {PORTIONS.map((choice) => (
                  <label key={choice.id} className={`portion-option ${portion === choice.id ? "is-selected" : ""}`}>
                    <input type="radio" name="portion" value={choice.id} checked={portion === choice.id} onChange={() => { setPortion(choice.id); setActionError(null); setSuccess(""); }} />
                    <span className="portion-option__copy"><strong>{choice.label}</strong><small>{choice.note}</small></span>
                    <span className="meal-choice__radio" aria-hidden="true" />
                  </label>
                ))}
              </fieldset>

              <div className="arrival-field">
                <label htmlFor="arrival-time" className="meal-form-label">Expected arrival time <span>Required</span></label>
                <div className="arrival-select-wrap"><Clock3 size={17} aria-hidden="true" /><input
                  ref={arrivalRef}
                  id="arrival-time"
                  type="time"
                  value={arrivalTime}
                  onChange={(event) => { setArrivalTime(event.target.value); setActionError(null); setSuccess(""); }}
                  aria-describedby="arrival-hint"
                  required
                  disabled={isLoading || isMessLoading || isSubmitting}
                /></div>
                <p className="student-field-hint" id="arrival-hint">Arrival is saved in India Standard Time for this service date.</p>
              </div>

              {messLoadError ? <ApiAlert error={messLoadError} onRetry={retryMessLoad} /> : null}
              {!messLoadError && !isMessLoading && activeMesses.length === 0 ? <p className="student-form-error" role="alert">No active Mess is available for your Hostel yet.</p> : null}
              {!messLoadError && activeMesses.length > 1 ? (
                <div className="arrival-field">
                  <label htmlFor="demand-mess" className="meal-form-label">Mess <span>Required</span></label>
                  <select id="demand-mess" className="student-mess-select" value={selectedMessId} onChange={(event) => { setMessSelection(event.target.value); setActionError(null); setSuccess(""); }} required disabled={isMessLoading || isSubmitting}>
                    <option value="">Choose an active Mess</option>
                    {activeMesses.map((mess) => <option value={mess.id} key={mess.id}>{mess.name} · {mess.code}</option>)}
                  </select>
                </div>
              ) : null}
              {!messLoadError && activeMesses.length === 1 ? <p className="student-field-hint">Using {activeMesses[0].name} · {activeMesses[0].code}.</p> : null}

              <ApiAlert error={loadError} onRetry={retryLoad} />
              <ApiAlert error={actionError} />
              <div className="meal-planner-submit">
                <Button type="submit" size="large" disabled={isLoading || isMessLoading || isSubmitting || Boolean(loadError) || Boolean(messLoadError) || activeMesses.length === 0 || (activeMesses.length > 1 && !selectedMessId)}>
                  {isSubmitting ? "Saving…" : selectedDemand ? "Update demand" : "Save meal demand"}
                  {!isSubmitting ? <ArrowRight size={17} aria-hidden="true" /> : null}
                </Button>
                <span>{isSubmitting ? "Please wait…" : "Your selection is saved to your account."}</span>
              </div>

              {success ? <div className="student-form-success" role="status" aria-live="polite"><span className="student-form-success__icon"><Check size={17} aria-hidden="true" /></span><div><strong>Demand updated</strong><p>{success}</p></div><Badge tone="teal">Saved</Badge></div> : null}
            </form>

            <section className="student-panel student-current-demands" aria-labelledby="current-demands-title">
              <div className="student-panel__topline"><div><span className="student-panel__eyebrow">TODAY · {serviceDate}</span><h2 id="current-demands-title">Your active demands</h2></div><Badge tone="neutral">{loadError || messLoadError ? "—" : demands.length}</Badge></div>
              {isLoading ? <p className="student-field-hint" role="status" aria-busy="true">Loading your saved demands…</p> : null}
              {!isLoading && !loadError && !messLoadError && demands.length === 0 ? <p className="student-field-hint">You have not saved a meal demand for today.</p> : null}
              {!isLoading && !loadError && !messLoadError && demands.length ? (
                <ul className="student-demand-list">
                  {demands.map((demand) => {
                    const label = MEAL_OPTIONS.find((option) => option.mealType === demand.mealType)?.label ?? demand.mealType;
                    return <li className="student-demand-row" key={demand.id}>
                      <div><strong>{activeDemandLabel(demand)}</strong><small>{demand.mess?.name || "Assigned Mess"}{demand.mess?.code ? ` · ${demand.mess.code}` : ""}</small></div>
                      <div className="student-demand-row__actions">
                        <Badge tone="teal">Active</Badge>
                        <Button variant="quiet" size="small" onClick={() => chooseMeal(demand.mealType)} disabled={isSubmitting} aria-label={`Edit ${label} demand`}>Edit</Button>
                        <Button variant="quiet" size="small" onClick={() => cancelDemand(demand)} disabled={isSubmitting} aria-label={`Cancel ${label} demand`}><X size={15} aria-hidden="true" /> Cancel</Button>
                      </div>
                    </li>;
                  })}
                </ul>
              ) : null}
            </section>
          </Reveal>

          <Reveal className="meal-planner-aside" delay={0.12}>
            <div className="planner-aside-photo">
              <div className="planner-aside-photo__image" aria-hidden="true" />
              <span className="planner-aside-photo__label"><Soup size={14} aria-hidden="true" /> YOUR PLAN. A CLEARER SIGNAL.</span>
            </div>
            <div className="planner-aside-card student-panel">
              <span className="student-panel__eyebrow">HOW YOUR DEMAND HELPS</span>
              <h2>A useful signal starts with a choice.</h2>
              <p>Your saved demand updates the planning total for its meal, Mess and service date.</p>
              <div className="planner-aside-card__line"><span className="planner-aside-card__check"><Check size={13} /></span> Change or cancel while active</div>
              <div className="planner-aside-card__line"><span className="planner-aside-card__check"><Check size={13} /></span> Review past selections in history</div>
              <Button href="/student/history" variant="secondary" size="small">View meal history <ArrowRight size={14} aria-hidden="true" /></Button>
            </div>
          </Reveal>
        </div>
      </PageContainer>
    </div>
  );
}
