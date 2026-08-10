import StudentRiskCard from "./StudentRiskCard";

/**
 * @typedef {Object} StudentRiskItem
 * @property {string} id
 * @property {string} name
 * @property {number} grade
 * @property {string} section
 * @property {string} adviser
 * @property {number} riskScore
 * @property {import("./StudentRiskCard").StudentFlag[]} flags
 */

/**
 * @typedef {Object} RiskSectionProps
 * @property {"low" | "medium" | "high"} riskLevel
 * @property {string} title
 * @property {StudentRiskItem[]} students
 * @property {number} totalCount
 * @property {boolean} [loading]
 * @property {(riskLevel: string) => void} [onSeeAll]
 */

const TITLE_MAP = {
  low: "Low risk — preventive support recommended",
  medium: "Medium risk — monitor closely",
  high: "High risk — immediate attention",
};

const RISK_CONFIG = {
  low: { accent: "#16A34A" },
  medium: { accent: "#F4B400" },
  high: { accent: "#EF4444" },
};

const DEFAULT_LIMIT = 2;

export default function RiskSection({ riskLevel, title, students, totalCount, loading, onSeeAll }) {
  const config = RISK_CONFIG[riskLevel] || RISK_CONFIG.low;
  const displayStudents = students.slice(0, DEFAULT_LIMIT);
  const hasMore = totalCount > DEFAULT_LIMIT;

  return (
    <div className="ar-risk-section" style={{ borderLeft: `8px solid ${config.accent}` }}>
      <div className="ar-risk-section-header">
        <span className="ar-risk-section-title" style={{ color: config.accent }}>{title || TITLE_MAP[riskLevel]}</span>
        <button className="ar-see-all-btn" type="button" onClick={() => onSeeAll?.(riskLevel)}>
          See all
        </button>
      </div>
      <div className="ar-risk-section-list">
        {loading ? (
          Array.from({ length: 2 }).map((_, idx) => (
            <StudentRiskCard key={idx} riskLevel={riskLevel} loading />
          ))
        ) : displayStudents.length === 0 ? (
          <div className="ar-no-data">No learners in this tier yet</div>
        ) : (
          displayStudents.map((student) => (
            <StudentRiskCard key={student.id} {...student} riskLevel={riskLevel} />
          ))
        )}
        {!loading && hasMore && (
          <div className="ar-see-all-hint">
            <button className="ar-see-all-btn" type="button" onClick={() => onSeeAll?.(riskLevel)}>
              +{totalCount - DEFAULT_LIMIT} more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
