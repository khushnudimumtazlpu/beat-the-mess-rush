"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Clock3, RefreshCw, Signal } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { demoQueues } from "../queue/data/demo-queues";

const sourceLabels = {
  live: "Live feed",
  reported: "Staff-reported",
  estimated: "Estimate",
  demo: "Campus estimate",
};

function formatStatusLabel(status, count) {
  if (!status) return `${count ?? 0} waiting`;
  const cleanStatus = status.toLowerCase();
  const label = cleanStatus.includes("rush") ? cleanStatus : `${cleanStatus} rush`;
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return Number.isFinite(count) ? `${capitalized} — ${count} waiting` : capitalized;
}

/**
 * Queue integration contract (provided by Ravindra's module):
 * { state: "live" | "reported" | "estimated" | "demo",
 *   statusLabel: string, estimatedWaitMinutes?: number,
 *   source: string, updatedAtLabel: string }
 *
 * When `queueInfo` is omitted, this component automatically integrates with
 * the live /api/queues endpoint and gracefully falls back to interactive
 * demo queue snapshots for all campus messes.
 */
export function QueueInfoCard({ queueInfo: propQueueInfo = null }) {
  const [selectedMessId, setSelectedMessId] = useState(demoQueues[0]?.id || "mess-a");
  const [liveQueues, setLiveQueues] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshLiveQueues = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/queues", { credentials: "same-origin" });
      if (!res.ok) {
        setLiveQueues(null);
        return;
      }
      const payload = await res.json();
      if (payload?.success && Array.isArray(payload.data) && payload.data.length > 0) {
        setLiveQueues(payload.data);
      } else {
        setLiveQueues(null);
      }
    } catch {
      setLiveQueues(null);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (propQueueInfo) return undefined;
    let cancelled = false;

    fetch("/api/queues", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!cancelled && payload?.success && Array.isArray(payload.data) && payload.data.length > 0) {
          setLiveQueues(payload.data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [propQueueInfo]);

  // If a parent component explicitly provided a queueInfo object, use it directly.
  if (propQueueInfo) {
    const sourceLabel = sourceLabels[propQueueInfo.state] ?? "Source not specified";
    return (
      <section className="student-panel queue-info-card" aria-labelledby="queue-info-title">
        <div className="student-panel__topline">
          <span className="student-panel__eyebrow"><Signal size={14} aria-hidden="true" /> QUEUE VISIBILITY</span>
          <Badge tone={propQueueInfo.state === "demo" ? "lavender" : "teal"} dot>{sourceLabel}</Badge>
        </div>
        <div className="queue-info-card__body">
          <span className="queue-info-card__icon"><Signal size={21} aria-hidden="true" /></span>
          <div>
            <h2 id="queue-info-title">{propQueueInfo.statusLabel}</h2>
            {Number.isFinite(propQueueInfo.estimatedWaitMinutes) ? (
              <p className="queue-info-card__wait"><strong>{propQueueInfo.estimatedWaitMinutes}</strong> min <span>estimated wait</span></p>
            ) : null}
            <p>Source: {propQueueInfo.source || "Not provided"}</p>
          </div>
        </div>
        <div className="queue-info-card__foot">
          <Clock3 size={14} aria-hidden="true" /> Updated {propQueueInfo.updatedAtLabel || "time not provided"}
          <ArrowUpRight size={14} aria-hidden="true" />
        </div>
      </section>
    );
  }

  // Determine active queue data: Live API data if present, otherwise interactive demo queue snapshot.
  let currentInfo;
  const activeLiveQueue = liveQueues?.find((q) => q.isOpen) || liveQueues?.[0];

  if (activeLiveQueue) {
    const crowd = activeLiveQueue.crowdLevel || activeLiveQueue.status || "Normal";
    currentInfo = {
      state: "live",
      statusLabel: formatStatusLabel(crowd, activeLiveQueue.peopleWaiting),
      estimatedWaitMinutes: activeLiveQueue.estimatedWaitMinutes ?? 0,
      source: activeLiveQueue.mealType ? `${activeLiveQueue.mealType} Counter` : "Active Queue",
      updatedAtLabel: "Just now",
    };
  } else {
    const selectedDemo = demoQueues.find((q) => q.id === selectedMessId) || demoQueues[0];
    currentInfo = {
      state: "demo",
      statusLabel: formatStatusLabel(selectedDemo.status, selectedDemo.peopleWaiting),
      estimatedWaitMinutes: selectedDemo.estimatedWaitMinutes,
      source: `${selectedDemo.name} · ${selectedDemo.location}`,
      updatedAtLabel: selectedDemo.updatedAtLabel || "Updated live",
    };
  }

  const sourceLabel = sourceLabels[currentInfo.state] ?? "Campus estimate";

  return (
    <section className="student-panel queue-info-card" aria-labelledby="queue-info-title">
      <div className="student-panel__topline">
        <span className="student-panel__eyebrow"><Signal size={14} aria-hidden="true" /> QUEUE VISIBILITY</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            className="queue-info-card__refresh"
            onClick={refreshLiveQueues}
            title="Refresh queue status"
            aria-label="Refresh queue status"
          >
            <RefreshCw size={13} className={isRefreshing ? "spin" : ""} aria-hidden="true" />
          </button>
          <Badge tone={currentInfo.state === "demo" ? "lavender" : "teal"} dot>{sourceLabel}</Badge>
        </div>
      </div>

      <div className="queue-info-card__body">
        <span className="queue-info-card__icon"><Signal size={21} aria-hidden="true" /></span>
        <div>
          <h2 id="queue-info-title">{currentInfo.statusLabel}</h2>
          {Number.isFinite(currentInfo.estimatedWaitMinutes) ? (
            <p className="queue-info-card__wait">
              <strong>{currentInfo.estimatedWaitMinutes}</strong> min <span>estimated wait</span>
            </p>
          ) : null}
          <p>Source: {currentInfo.source || "Not provided"}</p>
        </div>
      </div>

      {currentInfo.state === "demo" ? (
        <div className="queue-info-card__chips" role="tablist" aria-label="Campus messes">
          {demoQueues.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selectedMessId === item.id}
              className={`queue-info-card__chip ${selectedMessId === item.id ? "is-active" : ""}`}
              onClick={() => setSelectedMessId(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="queue-info-card__foot">
        <Clock3 size={14} aria-hidden="true" /> Updated {currentInfo.updatedAtLabel}
        <ArrowUpRight size={14} aria-hidden="true" />
      </div>
    </section>
  );
}
