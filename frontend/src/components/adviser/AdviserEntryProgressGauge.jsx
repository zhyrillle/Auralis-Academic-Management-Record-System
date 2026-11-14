import { SkeletonBlock } from '../common/PageSkeleton.jsx';
import React from "react";
import { useDashboardInView, useProgressValue } from "./useDashboardProgressAnimation.js";

export default function AdviserEntryProgressGauge({ progress = 0, loading = false }) {
  const [cardRef, isVisible] = useDashboardInView();
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));
  const animatedProgress = useProgressValue(safeProgress, isVisible);

  if (loading) {
    return (
      <div ref={cardRef} className={`adviser-dashboard__entry-gauge-card adviser-dashboard__entry-gauge-card--skeleton adviser-dashboard__scroll-reveal${isVisible ? " is-visible" : ""}`}>
        <SkeletonBlock className="adviser-dashboard__skeleton-circle" />
        <SkeletonBlock className="adviser-dashboard__gauge-skeleton-label" width={100} />
      </div>
    );
  }

  // Semi-circle SVG parameters matching reference design
  const radius = 100;
  const strokeWidth = 20;
  // Arc length for 180 degree semi-circle = Math.PI * radius
  const arcLength = Math.PI * radius;
  const strokeDashoffset = arcLength * (1 - animatedProgress / 100);

  return (
    <div ref={cardRef} className={`adviser-dashboard__entry-gauge-card adviser-dashboard__scroll-reveal${isVisible ? " is-visible" : ""}`}>
      <div className="adviser-dashboard__gauge-wrapper">
        <svg
          viewBox="0 0 260 145"
          className="adviser-dashboard__gauge-svg"
          aria-hidden="true"
        >
          {/* Background Track (Grey) */}
          <path
            d="M 30 125 A 100 100 0 0 1 230 125"
            fill="none"
            stroke="#E5E9F0"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Progress Path (Golden Yellow) */}
          <path
            d="M 30 125 A 100 100 0 0 1 230 125"
            fill="none"
            stroke="#ECC13C"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="adviser-dashboard__gauge-center-text">
          <span className="adviser-dashboard__gauge-percent">{Math.round(animatedProgress)}%</span>
        </div>
      </div>

      <div className="adviser-dashboard__gauge-label">Entry Progress</div>
    </div>
  );
}

