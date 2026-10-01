import backIconUrl from "../../assets/backButton.svg";

export default function SectionDetailsSkeleton({ onBack }) {
  return (
    <div className="section-details-page section-details-skeleton" aria-label="Loading Section Details">
      <div className="section-details-header-bar">
        <div className="section-details-title-area">
          <button
            className="back-btn"
            onClick={onBack || (() => window.history.back())}
            title="Back to Classes"
            type="button"
          >
            <img src={backIconUrl} alt="Back" width={17} height={17} />
          </button>
          <div className="section-details-skeleton-line section-details-skeleton-title" />
        </div>
      </div>

      <div className="kpi-summary-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="kpi-card" key={index}>
            <div className="section-details-skeleton-line skeleton-kpi-label" />
            <div className="section-details-skeleton-line skeleton-kpi-value" />
            <div className="section-details-skeleton-line skeleton-kpi-range" />
          </div>
        ))}
      </div>

      <div className="toolbar-row">
        <div className="section-details-skeleton-line skeleton-search" />
        <div className="section-details-skeleton-filters">
          <div className="section-details-skeleton-line skeleton-filter" />
          <div className="section-details-skeleton-line skeleton-filter" />
        </div>
      </div>

      <div className="table-container-card">
        <div className="table-sub-header">
          <div className="section-details-skeleton-line skeleton-total" />
          <div className="section-details-skeleton-line skeleton-controls" />
        </div>
        <div className="section-details-skeleton-table-head" />
        {Array.from({ length: 7 }, (_, index) => (
          <div className="section-details-skeleton-table-row" key={index}>
            <div className="section-details-skeleton-line" />
            <div className="section-details-skeleton-line" />
            <div className="section-details-skeleton-line" />
            <div className="section-details-skeleton-line" />
            <div className="section-details-skeleton-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
