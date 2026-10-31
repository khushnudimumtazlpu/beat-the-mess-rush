import Link from "next/link";
import { AppShell } from "../../components/layout/app-shell";
import { Badge } from "../../components/ui/badge";

const studentNav = [
  { label: "Home", href: "/" },
  { label: "Student Dashboard", href: "/student" },
  { label: "Plan a Meal", href: "/student/meals" },
  { label: "Meal History", href: "/student/history" },
  { label: "Kitchen Portal", href: "/kitchen" },
];

export function StudentShell({ children }) {
  return (
    <AppShell navItems={studentNav}>
      <div className="student-app">
        <div className="student-demo-ribbon" role="note">
          <Badge tone="lavender" dot>Demo experience</Badge>
          <span>Schedules and menus are illustrative. No campus system is connected.</span>
          <Link href="/">Back to RushLess</Link>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
