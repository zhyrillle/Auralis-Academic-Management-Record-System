import React from "react";
import StudentRiskCard from "./StudentRiskCard";

const TITLE_MAP = {
  low: "Low risk — preventive support recommended",
  medium: "Medium risk — monitor closely",
  high: "High risk — immediate attention",
};

const RISK_CONFIG = {
  low: { accent: "#16A34A", titleColor: "#15803d" },
  medium: { accent: "#d97706", titleColor: "#b45309" },
  high: { accent: "#dc2626", titleColor: "#b91c1c" },
};

const DEFAULT_LIMIT = 2;

export default function RiskSection({ riskLevel, title, students, totalCount, loading, onSeeAll }) {
  const config = RISK_CONFIG[riskLevel] || RISK_CONFIG.low;
  const displayStudents = students.slice(0, DEFAULT_LIMIT);
  const hasMore = totalCount > DEFAULT_LIMIT;

  return (
    <div className="ar-risk-section-group">
      <div className="ar-risk-section-header">
        <span className="ar-risk-section-title" style={{ color: config.titleColor }}>
          {title || TITLE_MAP[riskLevel]}
        </span>
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
          <div className="ar-no-data">No learners in this tier currently</div>
        ) : (
          displayStudents.map((student) => (
            <StudentRiskCard key={student.id} {...student} riskLevel={riskLevel} />
          ))
        )}
      </div>
    </div>
  );
}

