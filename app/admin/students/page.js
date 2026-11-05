import { GraduationCap } from "lucide-react";
import { AdminSectionPlaceholder } from "../../../features/super-admin/admin-page-primitives.jsx";

export default function StudentsPage() {
  return (
    <AdminSectionPlaceholder
      icon={GraduationCap}
      title="Students"
      description="Review student approval requests by hostel."
    />
  );
}
