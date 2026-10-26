import { ArrowUpRight, CircleHelp, Clock3, Signal } from "lucide-react";
import { Badge } from "../../components/ui/badge";

const sourceLabels = {
  live: "Live feed",
  reported: "Staff-reported",
  estimated: "Estimate",
  demo: "Demo data",
};

/**
 * Queue integration contract (provided by Ravindra's module):
 * { state: "live" | "reported" | "estimated" | "demo",
 *   statusLabel: string, estimatedWaitMinutes?: number,
 *   source: string, updatedAtLabel: string }
 * This component only displays supplied values; it never calculates queue data.
 */
export function QueueInfoCard({ queueInfo = null }) {
  if (!queueInfo) {
    return (
      <section className="student-panel queue-info-card" aria-labelledby="queue-info-title">
        <div className="student-panel__topline">
          <span className="student-panel__eyebrow"><Signal size={14} aria-hidden="true" /> QUEUE VISIBILITY</span>
          <Badge tone="neutral">Not connected</Badge>
        </div>
        <div className="queue-info-card__body">
          <span className="queue-info-card__icon"><CircleHelp size={21} aria-hidden="true" /></span>
          <div>
            <h2 id="queue-info-title">Queue information unavailable</h2>
            <p>Queue details will appear here when Ravindra’s Queue Management module provides them.</p>
          </div>
        </div>
        <div className="queue-info-card__foot"><Clock3 size={14} aria-hidden="true" /> No live queue status or wait estimate is shown.</div>
      </section>
    );
  }

  const sourceLabel = sourceLabels[queueInfo.state] ?? "Source not specified";

  return (
    <section className="student-panel queue-info-card" aria-labelledby="queue-info-title">
      <div className="student-panel__topline">
        <span className="student-panel__eyebrow"><Signal size={14} aria-hidden="true" /> QUEUE VISIBILITY</span>
        <Badge tone={queueInfo.state === "demo" ? "lavender" : "teal"} dot>{sourceLabel}</Badge>
      </div>
      <div className="queue-info-card__body">
        <span className="queue-info-card__icon"><Signal size={21} aria-hidden="true" /></span>
        <div>
          <h2 id="queue-info-title">{queueInfo.statusLabel}</h2>
          {Number.isFinite(queueInfo.estimatedWaitMinutes) ? (
            <p className="queue-info-card__wait"><strong>{queueInfo.estimatedWaitMinutes}</strong> min <span>estimated wait</span></p>
          ) : null}
          <p>Source: {queueInfo.source || "Not provided"}</p>
        </div>
      </div>
      <div className="queue-info-card__foot"><Clock3 size={14} aria-hidden="true" /> Updated {queueInfo.updatedAtLabel || "time not provided"}<ArrowUpRight size={14} aria-hidden="true" /></div>
    </section>
  );
}
