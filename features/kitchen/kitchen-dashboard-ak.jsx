"use client";

// ─── Kitchen Dashboard Page (ak) ──────────────────────────────────────────────
// Main landing page for the Kitchen Portal.
// Shows demand card (with slot switcher) + production table for active slot.

import { useState } from "react";
import { UtensilsCrossed, ClipboardList, Leaf, LineChart, Users } from "lucide-react";
import Link from "next/link";
import { DemandCard } from "../../features/kitchen/components/demand-card-ak";
import { ProductionTable } from "../../features/kitchen/components/production-table-ak";
import { PageContainer } from "../../components/layout/page-primitives";
import { useKitchenStore } from "../../features/kitchen/services/kitchen-store-ak";

export default function KitchenDashboardPage() {
  const [activeSlot, setActiveSlot] = useState("lunch");
  const { messes, selectedMessId, setSelectedMessId, selectedMess } = useKitchenStore();

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
            <p>Review today&apos;s demand signals and manage production batches for each meal slot.</p>
            {messes.length > 1 ? (
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="kitchen-stat__label" style={{ fontSize: "0.8rem", fontWeight: "bold" }}>Mess:</span>
                <select
                  value={selectedMessId}
                  onChange={(e) => setSelectedMessId(e.target.value)}
                  className="kitchen-slot-select"
                  aria-label="Select mess"
                >
                  {messes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : selectedMess ? (
              <p style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--kitchen-muted, #4b5563)" }}>
                Active Mess: <strong>{selectedMess.name}</strong> ({selectedMess.code})
              </p>
            ) : null}
          </div>

          {/* Quick nav links */}
          <div className="kitchen-quicklinks">
            <Link href="/queue" className="kitchen-quicklink">
              <Users size={16} aria-hidden="true" />
              Queue & Crowd
            </Link>
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
