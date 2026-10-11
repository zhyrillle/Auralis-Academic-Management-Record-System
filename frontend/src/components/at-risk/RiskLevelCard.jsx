import React from "react";
import { AlertTriangle, AlertCircle, MinusCircle, User } from "lucide-react";

const RISK_CONFIG = {
  low: {
    pillClass: "ar-pill-green",
    label: "Low Risk",
    accent: "#16A34A",
    icon: AlertCircle,
    criteria: "Passing but near threshold / Preventive support",
  },
  medium: {
    pillClass: "ar-pill-amber",
    label: "Medium Risk",
    accent: "#d97706",
    icon: MinusCircle,
    criteria: "Borderline GPA, attendance issues, or missing tasks",
  },
  high: {
    pillClass: "ar-pill-red",
    label: "High Risk",
    accent: "#dc2626",
    icon: AlertTriangle,
    criteria: "Failing average (<75) or multiple critical indicators",
  },
};

export default function RiskLevelCard({
  riskLevel = "low",
  label,
  count = 0,
  students = [],
  notes = [],
  loading = false,
}) {
  const config = RISK_CONFIG[riskLevel] || RISK_CONFIG.low;
  const learnerCount = count !== undefined ? count : (students?.length || 0);

  return (
    <div className="ar-risk-bottom-card" style={{ borderTop: `4px solid ${config.accent}` }}>
      <div className="ar-risk-card-header">
        <div className="ar-risk-title-wrap">
          <span className={`ar-risk-pill ${config.pillClass}`}>
            {label || config.label}
          </span>
          <span className="ar-risk-criteria-sub">{config.criteria}</span>
        </div>
        <span className="ar-risk-learners-count" style={{ color: config.accent }}>
          {loading ? "—" : `${learnerCount} learner${learnerCount === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="ar-risk-card-body">
        {loading ? (
          <div className="ar-skeleton-lines">
            <div className="ar-skeleton-line" />
            <div className="ar-skeleton-line" />
            <div className="ar-skeleton-line" />
          </div>
        ) : students && students.length > 0 ? (
          <div className="ar-breakdown-students-list">
            {students.map((s, idx) => (
              <div key={s.id || s.studentId || idx} className="ar-breakdown-student-item">
                <div className="ar-breakdown-student-avatar" style={{ backgroundColor: `${config.accent}18`, color: config.accent }}>
                  <User size={14} />
                </div>
                <div className="ar-breakdown-student-info">
                  <span className="ar-breakdown-student-name">{s.name}</span>
                  <span className="ar-breakdown-student-meta">
                    {s.grade ? `Grade ${s.grade}` : ""} {s.section ? `• ${s.section}` : ""} {s.adviser ? `• Adv: ${s.adviser}` : ""}
                  </span>
                  {s.flags && s.flags.length > 0 && (
                    <span className="ar-breakdown-student-reason">
                      {s.flags[0].label}
                    </span>
                  )}
                </div>
                <span className="ar-breakdown-score-badge" style={{ color: config.accent, backgroundColor: `${config.accent}14` }}>
                  Score: {s.riskScore}
                </span>
              </div>
            ))}
          </div>
        ) : notes && notes.length > 0 ? (
          <ul className="ar-risk-bullets-list">
            {notes.map((bullet, idx) => (
              <li key={idx} className="ar-risk-bullet-item">
                <span className="ar-risk-bullet-dot" style={{ color: config.accent }}>•</span>
                <span className="ar-risk-bullet-text">{bullet}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ar-risk-empty-tier">
            No learners currently flagged in this tier.
          </div>
        )}
      </div>
    </div>
  );
}

