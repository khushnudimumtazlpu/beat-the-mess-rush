"use client";

// ─── Kitchen Waste Page (ak) ──────────────────────────────────────────────────
// Dedicated page for logging food waste after a service shift.

import Link from "next/link";
import { ArrowLeft, Leaf } from "lucide-react";
import { PageContainer } from "../../components/layout/page-primitives";
import { WasteEntryForm } from "../../features/kitchen/components/waste-entry-form-ak";

export default function KitchenWastePage() {
  return (
    <div className="kitchen-page">
      <PageContainer>
        <div className="kitchen-page-heading">
          <div>
            <Link href="/kitchen" className="kitchen-back-link">
              <ArrowLeft size={14} aria-hidden="true" /> Kitchen Dashboard
            </Link>
            <span className="kitchen-overline">
              <Leaf size={13} aria-hidden="true" /> WASTE RECORDING
            </span>
            <h1>Log Food Waste</h1>
            <p>Record end-of-service waste by dish, category, and weight. Helps track losses and refine planning.</p>
          </div>
        </div>

        <WasteEntryForm />
      </PageContainer>
    </div>
  );
}
