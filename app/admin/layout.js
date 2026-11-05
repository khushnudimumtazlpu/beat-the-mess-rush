import "./admin.css";
import { AdminShell } from "../../features/super-admin/admin-shell.jsx";
import { authorizeRouteRoles } from "../../lib/auth-authorization.js";
import { USER_ROLE } from "../../lib/auth-contracts.js";

export const metadata = {
  title: "Super Admin | RushLess",
  description: "Campus administration overview for RushLess.",
};

export default async function AdminLayout({ children }) {
  await authorizeRouteRoles([USER_ROLE.SUPER_ADMIN], "/admin");

  return <AdminShell>{children}</AdminShell>;
}
