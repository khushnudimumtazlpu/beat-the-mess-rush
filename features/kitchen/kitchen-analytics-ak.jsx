"use client";

// ─── Kitchen Analytics Page (ak) ──────────────────────────────────────────────
// Visualises waste trends, category breakdown, efficiency score, and top wasted dishes.

import Link from "next/link";
import { ArrowLeft, LineChart } from "lucide-react";
import { PageContainer } from "../../components/layout/page-primitives";
import { AnalyticsCharts } from "../../features/kitchen/components/analytics-charts-ak";

export default function KitchenAnalyticsPage() {
  return (
    <div className="kitchen-page">
      <PageContainer>
        <div className="kitchen-page-heading">
          <div>
            <Link href="/kitchen" className="kitchen-back-link">
              <ArrowLeft size={14} aria-hidden="true" /> Kitchen Dashboard
            </Link>
            <span className="kitchen-overline">
              <LineChart size={13} aria-hidden="true" /> ANALYTICS & REPORTS
            </span>
            <h1>Waste Analytics</h1>
            <p>Review food efficiency scores, daily waste trends, and cost loss estimates to improve planning.</p>
          </div>
        </div>

        <AnalyticsCharts />
      </PageContainer>
    </div>
  );
}
