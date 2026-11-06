import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  Database,
  GraduationCap,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Badge } from "../../components/ui/badge.jsx";
import { AdminEmptyState, AdminPageHeading } from "../../features/super-admin/admin-page-primitives.jsx";

const workspaces = [
  {
    label: "Hostels & Messes",
    description: "Campus locations and the messes within each hostel.",
    href: "/admin/hostels",
    icon: Building2,
  },
  {
    label: "Mess Admins",
    description: "Administrator approval and hostel assignment workspace.",
    href: "/admin/mess-admins",
    icon: UsersRound,
  },
  {
    label: "Students",
    description: "Student approval workspace organized by hostel.",
    href: "/admin/students",
    icon: GraduationCap,
  },
];

export default function AdminOverviewPage() {
  return (
    <div>
      <AdminPageHeading
        eyebrow="CAMPUS CONTROL ROOM"
        title="Overview"
        description="A clear starting point for campus setup, administrator access, and student approvals."
      />

      <section className="admin-overview-hero" aria-labelledby="admin-overview-title">
        <div className="admin-overview-hero__copy">
          <span className="admin-overline"><ShieldCheck size={14} aria-hidden="true" /> Super Admin workspace</span>
          <h2 id="admin-overview-title">The campus view will take shape as shared data comes online.</h2>
          <p>
            Manage the structure and approvals that keep every hostel, mess, administrator, and student connected.
            Live campus records are not connected in this phase.
          </p>
        </div>
        <span className="admin-overview-hero__mark" aria-hidden="true"><ShieldCheck size={29} /></span>
      </section>

      <section aria-labelledby="admin-workspaces-title">
        <div className="admin-section-heading">
          <div>
            <h2 id="admin-workspaces-title">Administration workspaces</h2>
            <p>Open a section to see its current connection status.</p>
          </div>
          <Badge tone="lavender" dot>UI foundation</Badge>
        </div>
        <div className="admin-module-grid">
          {workspaces.map(({ label, description, href, icon: Icon }) => (
            <Link className="admin-module-card" href={href} key={href}>
              <span className="admin-module-card__icon"><Icon size={19} aria-hidden="true" /></span>
              <span className="admin-module-card__title">{label}<ArrowUpRight size={16} aria-hidden="true" /></span>
              <span className="admin-module-card__description">{description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="admin-data-title">
        <div className="admin-section-heading">
          <div>
            <h2 id="admin-data-title">Campus data</h2>
            <p>Dashboard totals will appear when the shared database integration is available.</p>
          </div>
        </div>
        <AdminEmptyState
          icon={Database}
          title="No live campus data connected"
          description="No statistics or activity are shown until this dashboard connects to campus records."
        />
      </section>
    </div>
  );
}
