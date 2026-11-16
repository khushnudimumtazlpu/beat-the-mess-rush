"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export default function QueueAnalytics({ queues = [], history = [] }) {
  const chartData = queues.map((queue) => ({
    name: queue.counterName || queue.name || "Counter",
    peopleWaiting: queue.peopleWaiting ?? 0,
    waitMinutes: queue.estimatedWaitMinutes ?? 0,
  }));

  function formatTime(timestamp) {
    if (!timestamp) return "—";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return String(timestamp);
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  }

  return (
    <section className="mt-10 space-y-6" aria-labelledby="queue-analytics-heading">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">
          Queue intelligence
        </p>
        <h2 id="queue-analytics-heading" className="mt-2 text-2xl font-black text-[#0B1020]">
          Queue analytics & history
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Real-time queue load and database-recorded operational history.
        </p>
      </div>

      {chartData.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="mb-5 font-bold">People waiting by counter</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="peopleWaiting"
                    name="People waiting"
                    fill="#20D6C7"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="mb-5 font-bold">Estimated wait by counter</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="waitMinutes"
                    name="Estimated wait (minutes)"
                    fill="#B9A7FF"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-extrabold">Queue update history</h3>

        <p className="mt-1 text-sm text-slate-500">
          {history.length > 0
            ? "Database records persisted for this queue."
            : "No database history records recorded yet for this queue."}
        </p>

        {history.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-slate-500">
                  <th className="py-3 pr-4">Recorded at</th>
                  <th className="py-3 pr-4">People waiting</th>
                  <th className="py-3 pr-4">Serving rate</th>
                  <th className="py-3 pr-4">Estimated wait</th>
                  <th className="py-3 pr-4">Crowd level</th>
                  <th className="py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-black/5">
                    <td className="py-3 pr-4 font-mono text-xs text-slate-600">
                      {formatTime(item.recordedAt)}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-slate-900">
                      {item.peopleWaiting}
                    </td>
                    <td className="py-3 pr-4">
                      {item.servingRatePerMinute} people/min
                    </td>
                    <td className="py-3 pr-4">
                      {item.estimatedWaitMinutes} min
                    </td>
                    <td className="py-3 pr-4 capitalize">
                      {item.crowdLevel}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          item.isOpen
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.isOpen ? "Open" : "Closed"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
