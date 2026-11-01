"use client";

// ─── Kitchen Production Page (ak) ─────────────────────────────────────────────
// Full-page production log with slot switcher — a focused view for kitchen staff.

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { PageContainer } from "../../components/layout/page-primitives";
import { DemandCard } from "../../features/kitchen/components/demand-card-ak";
import { ProductionTable } from "../../features/kitchen/components/production-table-ak";

export default function KitchenProductionPage() {
  const [activeSlot, setActiveSlot] = useState("lunch");

  return (
    <div className="kitchen-page">
      <PageContainer>
        <div className="kitchen-page-heading">
          <div>
            <Link href="/kitchen" className="kitchen-back-link">
              <ArrowLeft size={14} aria-hidden="true" /> Kitchen Dashboard
            </Link>
            <span className="kitchen-overline">
              <ClipboardList size={13} aria-hidden="true" /> PRODUCTION LOG
            </span>
            <h1>Batch Production Records</h1>
            <p>Track what was planned, prepared, and served for each dish in every meal slot.</p>
          </div>
        </div>

        <div className="kitchen-dashboard-layout">
          <DemandCard activeSlotId={activeSlot} onSlotChange={setActiveSlot} />
          <ProductionTable activeSlotId={activeSlot} />
        </div>
      </PageContainer>
    </div>
  );
}
