const SkeletonBlock = ({ className = "" }) => (
  <span className={`grading-period-skeleton__block ${className}`} />
);

export default function GradingPeriodOverviewSkeleton() {
  return (
    <section
      className="grading-period-skeleton grading-period-overview-skeleton"
      aria-busy="true"
    >
      <span className="grade-lock-sr-only" role="status" aria-live="polite">
        Loading the academic period overview.
      </span>

      <div className="grading-period-skeleton__section-heading" aria-hidden="true">
        <SkeletonBlock className="grading-period-skeleton__heading" />
        <SkeletonBlock className="grading-period-skeleton__subheading" />
      </div>

      <div className="grading-period-skeleton__term-grid" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <article className="grading-period-skeleton__term-card" key={index}>
            <div className="grading-period-skeleton__term-topline">
              <SkeletonBlock className="grading-period-skeleton__date" />
              <SkeletonBlock className="grading-period-skeleton__badge" />
            </div>
            <SkeletonBlock className="grading-period-skeleton__term-title" />
            <SkeletonBlock className="grading-period-skeleton__label" />
            <SkeletonBlock className="grading-period-skeleton__progress" />
            <div className="grading-period-skeleton__term-meta">
              <SkeletonBlock />
              <SkeletonBlock />
            </div>
            <SkeletonBlock className="grading-period-skeleton__button" />
          </article>
        ))}
      </div>

      <article className="grading-period-skeleton__operations" aria-hidden="true">
        <div className="grading-period-skeleton__operations-header">
          <div>
            <SkeletonBlock className="grading-period-skeleton__heading" />
            <SkeletonBlock className="grading-period-skeleton__subheading" />
          </div>
          <SkeletonBlock className="grading-period-skeleton__tabs" />
        </div>
        <div className="grading-period-skeleton__summary">
          <SkeletonBlock className="grading-period-skeleton__summary-value" />
          <SkeletonBlock className="grading-period-skeleton__summary-progress" />
          <SkeletonBlock className="grading-period-skeleton__summary-chip" />
          <SkeletonBlock className="grading-period-skeleton__summary-chip" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div className="grading-period-skeleton__row" key={index}>
            <SkeletonBlock />
            <SkeletonBlock />
            <SkeletonBlock />
          </div>
        ))}
      </article>
    </section>
  );
}
