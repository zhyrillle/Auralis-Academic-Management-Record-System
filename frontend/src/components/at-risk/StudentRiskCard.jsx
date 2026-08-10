import { Calendar, TrendingDown, FileText } from "lucide-react";

const FLAG_ICONS = {
  calendar: Calendar,
  "trending-down": TrendingDown,
  document: FileText,
};

/**
 * @typedef {Object} StudentFlag
 * @property {string} icon
 * @property {string} label
 */

/**
 * @typedef {Object} StudentRiskCardProps
 * @property {string} name
 * @property {number} grade
 * @property {string} section
 * @property {string} adviser
 * @property {number} riskScore
 * @property {StudentFlag[]} flags
 * @property {string} riskLevel - "low" | "medium" | "high"
 * @property {boolean} [loading]
 */

const RISK_CONFIG = {
  low: {
    accent: "#16A34A",
    pillBg: "#dcfce7",
    pillText: "#166534",
    badgeBg: "#dcfce7",
    badgeText: "#166534",
  },
  medium: {
    accent: "#F4B400",
    pillBg: "#fef3c7",
    pillText: "#92400e",
    badgeBg: "#fef3c7",
    badgeText: "#92400e",
  },
  high: {
    accent: "#EF4444",
    pillBg: "#fee2e2",
    pillText: "#991b1b",
    badgeBg: "#fee2e2",
    badgeText: "#991b1b",
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
    <div className="ar-student-card" style={{ borderLeftColor: config.accent }}>
      <div className="ar-student-main">
        <div className="ar-student-avatar" style={{ background: `${config.accent}14`, color: config.accent }}>
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="ar-student-info">
          <div className="ar-student-name">{name}</div>
          <div className="ar-student-meta">
            Grade {grade} · Section {section} · Adviser: {adviser}
          </div>
        </div>
      </div>
      <div className="ar-student-flags">
        {flags.map((flag, idx) => {
          const Icon = FLAG_ICONS[flag.icon] || FileText;
          return (
            <span key={idx} className="ar-flag" style={{ color: config.accent }}>
              <Icon size={14} />
              {flag.label}
            </span>
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
