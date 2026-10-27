
"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export default function QueueAnalytics({ queues, history }) {
  const chartData = queues.map((queue) => ({
    name: queue.name,
    peopleWaiting: queue.peopleWaiting,
    waitMinutes: queue.estimatedWaitMinutes,
  }));

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">
          Queue intelligence
        </p>
        <h2 className="mt-2 text-2xl font-black text-[#0B1020]">
          Queue analytics
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Compare current demo queue lengths and estimated waits.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="mb-5 font-bold">People waiting by mess</h3>

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
          <h3 className="mb-5 font-bold">Estimated wait by mess</h3>

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

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-extrabold">Recent update history</h3>

        <p className="mt-1 text-sm text-slate-500">
          {history.length > 0
            ? "Updates recorded during this browser session."
            : "No session updates yet. Use the queue update form to record one."}
        </p>

        {history.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-slate-500">
                  <th className="py-3 pr-4">Mess</th>
                  <th className="py-3 pr-4">People waiting</th>
                  <th className="py-3 pr-4">Wait rate</th>
                  <th className="py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-black/5">
                    <td className="py-3 pr-4 font-semibold">
                      {item.messName}
                    </td>
                    <td className="py-3 pr-4">
                      {item.peopleWaiting}
                    </td>
                    <td className="py-3 pr-4">
                      {item.servingRatePerMinute} people/min
                    </td>
                    <td className="py-3">{item.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs leading-5 text-slate-500">
        Demo analytics only. These charts show current illustrative values,
        not live measurements or a persistent historical trend.
      </p>
    </section>
  );
}
