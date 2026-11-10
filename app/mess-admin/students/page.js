import "../../admin/admin.css";
import { AppShell } from "../../../components/layout/app-shell.jsx";
import { StudentApprovalManager } from "../../../features/student-approval/student-approval-manager.jsx";
import { authorizeRouteRoles } from "../../../lib/auth-authorization.js";
import { USER_ROLE } from "../../../lib/auth-contracts.js";

const messAdminNav = [
  { label: "Home", href: "/", isHome: true },
  { label: "Queue dashboard", href: "/queue" },
  { label: "Student approvals", href: "/mess-admin/students" },
  { label: "Kitchen portal", href: "/kitchen" },
];

export const metadata = {
  title: "Student Approvals | RushLess",
  description: "Review pending Student registrations for your assigned Hostel.",
};

export default async function MessAdminStudentsPage() {
  await authorizeRouteRoles([USER_ROLE.MESS_ADMIN], "/mess-admin/students");

  return (
    <AppShell navItems={messAdminNav} showLogout>
      <div className="min-h-screen bg-cream px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-6xl">
          <StudentApprovalManager audience="messAdmin" />
        </div>
      </div>
    </AppShell>
  );
}
