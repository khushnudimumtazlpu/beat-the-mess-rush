import Link from "next/link";
import { AlertTriangle, ArrowRight, History, RefreshCw, Utensils } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/layout/page-primitives";
import { demoMealHistory } from "./data/demo-data";
import { Reveal } from "../landing/landing-motion";

export function HistoryLoadingState() {
  return (
    <div className="history-state history-state--loading" role="status" aria-busy="true" aria-label="Loading meal history">
      <span className="history-skeleton history-skeleton--heading" />
      <span className="history-skeleton history-skeleton--row" />
      <span className="history-skeleton history-skeleton--row" />
      <span className="history-skeleton history-skeleton--row" />
    </div>
  );
}

export function HistoryErrorState({ onRetry }) {
  return (
    <div className="history-state history-state--error" role="alert">
      <span className="history-state__icon"><AlertTriangle size={21} aria-hidden="true" /></span>
      <h2>History could not be loaded.</h2>
      <p>Try again when meal records are connected. No selection data is available in this demo.</p>
      {onRetry ? <Button onClick={onRetry} variant="secondary"><RefreshCw size={15} /> Try again</Button> : null}
    </div>
  );
}

function HistoryEmptyState() {
  return (
    <div className="history-state history-state--empty">
      <span className="history-state__illustration"><History size={29} strokeWidth={1.6} aria-hidden="true" /><span aria-hidden="true">✳</span></span>
      <Badge tone="lavender">Demo state</Badge>
      <h2>Your meal story starts here.</h2>
      <p>No meal history is connected in this demo. Once student selections are saved to the application, past meals will appear here.</p>
      <Button href="/student/meals" size="large">Plan a demo meal <ArrowRight size={16} aria-hidden="true" /></Button>
    </div>
  );
}

function HistoryRecords({ records }) {
  return (
    <ul className="history-record-list">
      {records.map((record) => (
        <li className="history-record" key={record.id}>
          <span className="history-record__icon"><Utensils size={17} aria-hidden="true" /></span>
          <span className="history-record__details"><strong>{record.meal}</strong><small>{record.dateLabel} · {record.slotLabel}</small></span>
          <Badge tone={record.state === "demo" ? "lavender" : "teal"}>{record.state === "demo" ? "Demo record" : "Recorded"}</Badge>
        </li>
      ))}
    </ul>
  );
}

export default function MealHistory() {
  const records = demoMealHistory;
  const status = records.length ? "ready" : "empty";

  return (
    <div className="student-page student-history-page">
      <PageContainer>
        <Reveal className="student-page-heading student-page-heading--compact">
          <div>
            <Link href="/student" className="student-back-link"><ArrowRight size={15} aria-hidden="true" /> Student overview</Link>
            <span className="student-overline"><History size={14} aria-hidden="true" /> MEAL HISTORY</span>
            <h1>Your meals, <em>in one place.</em></h1>
            <p>Review past meal selections when they’re saved to your student account.</p>
          </div>
          <Badge tone="neutral">No connected records</Badge>
        </Reveal>

        <Reveal className="history-panel student-panel" delay={0.06}>
          <div className="student-panel__topline">
            <span className="student-panel__eyebrow">PAST MEALS</span>
            <span className="history-panel__mark"><History size={16} aria-hidden="true" /></span>
          </div>
          {status === "loading" ? <HistoryLoadingState /> : null}
          {status === "error" ? <HistoryErrorState /> : null}
          {status === "empty" ? <HistoryEmptyState /> : null}
          {status === "ready" ? <HistoryRecords records={records} /> : null}
        </Reveal>
        <p className="student-disclaimer student-history-page__disclaimer">The meal planner currently displays examples only. Demo selections are not saved to this history.</p>
      </PageContainer>
    </div>
  );
}
