import { StudentShell } from "../../features/student/student-shell";
import { authorizeRouteRoles } from "../../lib/auth-authorization.js";
import { USER_ROLE } from "../../lib/auth-contracts.js";

export const metadata = {
  title: "Student Experience | RushLess",
  description: "Plan campus meals in the RushLess student demo experience.",
};

export default async function StudentLayout({ children }) {
  await authorizeRouteRoles([USER_ROLE.STUDENT], "/student");

  return <StudentShell>{children}</StudentShell>;
}
