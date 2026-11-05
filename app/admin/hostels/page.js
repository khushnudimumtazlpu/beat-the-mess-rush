import { Building2 } from "lucide-react";
import { AdminSectionPlaceholder } from "../../../features/super-admin/admin-page-primitives.jsx";

export default function HostelsPage() {
  return (
    <AdminSectionPlaceholder
      icon={Building2}
      title="Hostels & Messes"
      description="Manage campus hostels and their associated messes."
    />
  );
}
