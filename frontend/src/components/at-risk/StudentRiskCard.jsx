import React from "react";
import { Calendar, TrendingDown, FileText, User } from "lucide-react";

const FLAG_ICONS = {
  calendar: Calendar,
  "trending-down": TrendingDown,
  document: FileText,
};

const RISK_CONFIG = {
  low: {
    accent: "#16A34A",
    titleColor: "#15803d",
    flagColor: "#166534",
    badgeBg: "#dcfce7",
    badgeText: "#166534",
    avatarBg: "#112d61",
    avatarColor: "#ffffff",
  },
  medium: {
    accent: "#F4B400",
    titleColor: "#d97706",
    flagColor: "#92400e",
    badgeBg: "#fef3c7",
    badgeText: "#92400e",
    avatarBg: "#112d61",
    avatarColor: "#ffffff",
  },
  high: {
    accent: "#EF4444",
    titleColor: "#dc2626",
    flagColor: "#991b1b",
    badgeBg: "#fee2e2",
    badgeText: "#991b1b",
    avatarBg: "#112d61",
    avatarColor: "#ffffff",
  },
};

export default function StudentRiskCard({ name, grade, section, adviser, riskScore, flags, riskLevel, loading }) {
  const config = RISK_CONFIG[riskLevel] || RISK_CONFIG.low;

  if (loading) {
    return (
      <div className="ar-student-card" style={{ borderLeftColor: config.accent }}>
        <div className="ar-student-main">
          <div className="ar-student-avatar-skeleton" />
          <div className="ar-student-info">
            <div className="ar-skeleton-line" style={{ width: "60%" }} />
            <div className="ar-skeleton-line" style={{ width: "80%" }} />
          </div>
        </div>
        <div className="ar-student-score-skeleton" />
      </div>
    );
  }

  return (
    <div className="ar-student-card" style={{ borderLeft: `5px solid ${config.accent}` }}>
      <div className="ar-student-main">
        <div className="ar-student-avatar" style={{ backgroundColor: "#112d61", color: "#ffffff" }}>
          <User size={22} />
        </div>
        <div className="ar-student-info">
          <div className="ar-student-name">{name}</div>
          <div className="ar-student-meta">
            Grade {grade} • Section {section} • Adviser: {adviser}
          </div>
        </div>
      </div>

      <div className="ar-student-flags">
        {flags && flags.map((flag, idx) => {
          const Icon = FLAG_ICONS[flag.icon] || FileText;
          return (
            <div key={idx} className="ar-flag-row" style={{ color: config.flagColor }}>
              <Icon size={14} className="ar-flag-icon" />
              <span className="ar-flag-text">{flag.label}</span>
            </div>
          );
        })}
      </div>

      <div className="ar-student-score" style={{ background: config.badgeBg, color: config.badgeText }}>
        <span className="ar-score-value">{riskScore}</span>
        <span className="ar-score-label">risk score</span>
      </div>
    </div>
  );
}
