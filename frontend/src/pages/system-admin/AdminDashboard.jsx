import { GraduationCap, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import Badge from "../../components/common/Badge";
import StatCard from "../../components/common/StatCard";
import "../../styles/adminDashboard.css";

const statistics = [
  {
    id: "total-teachers",
    title: "Total Teachers",
    value: 24,
    description: "All Accounts",
    icon: UsersRound,
    variant: "primary",
  },
  {
    id: "teachers",
    title: "Teachers",
    value: 4,
    description: "Faculty Members",
    icon: GraduationCap,
    variant: "info",
  },
  {
    id: "department-heads",
    title: "Department Heads",
    value: 1,
    description: "Department Heads",
    icon: UserCog,
    variant: "warning",
  },
  {
    id: "admins",
    title: "Admins",
    value: 7,
    description: "System Access",
    icon: ShieldCheck,
    variant: "success",
  },
];

const auditEntries = [
  {
    id: 1,
    date: "July 21, 2026",
    time: "10:42 AM",
    user: "Angelica Ramos",
    role: "Teacher",
    action: "Updated Grade 8 Mathematics scores",
    severity: "Low",
  },
  {
    id: 2,
    date: "July 21, 2026",
    time: "9:18 AM",
    user: "Carla Mendoza",
    role: "Adviser",
    action: "Submitted quarterly grades for Section Rizal",
    severity: "Medium",
  },
  {
    id: 3,
    date: "July 20, 2026",
    time: "4:05 PM",
    user: "Mark Santos",
    role: "Department Head",
    action: "Reopened a locked grading sheet",
    severity: "High",
  },
  {
    id: 4,
    date: "July 20, 2026",
    time: "2:31 PM",
    user: "Admin User",
    role: "Administrator",
    action: "Created a new faculty account",
    severity: "Low",
  },
  {
    id: 5,
    date: "July 19, 2026",
    time: "11:56 AM",
    user: "Harvey Babia",
    role: "Principal",
    action: "Approved a grade reopen request",
    severity: "Medium",
  },
];

const severityVariants = {
  low: "low",
  medium: "medium",
  high: "high",
};

export default function AdminDashboard() {
  return (
    <div className="admin-dashboard-page">
      <header className="admin-dashboard-intro">
        <div>
          <h1>Welcome back, Admin!</h1>
          <p>Monitor user accounts and recent activity across Auralis.</p>
        </div>
      </header>

      {/* Dashboard Summary */}
      <section
        className="dashboard-summary"
        aria-labelledby="dashboard-summary-title"
      >
        <div className="admin-section-heading">
          <div>
            <h2 id="dashboard-summary-title">Account Summary</h2>
            <p>A quick view of registered faculty and system accounts.</p>
          </div>
        </div>

        <div className="dashboard-summary__grid">
          {statistics.map((statistic) => (
            <StatCard key={statistic.id} {...statistic} />
          ))}
        </div>
      </section>

      <section className="audit-trail" aria-labelledby="audit-trail-title">
        <div className="admin-section-heading audit-trail__heading">
          <div>
            <h2 id="audit-trail-title">Audit Trail</h2>
            <p>Review recent account and grading activity across the system.</p>
          </div>
          <span className="audit-trail__count">
            {auditEntries.length}{" "}
            {auditEntries.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        {/* Audit Trail Table */}
        <div className="audit-trail__table-wrapper">
          <table className="audit-trail__table">
            <thead>
              <tr>
                <th scope="col">Date &amp; Time</th>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Activity</th>
                <th scope="col">Severity</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span className="audit-trail__date">{entry.date}</span>
                    <span className="audit-trail__time">{entry.time}</span>
                  </td>
                  <td className="audit-trail__user">{entry.user}</td>
                  <td>
                    <Badge variant="role">{entry.role}</Badge>
                  </td>
                  <td className="audit-trail__action">{entry.action}</td>
                  <td>
                    <Badge
                      variant={
                        severityVariants[entry.severity.toLowerCase()] ||
                        "default"
                      }
                    >
                      {entry.severity}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
