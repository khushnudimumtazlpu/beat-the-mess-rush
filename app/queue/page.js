import QueueDashboard from "../../features/queue/components/queue-dashboard";

export const metadata = {
  title: "Queue & Crowd Management | RushLess",
  description:
    "View mess queue status and estimated waiting times.",
};

export default function QueuePage() {
  return <QueueDashboard />;
}