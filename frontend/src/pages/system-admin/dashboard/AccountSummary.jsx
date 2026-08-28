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

const AccountSummarySkeleton = () => (
  <article className="summary-stat-card summary-stat-card--skeleton" aria-hidden="true">
    <div className="summary-stat-card__content">
      <span className="summary-skeleton summary-skeleton--label" />
      <span className="summary-skeleton summary-skeleton--value" />
      <span className="summary-skeleton summary-skeleton--description" />
    </div>
    <span className="summary-skeleton summary-skeleton--icon" />
  </article>
);

export default function AccountSummary({
  summary,
  isLoading,
  error,
  hasLoadedData,
  onRetry,
}) {
  const showInitialSkeleton = isLoading && !hasLoadedData;
  const showBlockingError = error && !hasLoadedData && !isLoading;

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

      {showBlockingError ? (
        <div className="admin-dashboard-state admin-dashboard-state--error">
          <div>
            <strong>Account summary is temporarily unavailable</strong>
            <span>{error}</span>
          </div>
          <button type="button" onClick={onRetry}>Try Again</button>
        </div>
      ) : (
        <>
          {error && hasLoadedData && (
            <div className="dashboard-summary__refresh-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={onRetry}>Retry</button>
            </div>
          )}
          <div
            className={`dashboard-summary__grid ${
              isLoading && hasLoadedData ? "is-refreshing" : ""
            }`}
            aria-busy={isLoading}
          >
          {showInitialSkeleton
            ? Array.from({ length: 5 }, (_, index) => (
                <AccountSummarySkeleton key={index} />
              ))
            : createStatistics(summary).map((statistic) => (
                <StatCard key={statistic.id} {...statistic} />
              ))}
          </div>
          {showInitialSkeleton && (
            <span className="admin-dashboard-sr-only" role="status" aria-live="polite">
              Loading account summary.
            </span>
          )}
        </>
      )}
    </section>
  );
}
