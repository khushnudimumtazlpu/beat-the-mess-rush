import Link from "next/link";
import { AppShell } from "../../../components/layout/app-shell";
import { Badge } from "../../../components/ui/badge";

// ─── Kitchen Shell (ak) ───────────────────────────────────────────────────────
// Sub-navigation and demo ribbon for all kitchen pages.

const kitchenNav = [
  { label: "Home", href: "/" },
  { label: "Kitchen Dashboard", href: "/kitchen" },
  { label: "Production Log", href: "/kitchen/production" },
  { label: "Waste Log", href: "/kitchen/waste" },
  { label: "Analytics", href: "/kitchen/analytics" },
];

export function KitchenShell({ children }) {
  return (
    <AppShell navItems={kitchenNav}>
      <div className="kitchen-app">
        {/* Ribbon banner — mirrors student-demo-ribbon style */}
        <div className="kitchen-demo-ribbon" role="note">
          <Badge tone="coral" dot>Kitchen Portal</Badge>
          <span>Production and waste records are illustrative. No live campus data is connected.</span>
          <Link href="/">Back to RushLess</Link>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
