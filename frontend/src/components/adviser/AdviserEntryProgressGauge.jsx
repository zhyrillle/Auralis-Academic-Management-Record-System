import React from "react";

export default function AdviserEntryProgressGauge({ progress = 0, loading = false }) {
  if (loading) {
    return (
      <div className="adviser-dashboard__entry-gauge-card adviser-dashboard__entry-gauge-card--skeleton">
        <div className="adviser-dashboard__skeleton-circle" />
      </div>
    );
  }

  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));

  // Semi-circle SVG parameters
  const radius = 80;
  const strokeWidth = 14;
  // Arc length for 180 degree semi-circle = Math.PI * radius
  const arcLength = Math.PI * radius;
  const strokeDashoffset = arcLength * (1 - safeProgress / 100);

  return (
    <div className="adviser-dashboard__entry-gauge-card">
      <div className="adviser-dashboard__gauge-wrapper">
        <svg
          viewBox="0 0 200 120"
          className="adviser-dashboard__gauge-svg"
          aria-hidden="true"
        >
          {/* Background Track (Grey) */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#E3E6EB"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Progress Path (Golden Yellow) */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#ECC13C"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="adviser-dashboard__gauge-center-text">
          <span className="adviser-dashboard__gauge-percent">{safeProgress}%</span>
        </div>
      </div>

      <div className="adviser-dashboard__gauge-label">Entry Progress</div>
    </div>
  );
}

