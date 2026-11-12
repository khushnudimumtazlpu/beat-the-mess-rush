"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, History, RefreshCw, Utensils } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/layout/page-primitives";
import { Reveal } from "../landing/landing-motion";
import { getStudentDemandHistory } from "./demand-api.js";

const PAGE_SIZE = 10;

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

function HistoryErrorState({ error, onRetry }) {
  return (
    <div className="history-state history-state--error" role="alert">
      <span className="history-state__icon"><AlertTriangle size={21} aria-hidden="true" /></span>
      <h2>History could not be loaded.</h2>
      <p>{error?.message || "Try again in a moment."}</p>
      {error?.status === 401 ? <Link href="/login">Sign in again</Link> : null}
      <Button onClick={onRetry} variant="secondary"><RefreshCw size={15} aria-hidden="true" /> Try again</Button>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(`${value}T00:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatArrival(value) {
  if (!value) return "Arrival time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function mealLabel(mealType) {
  return ({ BREAKFAST: "Breakfast", LUNCH: "Lunch", SNACKS: "Snacks", DINNER: "Dinner" })[mealType] ?? mealType;
}

function HistoryRecords({ records }) {
  return (
    <ul className="history-record-list">
      {records.map((record) => (
        <li className="history-record" key={record.id}>
          <span className="history-record__icon"><Utensils size={17} aria-hidden="true" /></span>
          <span className="history-record__details">
            <strong>{mealLabel(record.mealType)} · {record.portion.toLowerCase()}</strong>
            <small>{formatDate(record.serviceDate)} · Arriving {formatArrival(record.expectedArrivalAt)}</small>
            <small>{record.mess?.name || "Mess record unavailable"}{record.mess?.code ? ` · ${record.mess.code}` : ""}</small>
          </span>
          <Badge tone={record.status === "ACTIVE" ? "teal" : "coral"}>{record.status === "ACTIVE" ? "Active" : "Cancelled"}</Badge>
        </li>
      ))}
    </ul>
  );
}

function HistoryEmptyState({ hasFilters }) {
  return (
    <div className="history-state history-state--empty">
      <span className="history-state__illustration"><History size={29} strokeWidth={1.6} aria-hidden="true" /><span aria-hidden="true">✳</span></span>
      <Badge tone="lavender">No records</Badge>
      <h2>{hasFilters ? "No meals match these filters." : "Your meal story starts here."}</h2>
      <p>{hasFilters ? "Try another date or status." : "Saved meal demands, including cancelled plans, will appear here."}</p>
      {!hasFilters ? <Button href="/student/meals" size="large">Plan a meal <ArrowRight size={16} aria-hidden="true" /></Button> : null}
    </div>
  );
}

export default function MealHistory() {
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getStudentDemandHistory({
      page,
      limit: PAGE_SIZE,
      status: status || undefined,
      serviceDate: serviceDate || undefined,
      signal: controller.signal,
    }).then((data) => {
      if (controller.signal.aborted) return;
      setRecords(Array.isArray(data?.demands) ? data.demands : []);
      setPagination(data?.pagination ?? { page, limit: PAGE_SIZE, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false });
    }).catch((requestError) => {
      if (!controller.signal.aborted) setError(requestError);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [page, status, serviceDate, retryKey]);

  function updateStatus(event) {
    setLoading(true);
    setError(null);
    setStatus(event.target.value);
    setPage(1);
  }

  function updateServiceDate(event) {
    setLoading(true);
    setError(null);
    setServiceDate(event.target.value);
    setPage(1);
  }

  function changePage(nextPage) {
    setLoading(true);
    setError(null);
    setPage(nextPage);
  }

  function retryHistory() {
    setLoading(true);
    setError(null);
    setRetryKey((key) => key + 1);
  }

  const hasFilters = Boolean(status || serviceDate);

  return (
    <div className="student-page student-history-page">
      <PageContainer>
        <Reveal className="student-page-heading student-page-heading--compact">
          <div>
            <Link href="/student" className="student-back-link"><ArrowLeft size={15} aria-hidden="true" /> Student overview</Link>
            <span className="student-overline"><History size={14} aria-hidden="true" /> MEAL HISTORY</span>
            <h1>Your meals, <em>in one place.</em></h1>
            <p>Review active and cancelled meal demands saved to your account.</p>
          </div>
          <Badge tone="neutral">{pagination.total} records</Badge>
        </Reveal>

        <Reveal className="history-panel student-panel" delay={0.06}>
          <div className="student-panel__topline">
            <div><span className="student-panel__eyebrow">YOUR SAVED DEMANDS</span><h2>Meal history</h2></div>
            <span className="history-panel__mark"><History size={16} aria-hidden="true" /></span>
          </div>

          <div className="history-filters" aria-label="Filter meal history">
            <div><label htmlFor="history-status">Status</label><select id="history-status" value={status} onChange={updateStatus}>
              <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="CANCELLED">Cancelled</option>
            </select></div>
            <div><label htmlFor="history-date">Service date</label><input id="history-date" type="date" value={serviceDate} onChange={updateServiceDate} /></div>
            {hasFilters ? <Button variant="quiet" size="small" onClick={() => { setLoading(true); setError(null); setStatus(""); setServiceDate(""); setPage(1); }}>Clear filters</Button> : null}
          </div>

          {loading ? <HistoryLoadingState /> : null}
          {!loading && error ? <HistoryErrorState error={error} onRetry={retryHistory} /> : null}
          {!loading && !error && records.length === 0 ? <HistoryEmptyState hasFilters={hasFilters} /> : null}
          {!loading && !error && records.length > 0 ? <HistoryRecords records={records} /> : null}

          {!loading && !error && pagination.totalPages > 0 ? (
            <nav className="history-pagination" aria-label="Meal history pages">
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <div>
                <Button variant="secondary" size="small" onClick={() => changePage(Math.max(1, page - 1))} disabled={!pagination.hasPreviousPage}>Previous</Button>
                <Button variant="secondary" size="small" onClick={() => changePage(page + 1)} disabled={!pagination.hasNextPage}>Next</Button>
              </div>
            </nav>
          ) : null}
        </Reveal>
        <p className="student-disclaimer student-history-page__disclaimer">Only your account’s saved demand details are shown. Cancelled records remain in your history.</p>
      </PageContainer>
    </div>
  );
}
