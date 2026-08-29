import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, MinusCircle, AlertTriangle, Users, Search, X, Moon, Bell } from "lucide-react";
import TermTabs from "../../components/at-risk/TermTabs";
import RiskStatCard from "../../components/at-risk/RiskStatCard";
import RiskSection from "../../components/at-risk/RiskSection";
import StudentRiskCard from "../../components/at-risk/StudentRiskCard";
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
  const [schoolYear, setSchoolYear] = useState("2025-2026");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [highStudents, setHighStudents] = useState(EMPTY_STUDENTS);
  const [mediumStudents, setMediumStudents] = useState(EMPTY_STUDENTS);
  const [lowStudents, setLowStudents] = useState(EMPTY_STUDENTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // "See all" modal state
  const [modalRiskLevel, setModalRiskLevel] = useState(null);
  const [modalStudents, setModalStudents] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState("");

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

  const handleSeeAll = async (riskLevel) => {
    setModalRiskLevel(riskLevel);
    setModalSearchQuery("");
    setModalLoading(true);

    try {
      const termParam = activeTerm === "overall" ? undefined : activeTerm;
      const res = await getStudentsByRiskLevel({
        schoolYear,
        term: termParam,
        gradeLevel,
        riskLevel,
      });
      setModalStudents(res.students || []);
    } catch (err) {
      console.error("Failed to load all risk students for modal:", err);
    } finally {
      setModalLoading(false);
    }
  };

  const filteredModalStudents = modalStudents.filter((s) => {
    if (!modalSearchQuery.trim()) return true;
    const q = modalSearchQuery.toLowerCase();
    const nameMatch = s.name.toLowerCase().includes(q);
    const sectionMatch = (s.section || "").toLowerCase().includes(q);
    const adviserMatch = (s.adviser || "").toLowerCase().includes(q);
    return nameMatch || sectionMatch || adviserMatch;
  });

  const getRiskTitle = (level) => {
    switch (level) {
      case "high":
        return "High Risk Learners (Immediate Attention)";
      case "medium":
        return "Medium Risk Learners (Monitor Closely)";
      case "low":
        return "Low Risk Learners (Preventive Support)";
      default:
        return "At-Risk Learners";
    }
  };

  return (
    <div className="ar-page">
      {/* Header */}
      <div className="ar-header">
        <div>
          <h1 className="ar-title">At-Risk Prediction</h1>
          <p className="ar-subtitle">Early Warning System | Updated Weekly</p>
        </div>
        <div className="ar-header-actions">
          <button className="ar-icon-btn" type="button" aria-label="Toggle Dark Mode">
            <Moon size={18} />
          </button>
          <button className="ar-icon-btn" type="button" aria-label="Notifications">
            <Bell size={18} />
            <span className="ar-badge-number">7</span>
          </button>
        </div>
      </div>

      {/* Filter Row: Term Tabs on Left, Selects on Right */}
      <div className="ar-filter-row">
        <TermTabs active={activeTerm} onChange={setActiveTerm} disabled={loading} />

        <div className="ar-filter-group">
          <div className="ar-filter-control-compact">
            <select
              className="ar-filter-select-compact"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              disabled={loading}
            >
              <option value="">Grade Level</option>
              <option value="7">Grade 7</option>
              <option value="8">Grade 8</option>
              <option value="9">Grade 9</option>
              <option value="10">Grade 10</option>
            </select>
          </div>
          <div className="ar-filter-control-compact">
            <select
              className="ar-filter-select-compact"
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              disabled={loading}
            >
              <option value="2025-2026">School Year</option>
              <option value="2026-2027">SY 2026-2027</option>
              <option value="2025-2026">SY 2025-2026</option>
              <option value="2024-2025">SY 2024-2025</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="ar-error-banner">{error}</div>}

      <div className="ar-body">
        {/* 4 Stat Cards Row */}
        <div className="ar-stats-row">
          <RiskStatCard
            title="Low Risk"
            value={summary.lowRisk}
            caption="Preventive Support"
            accentColor="#16A34A"
            icon={<AlertCircle size={18} />}
            loading={loading}
          />
          <RiskStatCard
            title="Medium Risk"
            value={summary.mediumRisk}
            caption="Needs Monitoring"
            accentColor="#d97706"
            icon={<MinusCircle size={18} />}
            loading={loading}
          />
          <RiskStatCard
            title="High Risk"
            value={summary.highRisk}
            caption="Immediate Attention"
            accentColor="#dc2626"
            icon={<AlertTriangle size={18} />}
            loading={loading}
          />
          <RiskStatCard
            title="Total"
            value={summary.total}
            caption="School wide"
            accentColor="#475569"
            icon={<Users size={18} />}
            loading={loading}
          />
        </div>

        {/* Prediction Student Groups */}
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

      {/* Floating Modal for "See all" Students */}
      {modalRiskLevel &&
        createPortal(
          <div className="ar-modal-backdrop" onClick={() => setModalRiskLevel(null)}>
            <div className="ar-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="ar-modal-header">
                <div className="ar-modal-title-wrap">
                  <h2>{getRiskTitle(modalRiskLevel)}</h2>
                  <span className="ar-modal-count-badge">
                    {filteredModalStudents.length} Students
                  </span>
                </div>
                <button
                  className="ar-modal-close"
                  onClick={() => setModalRiskLevel(null)}
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="ar-modal-search">
                <Search size={16} className="ar-modal-search-icon" />
                <input
                  type="text"
                  className="ar-modal-search-input"
                  placeholder="Search by student name, section, or adviser..."
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  autoFocus
                />
                {modalSearchQuery && (
                  <button
                    className="ar-modal-clear"
                    onClick={() => setModalSearchQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="ar-modal-list">
                {modalLoading ? (
                  <div className="ar-modal-loading">Loading students...</div>
                ) : filteredModalStudents.length === 0 ? (
                  <div className="ar-modal-empty">No students found matching your filter.</div>
                ) : (
                  filteredModalStudents.map((student) => (
                    <StudentRiskCard
                      key={student.id}
                      {...student}
                      riskLevel={modalRiskLevel}
                    />
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
