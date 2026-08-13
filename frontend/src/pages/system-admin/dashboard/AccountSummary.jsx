import {
  GraduationCap,
  School,
  ShieldCheck,
  UserCog,
  UsersRound,
} from "lucide-react";
import StatCard from "../../../components/common/StatCard";

const createStatistics = (summary) => [
  {
    id: "total-accounts",
    title: "Total Accounts",
    value: summary.totalAccounts,
    description: `${summary.activeAccounts} active • ${summary.inactiveAccounts} inactive`,
    icon: UsersRound,
    variant: "primary",
  },
  {
    id: "subject-teachers",
    title: "Subject Teachers",
    value: summary.roles.subject_teacher,
    description: "Teaching accounts",
    icon: GraduationCap,
    variant: "info",
  },
  {
    id: "department-heads",
    title: "Department Heads",
    value: summary.roles.department_head,
    description: "Department oversight",
    icon: UserCog,
    variant: "warning",
  },
  {
    id: "principals",
    title: "Principals",
    value: summary.roles.principal,
    description: "School oversight",
    icon: School,
    variant: "violet",
  },
  {
    id: "system-admins",
    title: "System Administrators",
    value: summary.roles.system_admin,
    description: "System access",
    icon: ShieldCheck,
    variant: "success",
  },
];

export default function AccountSummary({ summary, isLoading, error, onRetry }) {
  return (
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

      {error ? (
        <div className="admin-dashboard-state admin-dashboard-state--error">
          <span>{error}</span>
          <button type="button" onClick={onRetry}>Try Again</button>
        </div>
      ) : (
        <div className="dashboard-summary__grid" aria-busy={isLoading}>
          {isLoading
            ? Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  className="summary-stat-card summary-stat-card--skeleton"
                  aria-hidden="true"
                />
              ))
            : createStatistics(summary).map((statistic) => (
                <StatCard key={statistic.id} {...statistic} />
              ))}
        </div>
      )}
    </section>
  );
}
