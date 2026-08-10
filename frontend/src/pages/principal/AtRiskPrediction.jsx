import { useState, useEffect } from "react";
import TermTabs from "../../components/at-risk/TermTabs";
import RiskStatCard from "../../components/at-risk/RiskStatCard";
import RiskSection from "../../components/at-risk/RiskSection";
import {
  getAtRiskPredictionSummary,
  getStudentsByRiskLevel,
} from "../../services/atRiskPredictionApi";
import "../../styles/atRiskBreakdown.css";
import "../../styles/atRiskPrediction.css";

const EMPTY_SUMMARY = { lowRisk: 0, mediumRisk: 0, highRisk: 0, total: 0 };
const EMPTY_STUDENTS = { students: [], totalCount: 0 };

export default function AtRiskPrediction() {
  const [activeTerm, setActiveTerm] = useState("overall");
  const [gradeLevel, setGradeLevel] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [highStudents, setHighStudents] = useState(EMPTY_STUDENTS);
  const [mediumStudents, setMediumStudents] = useState(EMPTY_STUDENTS);
  const [lowStudents, setLowStudents] = useState(EMPTY_STUDENTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const termParam = activeTerm === "overall" ? undefined : activeTerm;
        const [summaryData, highData, mediumData, lowData] =
          await Promise.all([
            getAtRiskPredictionSummary({ schoolYear, term: termParam, gradeLevel }).catch(() => EMPTY_SUMMARY),
            getStudentsByRiskLevel({ schoolYear, term: termParam, gradeLevel, riskLevel: "high", limit: 2 }).catch(() => EMPTY_STUDENTS),
            getStudentsByRiskLevel({ schoolYear, term: termParam, gradeLevel, riskLevel: "medium", limit: 2 }).catch(() => EMPTY_STUDENTS),
            getStudentsByRiskLevel({ schoolYear, term: termParam, gradeLevel, riskLevel: "low", limit: 2 }).catch(() => EMPTY_STUDENTS),
          ]);

        if (cancelled) return;

        setSummary(summaryData);
        setHighStudents(highData);
        setMediumStudents(mediumData);
        setLowStudents(lowData);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load at-risk prediction data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [activeTerm, gradeLevel, schoolYear]);

  const handleTermChange = (term) => {
    setActiveTerm(term);
  };

  const handleGradeLevelChange = (e) => {
    setGradeLevel(e.target.value);
  };

  const handleSchoolYearChange = (e) => {
    setSchoolYear(e.target.value);
  };

  const handleSeeAll = (riskLevel) => {
    console.log("See all:", riskLevel);
  };

  return (
    <div className="ar-page">
      <div className="ar-header">
        <div>
          <h1 className="ar-title">At-Risk Prediction</h1>
          <p className="ar-subtitle">Early Warning System | Updated Weekly</p>
        </div>
        <div className="ar-header-actions">
          <button className="ar-icon-btn" type="button" aria-label="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span className="ar-badge" />
          </button>
        </div>
      </div>

      <div className="ar-filter-row">
        <TermTabs active={activeTerm} onChange={handleTermChange} disabled={loading} />
        <div className="ar-filter-group">
          <div className="ar-filter-control">
            <label className="ar-filter-label">Grade Level</label>
            <select
              className="ar-filter-select"
              value={gradeLevel}
              onChange={handleGradeLevelChange}
              disabled={loading}
            >
              <option value="">Grade Level</option>
              <option value="7">Grade 7</option>
              <option value="8">Grade 8</option>
              <option value="9">Grade 9</option>
              <option value="10">Grade 10</option>
            </select>
          </div>
          <div className="ar-filter-control">
            <label className="ar-filter-label">School Year</label>
            <select
              className="ar-filter-select"
              value={schoolYear}
              onChange={handleSchoolYearChange}
              disabled={loading}
            >
              <option value="">School Year</option>
              <option value="2025-2026">SY 2025-2026</option>
              <option value="2024-2025">SY 2024-2025</option>
              <option value="2023-2024">SY 2023-2024</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="ar-error-banner">{error}</div>}

      <div className="ar-body">
        <div className="ar-stats-row">
          <RiskStatCard
            title="Low Risk"
            value={summary.lowRisk}
            caption="Preventive Support"
            accentColor="#16A34A"
            icon="🛡️"
            loading={loading}
          />
          <RiskStatCard
            title="Medium Risk"
            value={summary.mediumRisk}
            caption="Needs Monitoring"
            accentColor="#F4B400"
            icon="⚠️"
            loading={loading}
          />
          <RiskStatCard
            title="High Risk"
            value={summary.highRisk}
            caption="Immediate Attention"
            accentColor="#EF4444"
            icon="🚨"
            loading={loading}
          />
          <RiskStatCard
            title="Total"
            value={summary.total}
            caption="School wide"
            accentColor="#475569"
            icon="👥"
            loading={loading}
          />
        </div>

        <div className="ar-prediction-sections">
          <RiskSection
            riskLevel="high"
            title="High risk — immediate attention"
            students={highStudents.students}
            totalCount={highStudents.totalCount}
            loading={loading}
            onSeeAll={handleSeeAll}
          />
          <RiskSection
            riskLevel="medium"
            title="Medium risk — monitor closely"
            students={mediumStudents.students}
            totalCount={mediumStudents.totalCount}
            loading={loading}
            onSeeAll={handleSeeAll}
          />
          <RiskSection
            riskLevel="low"
            title="Low risk — preventive support recommended"
            students={lowStudents.students}
            totalCount={lowStudents.totalCount}
            loading={loading}
            onSeeAll={handleSeeAll}
          />
        </div>
      </div>
    </div>
  );
}
