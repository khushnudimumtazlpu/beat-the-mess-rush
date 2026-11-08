import { HostelMessManager } from "../../../features/super-admin/hostel-mess-manager.jsx";
import { AdminPageHeading } from "../../../features/super-admin/admin-page-primitives.jsx";

export default function HostelsPage() {
  return (
    <div className="admin-hostel-page">
      <AdminPageHeading
        eyebrow="CAMPUS STRUCTURE"
        title="Hostels & Messes"
        description="Manage hostel records and the messes operating within each campus residence."
      />
      <HostelMessManager />
    </div>
  );
}
