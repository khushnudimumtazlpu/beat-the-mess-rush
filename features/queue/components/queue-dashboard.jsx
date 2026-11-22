"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock3,
  MapPin,
  RefreshCw,
  Signal,
  Users,
  Utensils,
  AlertCircle,
  PlusCircle,
  PlayCircle,
  StopCircle,
} from "lucide-react";
import QueueAnalytics from "./queue-analytics";
import { LogoutButton } from "../../auth/logout-button.jsx";

const statusDetails = {
  low: {
    label: "Low crowd",
    className: "bg-emerald-100 text-emerald-800",
  },
  moderate: {
    label: "Moderate crowd",
    className: "bg-amber-100 text-amber-800",
  },
  high: {
    label: "High crowd",
    className: "bg-orange-100 text-orange-800",
  },
  veryHigh: {
    label: "Very high crowd",
    className: "bg-red-100 text-red-800",
  },
  closed: {
    label: "Closed",
    className: "bg-slate-100 text-slate-700",
  },
};

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"];

export default function QueueDashboard() {
  const [messes, setMesses] = useState([]);
  const [selectedMessId, setSelectedMessId] = useState("");
  const [counters, setCounters] = useState([]);
  const [queues, setQueues] = useState([]);
  const [selectedQueueId, setSelectedQueueId] = useState("");
  const [history, setHistory] = useState([]);
  const [demand, setDemand] = useState(null);

  const [activeMealType, setActiveMealType] = useState("LUNCH");
  const [peopleInput, setPeopleInput] = useState("");
  const [rateInput, setRateInput] = useState("");

  const selectedMessIdRef = useRef(selectedMessId);
  const activeMealTypeRef = useRef(activeMealType);

  useEffect(() => {
    selectedMessIdRef.current = selectedMessId;
  }, [selectedMessId]);

  useEffect(() => {
    activeMealTypeRef.current = activeMealType;
  }, [activeMealType]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [formMessage, setFormMessage] = useState(null);

  // Modal / form state for creating a new counter
  const [showAddCounter, setShowAddCounter] = useState(false);
  const [newCounterName, setNewCounterName] = useState("");
  const [newCounterCode, setNewCounterCode] = useState("");
  const [newCounterRate, setNewCounterRate] = useState("4");
  const [counterSubmitting, setCounterSubmitting] = useState(false);
  const [counterError, setCounterError] = useState("");

  // ── 1. Fetch Messes from Real API ─────────────────────────────────────────
  const fetchMesses = useCallback(async () => {
    try {
      const res = await fetch("/api/queues/messes", { credentials: "same-origin" });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || "Failed to load mess records.");
      }
      return payload.data ?? [];
    } catch (err) {
      console.error("Failed to load messes:", err);
      throw err;
    }
  }, []);

  // ── 2. Fetch Counters for Selected Mess ───────────────────────────────────
  const fetchCounters = useCallback(async (messId) => {
    if (!messId) return [];
    try {
      const res = await fetch(`/api/counters?messId=${encodeURIComponent(messId)}&status=ACTIVE`, {
        credentials: "same-origin",
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        return [];
      }
      return payload.data ?? [];
    } catch (err) {
      console.error("Failed to load counters:", err);
      return [];
    }
  }, []);

  // ── 3. Fetch Queues for Selected Mess ─────────────────────────────────────
  const fetchQueues = useCallback(async (messId) => {
    if (!messId) return [];
    try {
      const res = await fetch(`/api/queues?messId=${encodeURIComponent(messId)}`, {
        credentials: "same-origin",
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        return [];
      }
      return payload.data ?? [];
    } catch (err) {
      console.error("Failed to load queues:", err);
      return [];
    }
  }, []);

  // ── 4. Fetch Demand for Selected Mess & Meal Type ─────────────────────────
  const fetchDemand = useCallback(async (messId, mealType) => {
    if (!messId) return null;
    try {
      const res = await fetch(
        `/api/queues/demand?messId=${encodeURIComponent(messId)}&mealType=${encodeURIComponent(mealType)}`,
        { credentials: "same-origin" }
      );
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        return null;
      }
      return payload.data ?? null;
    } catch (err) {
      console.error("Failed to load demand:", err);
      return null;
    }
  }, []);

  // ── 5. Fetch History for a Specific Queue ─────────────────────────────────
  const fetchQueueHistory = useCallback(async (queueId) => {
    if (!queueId) return [];
    try {
      const res = await fetch(`/api/queues/${encodeURIComponent(queueId)}/history?limit=15`, {
        credentials: "same-origin",
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        return [];
      }
      return payload.data?.history ?? [];
    } catch (err) {
      console.error("Failed to load queue history:", err);
      return [];
    }
  }, []);

  // ── 6. Load Initial Dashboard Data ────────────────────────────────────────
  const loadDashboardData = useCallback(async (keepSelectedMess = false, overrideMessId = null) => {
    try {
      const messList = await fetchMesses();
      setError(null);
      setMesses(messList);

      if (messList.length === 0) {
        setSelectedMessId("");
        setCounters([]);
        setQueues([]);
        setDemand(null);
        setHistory([]);
        return;
      }

      // Preserve currently selected mess if requested or if valid in fetched mess list
      const targetId = overrideMessId || (keepSelectedMess ? selectedMessIdRef.current : null);
      const activeMess =
        targetId && messList.some((m) => m.id === targetId)
          ? messList.find((m) => m.id === targetId)
          : messList[0];

      setSelectedMessId(activeMess.id);

      const mealType = activeMealTypeRef.current;
      const [counterList, queueList, demandInfo] = await Promise.all([
        fetchCounters(activeMess.id),
        fetchQueues(activeMess.id),
        fetchDemand(activeMess.id, mealType),
      ]);

      setCounters(counterList);
      setQueues(queueList);
      setDemand(demandInfo);

      // Select initial queue
      const activeQueue = queueList.find((q) => q.isOpen) || queueList[0];
      if (activeQueue) {
        setSelectedQueueId(activeQueue.id);
        setPeopleInput(String(activeQueue.peopleWaiting ?? 0));
        setRateInput(String(activeQueue.servingRatePerMinute ?? 4));
        const hist = await fetchQueueHistory(activeQueue.id);
        setHistory(hist);
      } else {
        setSelectedQueueId("");
        setPeopleInput("0");
        setRateInput("4");
        setHistory([]);
      }
    } catch (err) {
      setError(err.message || "Could not connect to the queue service.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchMesses, fetchCounters, fetchQueues, fetchDemand, fetchQueueHistory]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) loadDashboardData(false);
    });
    return () => {
      active = false;
    };
  }, [loadDashboardData]);

  // ── 7. Handle Mess Selection Change ───────────────────────────────────────
  async function handleMessChange(messId) {
    setSelectedMessId(messId);
    setFormMessage(null);
    setLoading(true);

    try {
      const [counterList, queueList, demandInfo] = await Promise.all([
        fetchCounters(messId),
        fetchQueues(messId),
        fetchDemand(messId, activeMealType),
      ]);

      setCounters(counterList);
      setQueues(queueList);
      setDemand(demandInfo);

      const activeQueue = queueList.find((q) => q.isOpen) || queueList[0];
      if (activeQueue) {
        setSelectedQueueId(activeQueue.id);
        setPeopleInput(String(activeQueue.peopleWaiting ?? 0));
        setRateInput(String(activeQueue.servingRatePerMinute ?? 4));
        const hist = await fetchQueueHistory(activeQueue.id);
        setHistory(hist);
      } else {
        setSelectedQueueId("");
        setPeopleInput("0");
        setRateInput("4");
        setHistory([]);
      }
    } catch (err) {
      console.error("Failed to switch mess:", err);
      setFormMessage({ type: "error", text: "Failed to load data for selected mess." });
    } finally {
      setLoading(false);
    }
  }

  // ── 8. Handle Meal Type Change ────────────────────────────────────────────
  async function handleMealTypeChange(mealType) {
    setActiveMealType(mealType);
    if (!selectedMessId) return;

    const [queueList, demandInfo] = await Promise.all([
      fetchQueues(selectedMessId),
      fetchDemand(selectedMessId, mealType),
    ]);

    setQueues(queueList);
    setDemand(demandInfo);

    // Pick queue matching this meal type if possible
    const match = queueList.find((q) => q.mealType === mealType && q.isOpen) ||
                  queueList.find((q) => q.mealType === mealType) ||
                  queueList[0];

    if (match) {
      setSelectedQueueId(match.id);
      setPeopleInput(String(match.peopleWaiting ?? 0));
      setRateInput(String(match.servingRatePerMinute ?? 4));
      const hist = await fetchQueueHistory(match.id);
      setHistory(hist);
    }
  }

  // ── 9. Select a Specific Queue / Counter ──────────────────────────────────
  async function handleSelectQueue(queue) {
    if (!queue) return;
    setSelectedQueueId(queue.id);
    setPeopleInput(String(queue.peopleWaiting ?? 0));
    setRateInput(String(queue.servingRatePerMinute ?? 4));
    setFormMessage(null);

    const hist = await fetchQueueHistory(queue.id);
    setHistory(hist);
  }

  // ── 10. Handle Queue Update via Real API (PATCH) ──────────────────────────
  async function handleQueueUpdate(event) {
    event.preventDefault();
    setFormMessage(null);

    if (!selectedQueueId) {
      setFormMessage({ type: "error", text: "Select an active queue to update." });
      return;
    }

    const people = Number(peopleInput);
    const rate = Number(rateInput);

    if (peopleInput.trim() === "" || !Number.isInteger(people) || people < 0) {
      setFormMessage({ type: "error", text: "Enter a non-negative whole number of people." });
      return;
    }

    if (rateInput.trim() === "" || !Number.isFinite(rate) || rate <= 0) {
      setFormMessage({ type: "error", text: "Serving rate must be greater than zero." });
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/queues/${encodeURIComponent(selectedQueueId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          peopleWaiting: people,
          servingRatePerMinute: rate,
        }),
      });

      const payload = await res.json();

      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || "Failed to update queue.");
      }

      const updated = payload.data;

      // Update in state
      setQueues((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      setFormMessage({ type: "success", text: "Queue updated successfully." });

      // Refresh history from DB
      const hist = await fetchQueueHistory(selectedQueueId);
      setHistory(hist);
    } catch (err) {
      setFormMessage({ type: "error", text: err.message || "Failed to save queue update." });
    } finally {
      setSubmitting(false);
    }
  }

  // ── 11. Open a New Queue for a Counter (POST) ─────────────────────────────
  async function handleOpenQueue(counterId) {
    setSubmitting(true);
    setFormMessage(null);

    try {
      const counter = counters.find((c) => c.id === counterId);
      const res = await fetch("/api/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          counterId,
          mealType: activeMealType,
          servingRatePerMinute: counter?.defaultServingRatePerMinute ?? 4,
        }),
      });

      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || "Failed to open queue.");
      }

      const newQ = payload.data;
      setQueues((prev) => [newQ, ...prev.filter((q) => q.id !== newQ.id)]);
      setSelectedQueueId(newQ.id);
      setPeopleInput(String(newQ.peopleWaiting ?? 0));
      setRateInput(String(newQ.servingRatePerMinute ?? 4));
      setFormMessage({ type: "success", text: `Queue opened for ${activeMealType}.` });

      const hist = await fetchQueueHistory(newQ.id);
      setHistory(hist);
    } catch (err) {
      setFormMessage({ type: "error", text: err.message || "Failed to open queue." });
    } finally {
      setSubmitting(false);
    }
  }

  // ── 12. Close an Active Queue (PATCH isOpen: false) ────────────────────────
  async function handleCloseQueue(queueId) {
    setSubmitting(true);
    setFormMessage(null);

    try {
      const res = await fetch(`/api/queues/${encodeURIComponent(queueId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ isOpen: false }),
      });

      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || "Failed to close queue.");
      }

      const updated = payload.data;
      setQueues((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      setFormMessage({ type: "success", text: "Queue closed successfully." });

      const hist = await fetchQueueHistory(queueId);
      setHistory(hist);
    } catch (err) {
      setFormMessage({ type: "error", text: err.message || "Failed to close queue." });
    } finally {
      setSubmitting(false);
    }
  }

  // ── 13. Start a New Session on a Closed Queue (POST /sessions) ────────────
  async function handleStartNewSession(queueId) {
    setSubmitting(true);
    setFormMessage(null);

    try {
      const res = await fetch(`/api/queues/${encodeURIComponent(queueId)}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          servingRatePerMinute: Number(rateInput) || 4,
        }),
      });

      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || "Failed to start new session.");
      }

      const newSession = payload.data;
      setQueues((prev) => prev.map((q) => (q.id === newSession.id ? newSession : q)));
      setSelectedQueueId(newSession.id);
      setPeopleInput(String(newSession.peopleWaiting ?? 0));
      setRateInput(String(newSession.servingRatePerMinute ?? 4));
      setFormMessage({ type: "success", text: "New service session started." });

      const hist = await fetchQueueHistory(newSession.id);
      setHistory(hist);
    } catch (err) {
      setFormMessage({ type: "error", text: err.message || "Failed to start session." });
    } finally {
      setSubmitting(false);
    }
  }

  // ── 14. Add New Counter (POST /api/counters) ──────────────────────────────
  async function handleCreateCounter(e) {
    e.preventDefault();
    setCounterError("");

    if (!newCounterName.trim()) {
      setCounterError("Counter name is required.");
      return;
    }
    if (!newCounterCode.trim()) {
      setCounterError("Counter code is required.");
      return;
    }
    const rate = Number(newCounterRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setCounterError("Default serving rate must be positive.");
      return;
    }

    setCounterSubmitting(true);

    try {
      const res = await fetch("/api/counters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          messId: selectedMessId,
          name: newCounterName.trim(),
          code: newCounterCode.trim().toUpperCase(),
          defaultServingRatePerMinute: rate,
        }),
      });

      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || "Failed to create counter.");
      }

      const created = payload.data;
      setCounters((prev) => [created, ...prev]);
      setShowAddCounter(false);
      setNewCounterName("");
      setNewCounterCode("");
      setNewCounterRate("4");

      // Auto-open a queue for this counter
      await handleOpenQueue(created.id);
    } catch (err) {
      setCounterError(err.message || "Failed to create counter.");
    } finally {
      setCounterSubmitting(false);
    }
  }

  // ── Derived View State ───────────────────────────────────────────────────
  const selectedMess = messes.find((m) => m.id === selectedMessId);

  // Map counters to queues
  const counterQueueMap = counters.map((counter) => {
    const queue = queues.find((q) => q.counterId === counter.id);
    return {
      counter,
      queue: queue || null,
    };
  });

  const selectedQueue = queues.find((q) => q.id === selectedQueueId) || null;
  const selectedCounter = selectedQueue
    ? counters.find((c) => c.id === selectedQueue.counterId)
    : counters[0] || null;

  const totalPeopleWaiting = queues
    .filter((q) => q.isOpen)
    .reduce((sum, q) => sum + (q.peopleWaiting ?? 0), 0);

  const activeQueuesCount = queues.filter((q) => q.isOpen).length;

  const queueStatusConfig = selectedQueue
    ? statusDetails[selectedQueue.crowdLevel] || (selectedQueue.isOpen ? statusDetails.low : statusDetails.closed)
    : statusDetails.closed;

  // Analytics preparation
  const analyticsQueues = counterQueueMap
    .filter(({ queue }) => queue && queue.isOpen)
    .map(({ counter, queue }) => ({
      ...queue,
      counterName: `${counter.name} (${counter.code})`,
    }));

  // ── Render Loading State ─────────────────────────────────────────────────
  if (loading && messes.length === 0) {
    return (
      <main className="min-h-screen bg-[#FFF8ED] text-[#0B1020] flex items-center justify-center p-6">
        <div className="text-center" role="status" aria-live="polite">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-teal-700" />
          <p className="mt-4 font-bold text-slate-700">Loading queue dashboard from database...</p>
        </div>
      </main>
    );
  }

  // ── Render Error State ───────────────────────────────────────────────────
  if (error && messes.length === 0) {
    return (
      <main className="min-h-screen bg-[#FFF8ED] text-[#0B1020] flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-2xl font-black">Connection Error</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadDashboardData(false);
            }}
            className="mt-6 rounded-xl bg-[#0B1020] px-6 py-3 font-semibold text-white hover:bg-teal-800"
          >
            Retry Connection
          </button>
        </div>
      </main>
    );
  }

  // ── Render Empty State (No Messes configured in DB) ───────────────────────
  if (messes.length === 0) {
    return (
      <main className="min-h-screen bg-[#FFF8ED] text-[#0B1020]">
        <header className="border-b border-black/10 bg-white/80">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
              <ArrowLeft size={18} />
              Back to RushLess
            </Link>
            <LogoutButton />
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Utensils size={32} />
          </div>
          <h1 className="mt-6 text-3xl font-black">No Messes Configured</h1>
          <p className="mt-3 text-slate-600">
            No active Mess records were found for your assigned hostel. Messes must be created
            and configured through the Mess Admin module before live queues can be managed.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                loadDashboardData(false);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B1020] px-6 py-3 font-semibold text-white hover:bg-teal-800"
            >
              <RefreshCw size={16} />
              Check Again
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Render Live Dashboard ────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#FFF8ED] text-[#0B1020]">
      {/* Top Navigation */}
      <header className="border-b border-black/10 bg-white/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-4">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
              <ArrowLeft size={18} />
              Back to RushLess
            </Link>
            <nav className="flex items-center gap-1.5" aria-label="Mess Admin sections">
              <Link
                href="/queue"
                className="rounded-full bg-slate-900 px-3.5 py-1 text-xs font-bold text-white shadow-sm"
              >
                Queue & Crowd
              </Link>
              <Link
                href="/kitchen"
                className="rounded-full border border-black/10 bg-white px-3.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                Kitchen Portal
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              LIVE DATABASE
            </span>

            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                loadDashboardData(true);
              }}
              disabled={refreshing}
              title="Refresh queue status from server"
              className="rounded-full border border-black/10 bg-white p-2 text-slate-700 hover:bg-slate-50 transition"
              aria-label="Refresh dashboard"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>

            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 md:py-12">
        {/* Page Title & Context */}
        <section className="mb-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-700">
            Queue & Crowd Management
          </p>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Less waiting. <span className="text-teal-700">More dining.</span>
              </h1>
              <p className="mt-2 text-sm text-slate-600 max-w-2xl">
                Operational queue management integrated directly with Mess Admin and Student Meal Demand.
              </p>
            </div>

            {/* Mess Selector */}
            {messes.length > 1 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Mess:</span>
                <select
                  value={selectedMessId}
                  onChange={(e) => handleMessChange(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold shadow-sm focus:border-teal-600 focus:outline-none"
                  aria-label="Select mess"
                >
                  {messes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : selectedMess ? (
              <div className="rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-2 text-right">
                <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">Active Mess</span>
                <p className="font-extrabold text-teal-900">{selectedMess.name}</p>
              </div>
            ) : null}
          </div>

          {/* Meal Slot Selector */}
          <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Meal slots">
            {MEAL_TYPES.map((slot) => {
              const isActive = activeMealType === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleMealTypeChange(slot)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                    isActive
                      ? "bg-[#0B1020] text-white shadow-sm"
                      : "bg-white border border-black/10 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </section>

        {/* Operational KPI Summary Cards */}
        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-3xl bg-[#0B1020] p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/70">
                People waiting at active counters
              </span>
              <Users className="text-[#20D6C7]" size={22} />
            </div>
            <p className="mt-4 text-4xl font-black">{totalPeopleWaiting}</p>
            <p className="mt-1 text-xs text-white/60">
              Live physical queue · {activeQueuesCount} open {activeQueuesCount === 1 ? "counter" : "counters"}
            </p>
          </article>

          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Expected student meal demand
              </span>
              <Utensils className="text-teal-700" size={22} />
            </div>
            <p className="mt-4 text-4xl font-black text-slate-900">
              {demand?.totalStudentIntent ?? "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {demand?.source === "STUDENT_DEMAND" ? "Verified student intent" : "Baseline projection"} for {activeMealType}
            </p>
          </article>

          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Counters configured
              </span>
              <Signal className="text-teal-700" size={22} />
            </div>
            <p className="mt-4 text-4xl font-black text-slate-900">{counters.length}</p>
            <p className="mt-1 text-xs text-slate-500">
              In {selectedMess?.name || "Selected Mess"}
            </p>
          </article>
        </section>

        {/* Main Operational Section */}
        <section className="grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left Column: Counters & Queues in Selected Mess */}
          <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm md:p-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  Counters & Queues
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedMess?.name} ({selectedMess?.code}) · {activeMealType}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddCounter(!showAddCounter)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100 transition"
              >
                <PlusCircle size={14} />
                Add Counter
              </button>
            </div>

            {/* Inline Add Counter Form */}
            {showAddCounter && (
              <form
                onSubmit={handleCreateCounter}
                className="mb-6 rounded-2xl border border-teal-200 bg-teal-50/50 p-4"
              >
                <h3 className="font-bold text-sm text-teal-900">Create New Counter</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block">Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Counter 1"
                      value={newCounterName}
                      onChange={(e) => setNewCounterName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block">Code</label>
                    <input
                      type="text"
                      placeholder="e.g. C1"
                      value={newCounterCode}
                      onChange={(e) => setNewCounterCode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs uppercase"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block">Serving Rate</label>
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      placeholder="4"
                      value={newCounterRate}
                      onChange={(e) => setNewCounterRate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                      required
                    />
                  </div>
                </div>

                {counterError && (
                  <p className="mt-2 text-xs font-medium text-red-600">{counterError}</p>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    type="submit"
                    disabled={counterSubmitting}
                    className="rounded-lg bg-[#0B1020] px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
                  >
                    {counterSubmitting ? "Creating..." : "Save Counter"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddCounter(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* List of Counters and their Queues */}
            {counterQueueMap.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <Utensils className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-3 font-bold text-slate-700">No counters configured</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Click &ldquo;Add Counter&rdquo; to create a counter and start tracking queues for {selectedMess?.name}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {counterQueueMap.map(({ counter, queue }) => {
                  const isSelected = queue && queue.id === selectedQueueId;
                  const queueStatus = queue
                    ? statusDetails[queue.crowdLevel] || (queue.isOpen ? statusDetails.low : statusDetails.closed)
                    : statusDetails.closed;

                  return (
                    <div
                      key={counter.id}
                      className={`rounded-2xl border p-4 transition ${
                        isSelected
                          ? "border-teal-600 bg-teal-50 ring-2 ring-teal-600/15"
                          : "border-black/10 bg-white hover:border-teal-400"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div
                          className="cursor-pointer flex-1"
                          onClick={() => queue && handleSelectQueue(queue)}
                        >
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900">{counter.name}</h3>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-slate-600">
                              {counter.code}
                            </span>
                          </div>
                          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <MapPin size={12} />
                            {selectedMess?.name}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${queueStatus.className}`}>
                            {queue ? queueStatus.label : "No Queue"}
                          </span>

                          {queue ? (
                            queue.isOpen ? (
                              <button
                                type="button"
                                onClick={() => handleCloseQueue(queue.id)}
                                disabled={submitting}
                                title="Close queue"
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 transition"
                              >
                                <StopCircle size={18} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStartNewSession(queue.id)}
                                disabled={submitting}
                                title="Start new session"
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-600 transition"
                              >
                                <PlayCircle size={18} />
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenQueue(counter.id)}
                              disabled={submitting}
                              className="rounded-lg bg-teal-700 px-3 py-1 text-xs font-bold text-white hover:bg-teal-800 transition"
                            >
                              Open Queue
                            </button>
                          )}
                        </div>
                      </div>

                      {queue ? (
                        <div
                          className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm cursor-pointer"
                          onClick={() => handleSelectQueue(queue)}
                        >
                          <span>
                            <Users className="mr-1 inline text-teal-700" size={15} />
                            <strong>{queue.peopleWaiting}</strong> waiting
                          </span>
                          <span>
                            <Clock3 className="mr-1 inline text-teal-700" size={15} />
                            <strong>{queue.estimatedWaitMinutes}</strong> min estimated
                          </span>
                          <span className="text-xs text-slate-500 self-center">
                            Rate: {queue.servingRatePerMinute}/min
                          </span>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-slate-400">
                          Default rate: {counter.defaultServingRatePerMinute}/min · Click &ldquo;Open Queue&rdquo; to start tracking.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Selected Queue Status & Live Controls */}
          <aside className="rounded-3xl bg-[#0B1020] p-6 text-white shadow-xl md:p-8">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold tracking-wider text-white/70 uppercase">
                SELECTED QUEUE
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  selectedQueue?.isOpen
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-white/10 text-white/70"
                }`}
              >
                {selectedQueue?.isOpen ? "Live Session" : "Closed"}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-black">
              {selectedCounter ? selectedCounter.name : "Select a Counter"}
            </h2>

            <p className="mt-1 text-xs text-white/60">
              {selectedMess?.name} ({selectedMess?.code}) · {activeMealType}
            </p>

            <div className="my-6 rounded-2xl bg-white/5 p-5">
              <p className="text-xs text-white/65 uppercase tracking-wider font-semibold">
                Estimated waiting time
              </p>

              <p className="mt-2 text-5xl font-black tracking-tight text-[#C5F467]">
                {selectedQueue ? selectedQueue.estimatedWaitMinutes : 0}
                <span className="ml-2 text-lg font-semibold text-white/70">min</span>
              </p>

              <p className="mt-2 text-xs text-white/60">
                Calculated dynamically from live queue length and serving rate.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-4">
                <Users className="mb-2 text-[#20D6C7]" size={20} />
                <p className="text-2xl font-extrabold">
                  {selectedQueue ? selectedQueue.peopleWaiting : 0}
                </p>
                <p className="mt-0.5 text-xs text-white/60">People waiting</p>
              </div>

              <div className="rounded-2xl bg-white/5 p-4">
                <Clock3 className="mb-2 text-[#C5F467]" size={20} />
                <p className="text-2xl font-extrabold">
                  {selectedQueue ? selectedQueue.servingRatePerMinute : 4}
                </p>
                <p className="mt-0.5 text-xs text-white/60">Rate (people/min)</p>
              </div>
            </div>

            {/* Demand Planning Callout */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/80">
              <p className="font-bold text-teal-300">Expected Demand Signal:</p>
              <p className="mt-1">
                {demand?.totalStudentIntent ?? 0} students projected for {activeMealType}.
                (Cook target: {demand?.recommendedTarget ?? 0} with buffer).
              </p>
              <p className="mt-1.5 text-[11px] text-white/50">
                Student demand informs kitchen preparation; live queue tracks physical counter lines.
              </p>
            </div>
          </aside>

          {/* Operational Queue Update Form */}
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-xl font-extrabold text-slate-900">
              Update Queue Status
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Operational controls for mess staff. Updates are atomically persisted to MongoDB.
            </p>

            {selectedQueue ? (
              <form onSubmit={handleQueueUpdate} className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  People physically waiting
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={peopleInput}
                    onChange={(e) => setPeopleInput(e.target.value)}
                    disabled={!selectedQueue.isOpen || submitting}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-teal-600 focus:outline-none disabled:bg-slate-100"
                    required
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  People served per minute (rate)
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    disabled={!selectedQueue.isOpen || submitting}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-teal-600 focus:outline-none disabled:bg-slate-100"
                    required
                  />
                </label>

                <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={!selectedQueue.isOpen || submitting}
                    className="rounded-xl bg-[#0B1020] px-6 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition"
                  >
                    {submitting ? "Saving to server..." : "Save queue update"}
                  </button>

                  {!selectedQueue.isOpen && (
                    <button
                      type="button"
                      onClick={() => handleStartNewSession(selectedQueue.id)}
                      disabled={submitting}
                      className="rounded-xl border border-teal-700 bg-teal-50 px-5 py-3 text-sm font-semibold text-teal-800 hover:bg-teal-100 transition"
                    >
                      Start New Service Session
                    </button>
                  )}
                </div>

                {formMessage && (
                  <div
                    role={formMessage.type === "error" ? "alert" : "status"}
                    className={`sm:col-span-2 rounded-xl p-3 text-sm font-medium ${
                      formMessage.type === "error"
                        ? "bg-red-50 text-red-800 border border-red-200"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    }`}
                  >
                    {formMessage.text}
                  </div>
                )}
              </form>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
                Select a counter with an open queue to update wait counts or serving rates.
              </p>
            )}
          </div>
        </section>

        {/* Analytics & Queue History */}
        <QueueAnalytics queues={analyticsQueues} history={history} />
      </div>
    </main>
  );
}
