import React from "react";

const RISK_CONFIG = {
  low: {
    pillClass: "ar-pill-green",
    label: "Low Risk",
    accent: "#16A34A",
    defaultBullets: [
      "Borderline grades (74-76)",
      "1-2 absences this months",
      "Early intervention needed",
    ],
  },
  medium: {
    pillClass: "ar-pill-amber",
    label: "Medium Risk",
    accent: "#d97706",
    defaultBullets: [
      "Borderline grades (74-76)",
      "1-2 absences this months",
      "Early intervention needed",
    ],
  },
  high: {
    pillClass: "ar-pill-red",
    label: "High Risk",
    accent: "#dc2626",
    defaultBullets: [
      "Borderline grades (74-76)",
      "1-2 absences this months",
      "Early intervention needed",
    ],
  },
};

export default function RiskLevelCard({ riskLevel = "low", label, count, notes, loading }) {
  const config = RISK_CONFIG[riskLevel] || RISK_CONFIG.low;
  const bullets = notes && notes.length > 0 ? notes : config.defaultBullets;

  return (
    <div className="ar-risk-bottom-card">
      <div className="ar-risk-card-header">
        <span className={`ar-risk-pill ${config.pillClass}`}>
          {label || config.label}
        </span>
        <span className="ar-risk-learners-count">
          {loading ? "—" : `${count} learners`}
        </span>
      </div>

      <div className="ar-risk-card-body">
        {loading ? (
          <div className="ar-skeleton-lines">
            <div className="ar-skeleton-line" />
            <div className="ar-skeleton-line" />
            <div className="ar-skeleton-line" />
          </div>
        ) : (
          <ul className="ar-risk-bullets-list">
            {bullets.map((bullet, idx) => (
              <li key={idx} className="ar-risk-bullet-item">
                <span className="ar-risk-bullet-dot">•</span>
                <span className="ar-risk-bullet-text">{bullet}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
