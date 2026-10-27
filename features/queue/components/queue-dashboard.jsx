"use client";

import { useState } from "react";
import Link from "next/link";
import { calculateQueueMetrics } from "../lib/queue-calculations";
import QueueAnalytics from "./queue-analytics";
import {
  ArrowLeft,
  Clock3,
  MapPin,
  RefreshCw,
  Signal,
  Users,
  Utensils,
} from "lucide-react";
import { demoQueues } from "../data/demo-queues";

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
};

export default function QueueDashboard() {
  const [selectedId, setSelectedId] = useState(demoQueues[0].id);

  const [queueData, setQueueData] = useState(demoQueues);

const [history, setHistory] = useState([]);

const [peopleInput, setPeopleInput] = useState(
  String(demoQueues[0].peopleWaiting)
);

const [rateInput, setRateInput] = useState(
  String(demoQueues[0].servingRatePerMinute)
);

const [message, setMessage] = useState("");

//   const selectedQueue = demoQueues.find(
//     (queue) => queue.id === selectedId
//   );

// const queues = demoQueues.map((queue) => ({
//   ...queue,
//   ...calculateQueueMetrics(queue),
// }));

// const selectedQueue = queues.find(
//   (queue) => queue.id === selectedId
// );

const queues = queueData.map((queue) => ({
  ...queue,
  ...calculateQueueMetrics(queue),
}));

const selectedQueue = queues.find(
  (queue) => queue.id === selectedId
);

//   const totalPeopleWaiting = demoQueues.reduce(
//     (total, queue) => total + queue.peopleWaiting,
//     0
//   );

const totalPeopleWaiting = queues.reduce(
  (total, queue) => total + queue.peopleWaiting,
  0
);

  const status = statusDetails[selectedQueue.status];

  
function handleQueueUpdate(event) {
  event.preventDefault();
  setMessage("");

  const people = Number(peopleInput);
  const rate = Number(rateInput);

  if (
    peopleInput.trim() === "" ||
    !Number.isInteger(people) ||
    people < 0
  ) {
    setMessage("Enter a non-negative whole number of people.");
    return;
  }

  if (
    rateInput.trim() === "" ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    setMessage("Serving rate must be greater than zero.");
    return;
  }

  const updatedAt = new Date().toLocaleString();

  setQueueData((previous) =>
    previous.map((queue) =>
      queue.id === selectedId
        ? {
            ...queue,
            peopleWaiting: people,
            servingRatePerMinute: rate,
            updatedAtLabel: updatedAt,
          }
        : queue
    )
  );

  setHistory((previous) => [
    {
      id: `${Date.now()}-${selectedId}`,
      messName: selectedQueue.name,
      peopleWaiting: people,
      servingRatePerMinute: rate,
      updatedAt,
    },
    ...previous,
  ]);

  setMessage("Queue updated successfully (demo only).");
}


  return (
    <main className="min-h-screen bg-[#FFF8ED] text-[#0B1020]">
      <header className="border-b border-black/10 bg-white/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold"
          >
            <ArrowLeft size={18} />
            Back to RushLess
          </Link>

          <span className="rounded-full bg-[#FFF0D8] px-3 py-2 text-xs font-bold text-[#8B4D20]">
            DEMO DATA
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-10 md:py-14">
        <section className="mb-10">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-teal-700">
            Queue & Crowd Management
          </p>

          <h1 className="max-w-3xl text-4xl font-black tracking-tight md:text-6xl">
            Less waiting.
            <span className="block text-teal-700">
              More dining.
            </span>
          </h1>

          <p className="mt-4 max-w-2xl leading-7 text-slate-600">
            Check mess crowd levels and estimated waiting times before
            heading out for your meal.
          </p>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          <article className="rounded-3xl bg-[#0B1020] p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/70">
                People waiting across displayed messes
              </span>
              <Users className="text-[#20D6C7]" size={23} />
            </div>

            <p className="mt-5 text-4xl font-black">
              {totalPeopleWaiting}
            </p>

            <p className="mt-2 text-xs text-white/60">
              Illustrative total · Demo data
            </p>
          </article>

          <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">
                Messes displayed
              </span>
              <Utensils className="text-teal-700" size={23} />
            </div>

            <p className="mt-5 text-4xl font-black">
              {queues.length}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Sample locations for development
            </p>
          </article>
        </section>

        <section className="grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm md:p-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold">
                  Choose your mess
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Select a location to inspect its queue.
                </p>
              </div>

              <Signal className="text-teal-700" size={23} />
            </div>

            <div className="space-y-3">
              {queues.map((queue) => {
                const queueStatus = statusDetails[queue.status];
                const isSelected = queue.id === selectedId;

                return (
                  <button
                    key={queue.id}
                    type="button"
                    // onClick={() => setSelectedId(queue.id)}
                    onClick={() => {
                        setSelectedId(queue.id);
                        setPeopleInput(String(queue.peopleWaiting));
                          setRateInput(String(queue.servingRatePerMinute));
                        setMessage("");
                    }}
                    aria-pressed={isSelected}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-teal-600 bg-teal-50 ring-2 ring-teal-600/15"
                        : "border-black/10 bg-white hover:border-teal-400"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{queue.name}</h3>
                        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                          <MapPin size={14} />
                          {queue.location}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${queueStatus.className}`}
                      >
                        {queueStatus.label}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      <span>
                        <Users
                          className="mr-1 inline"
                          size={15}
                        />
                        {queue.peopleWaiting} waiting
                      </span>
                      <span>
                        <Clock3
                          className="mr-1 inline"
                          size={15}
                        />
                        {queue.estimatedWaitMinutes} min estimated
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="rounded-3xl bg-[#0B1020] p-6 text-white shadow-xl md:p-8">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-white/70">
                SELECTED MESS
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
                Demo
              </span>
            </div>

            <h2 className="mt-5 text-3xl font-black">
              {selectedQueue.name}
            </h2>

            <p className="mt-2 text-sm text-white/60">
              {selectedQueue.location}
            </p>

            <div className="my-7 rounded-2xl bg-white/5 p-5">
              <p className="text-sm text-white/65">
                Estimated waiting time
              </p>

              <p className="mt-2 text-6xl font-black tracking-tight text-[#C5F467]">
                {selectedQueue.estimatedWaitMinutes}
                <span className="ml-2 text-xl font-semibold">
                  min
                </span>
              </p>

              <p className="mt-3 text-sm text-white/60">
                Illustrative estimate, not a live prediction.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-4">
                <Users className="mb-3 text-[#20D6C7]" size={21} />
                <p className="text-2xl font-extrabold">
                  {selectedQueue.peopleWaiting}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  People waiting
                </p>
              </div>

              <div className="rounded-2xl bg-white/5 p-4">
                <RefreshCw className="mb-3 text-[#C5F467]" size={21} />
                <p className="text-lg font-extrabold">
                  {selectedQueue.updatedAtLabel}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  Last update label
                </p>
              </div>
            </div>

            <p className="mt-6 text-xs leading-5 text-white/50">
              Sample figures are used for interface development.
              No live queue feed is connected yet.
            </p>
            
          </aside>

          {/* Staff demo queue update form */}
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-xl font-extrabold">
              Update queue
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Staff demo controls. Changes are not saved to a server.
            </p>

            <form
              onSubmit={handleQueueUpdate}
              className="mt-5 grid gap-4 sm:grid-cols-2"
            >
              <label className="text-sm font-semibold">
                People waiting
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={peopleInput}
                  onChange={(event) =>
                    setPeopleInput(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </label>

              <label className="text-sm font-semibold">
                People served per minute
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={rateInput}
                  onChange={(event) =>
                    setRateInput(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </label>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="rounded-xl bg-[#0B1020] px-5 py-3 font-semibold text-white hover:bg-teal-800"
                >
                  Save queue update
                </button>

                {message && (
                  <p
                    role="status"
                    className="mt-3 text-sm font-medium text-slate-700"
                  >
                    {message}
                  </p>
                )}
              </div>
            </form>
          </div>

          {/* Queue update history */}
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-xl font-extrabold">
              Recent queue updates
            </h2>

            {history.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No updates recorded during this session.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {history.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl bg-slate-50 p-4 text-sm"
                  >
                    <p className="font-bold">
                      {item.messName}
                    </p>

                    <p className="mt-1 text-slate-600">
                      {item.peopleWaiting} people waiting ·{" "}
                      {item.servingRatePerMinute} people served/minute
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {item.updatedAt}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <QueueAnalytics queues={queues} history={history} />

      </div>
    </main>
  );
}