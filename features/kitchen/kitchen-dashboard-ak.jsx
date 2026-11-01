"use client";

// ─── Kitchen Dashboard Page (ak) ──────────────────────────────────────────────
// Main landing page for the Kitchen Portal.
// Shows demand card (with slot switcher) + production table for active slot.

import { useState } from "react";
import { UtensilsCrossed, ClipboardList, Leaf, LineChart } from "lucide-react";
import Link from "next/link";
import { DemandCard } from "../../features/kitchen/components/demand-card-ak";
import { ProductionTable } from "../../features/kitchen/components/production-table-ak";
import { PageContainer } from "../../components/layout/page-primitives";

export default function KitchenDashboardPage() {
  const [activeSlot, setActiveSlot] = useState("lunch");

  return (
    <div className="kitchen-page">
      <PageContainer>
        {/* Page heading */}
        <div className="kitchen-page-heading">
          <div>
            <span className="kitchen-overline">
              <UtensilsCrossed size={13} aria-hidden="true" /> KITCHEN PORTAL
            </span>
            <h1>Dashboard</h1>
            <p>Review today's demand signals and manage production batches for each meal slot.</p>
          </div>

          {/* Quick nav links */}
          <div className="kitchen-quicklinks">
            <Link href="/kitchen/production" className="kitchen-quicklink">
              <ClipboardList size={16} aria-hidden="true" />
              Production Log
            </Link>
            <Link href="/kitchen/waste" className="kitchen-quicklink">
              <Leaf size={16} aria-hidden="true" />
              Waste Log
            </Link>
            <Link href="/kitchen/analytics" className="kitchen-quicklink kitchen-quicklink--highlight">
              <LineChart size={16} aria-hidden="true" />
              Analytics
            </Link>
          </div>
        </div>

        {/* Content: Demand card + Production table stacked */}
        <div className="kitchen-dashboard-layout">
          <DemandCard activeSlotId={activeSlot} onSlotChange={setActiveSlot} />
          <ProductionTable activeSlotId={activeSlot} />
        </div>
      </PageContainer>
    </div>
  );
}
