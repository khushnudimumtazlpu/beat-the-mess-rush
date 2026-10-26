import { StudentShell } from "../../features/student/student-shell";

export const metadata = {
  title: "Student Experience | RushLess",
  description: "Plan campus meals in the RushLess student demo experience.",
};

export default function StudentLayout({ children }) {
  return <StudentShell>{children}</StudentShell>;
}
