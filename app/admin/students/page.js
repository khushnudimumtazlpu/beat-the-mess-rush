import { StudentApprovalManager } from "../../../features/student-approval/student-approval-manager.jsx";

export const metadata = {
  title: "Student Approvals | RushLess",
  description: "Review pending Student registrations across all Hostels.",
};

export default function StudentsPage() {
  return <StudentApprovalManager audience="superAdmin" />;
}
