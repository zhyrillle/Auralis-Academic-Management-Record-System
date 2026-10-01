const SkeletonBlock = ({ className = "" }) => (
  <span className={`grading-period-skeleton__block ${className}`} />
);

export default function GradingPeriodTimelineSkeleton() {
  return (
    <section
      className="grading-period-skeleton grading-period-timeline-skeleton"
      aria-busy="true"
    >
      <span className="grade-lock-sr-only" role="status" aria-live="polite">
        Loading the academic period timeline and settings.
      </span>

      <div className="timeline-skeleton__scope" aria-hidden="true">
        <div>
          <SkeletonBlock className="timeline-skeleton__scope-label" />
          <SkeletonBlock className="timeline-skeleton__scope-year" />
        </div>
        <SkeletonBlock className="timeline-skeleton__scope-copy" />
      </div>

      <article className="timeline-skeleton__panel" aria-hidden="true">
        <header className="timeline-skeleton__heading">
          <SkeletonBlock className="timeline-skeleton__eyebrow" />
          <SkeletonBlock className="grading-period-skeleton__heading" />
          <SkeletonBlock className="grading-period-skeleton__subheading" />
        </header>

        <div className="timeline-skeleton__workspace">
          <div className="timeline-skeleton__periods">
            {Array.from({ length: 3 }, (_, index) => (
              <div className="timeline-skeleton__period" key={index}>
                <SkeletonBlock className="timeline-skeleton__period-icon" />
                <div>
                  <SkeletonBlock className="timeline-skeleton__period-name" />
                  <SkeletonBlock className="timeline-skeleton__period-date" />
                </div>
                <SkeletonBlock className="timeline-skeleton__period-badge" />
              </div>
            ))}
          </div>

          <div className="timeline-skeleton__editor">
            <div className="timeline-skeleton__editor-heading">
              <div>
                <SkeletonBlock className="timeline-skeleton__editor-label" />
                <SkeletonBlock className="timeline-skeleton__editor-title" />
              </div>
              <SkeletonBlock className="timeline-skeleton__period-badge" />
            </div>
            <SkeletonBlock className="timeline-skeleton__notice" />
            <div className="timeline-skeleton__fields">
              {Array.from({ length: 7 }, (_, index) => (
                <div className="timeline-skeleton__field" key={index}>
                  <SkeletonBlock className="timeline-skeleton__field-label" />
                  <SkeletonBlock className="timeline-skeleton__field-input" />
                </div>
              ))}
            </div>
            <div className="timeline-skeleton__actions">
              <SkeletonBlock />
              <SkeletonBlock />
            </div>
          </div>
        </div>
      </article>

      <article className="timeline-skeleton__upcoming" aria-hidden="true">
        <SkeletonBlock className="timeline-skeleton__upcoming-icon" />
        <div>
          <SkeletonBlock className="grading-period-skeleton__heading" />
          <SkeletonBlock className="grading-period-skeleton__subheading" />
        </div>
        <SkeletonBlock className="timeline-skeleton__upcoming-button" />
      </article>
    </section>
  );
}
