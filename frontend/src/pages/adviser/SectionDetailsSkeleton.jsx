import { SkeletonBlock } from '../../components/common/PageSkeleton.jsx';
import backIconUrl from "../../assets/backButton.svg";

export default function SectionDetailsSkeleton({ onBack, controls, recordControls }) {
  return (
    <div className="section-details-page section-details-skeleton" role="status" aria-busy="true" aria-label="Loading Section Details">
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
          <h1 className="section-details-title"><button type="button" onClick={onBack}>Assigned Classes</button></h1>
        </div>
      </div>

      <div className="kpi-summary-grid kpi-summary-grid--grades-only">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="kpi-card" key={index}>
            <SkeletonBlock className="section-details-skeleton-line skeleton-kpi-label" />
            <SkeletonBlock className="section-details-skeleton-line skeleton-kpi-value" />
            <SkeletonBlock className="section-details-skeleton-line skeleton-kpi-range" />
          </div>
        ))}
      </div>

      {controls}

      <div className="table-container-card">
        <div className="table-sub-header">
          <SkeletonBlock className="section-details-skeleton-line skeleton-total" />
          <div className="sub-header-controls">{recordControls}</div>
        </div>
        <SkeletonBlock className="section-details-skeleton-table-head" />
        {Array.from({ length: 7 }, (_, index) => (
          <div className="section-details-skeleton-table-row" key={index}>
            <SkeletonBlock className="section-details-skeleton-line" />
            <SkeletonBlock className="section-details-skeleton-line" />
            <SkeletonBlock className="section-details-skeleton-line" />
            <SkeletonBlock className="section-details-skeleton-line" />
            <SkeletonBlock className="section-details-skeleton-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
