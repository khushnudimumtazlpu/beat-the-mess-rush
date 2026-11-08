import { AdminPageHeading } from "../../../features/super-admin/admin-page-primitives.jsx";
import { MessAdminManager } from "../../../features/super-admin/mess-admin-manager.jsx";

export default function MessAdminsPage() {
  return (
    <div className="admin-mess-admin-page">
      <AdminPageHeading
        eyebrow="ACCESS & ASSIGNMENTS"
        title="Mess Admins"
        description="Review access requests and manage which active Mess Admin is assigned to each Hostel."
      />
      <MessAdminManager />
    </div>
  );
}
