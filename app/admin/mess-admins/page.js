import { UsersRound } from "lucide-react";
import { AdminSectionPlaceholder } from "../../../features/super-admin/admin-page-primitives.jsx";

export default function MessAdminsPage() {
  return (
    <AdminSectionPlaceholder
      icon={UsersRound}
      title="Mess Admins"
      description="Review Mess Admin access and hostel assignments."
    />
  );
}
