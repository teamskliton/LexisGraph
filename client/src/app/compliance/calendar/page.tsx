import { ComplianceCalendarWorkspace } from "@/components/compliance/ComplianceCalendarWorkspace";

export const metadata = {
  title: "Compliance Deadlines & Calendar | LexisGraph",
  description: "View and manage compliance remediation deadlines, upcoming legal milestones, and overdue findings.",
};

export default function ComplianceCalendarPage() {
  return <ComplianceCalendarWorkspace />;
}
