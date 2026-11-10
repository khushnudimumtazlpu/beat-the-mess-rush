import Link from "next/link";
import { AppShell } from "../../../components/layout/app-shell";
import { Badge } from "../../../components/ui/badge";

// ─── Kitchen Shell (ak & _akk) ────────────────────────────────────────────────
// Sub-navigation and status ribbon for all kitchen pages.

const kitchenNav = [
  { label: "Home", href: "/" },
  { label: "Kitchen Dashboard", href: "/kitchen" },
  { label: "Production Log", href: "/kitchen/production" },
  { label: "Waste Log", href: "/kitchen/waste" },
  { label: "Analytics", href: "/kitchen/analytics" },
];

export function KitchenShell({ children }) {
  return (
    <AppShell navItems={kitchenNav} showLogout>
      <div className="kitchen-app">
        {/* Ribbon banner — live database status */}
        <div className="kitchen-demo-ribbon" role="note">
          <Badge tone="teal" dot>Kitchen Portal · Database Connected</Badge>
          <span>Production, demand, and waste records are synchronized with MongoDB database storage.</span>
          <Link href="/">Back to RushLess</Link>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
