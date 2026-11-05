import QueueDashboard from "../../features/queue/components/queue-dashboard";
import { authorizeRouteRoles } from "../../lib/auth-authorization.js";
import { USER_ROLE } from "../../lib/auth-contracts.js";

export const metadata = {
  title: "Queue & Crowd Management | RushLess",
  description:
    "View mess queue status and estimated waiting times.",
};

export default async function QueuePage() {
  await authorizeRouteRoles([USER_ROLE.MESS_ADMIN, USER_ROLE.SUPER_ADMIN], "/queue");

  return <QueueDashboard />;
}
