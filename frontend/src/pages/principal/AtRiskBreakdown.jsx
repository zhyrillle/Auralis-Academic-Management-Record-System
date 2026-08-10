import { useState, useEffect } from "react";
import TermTabs from "../../components/at-risk/TermTabs";
import RiskStatCard from "../../components/at-risk/RiskStatCard";
import OverallDistributionChart from "../../components/at-risk/OverallDistributionChart";
import GradeLevelBreakdownChart from "../../components/at-risk/GradeLevelBreakdownChart";
import RiskLevelCard from "../../components/at-risk/RiskLevelCard";
import {
  getAtRiskSummary,
  getOverallDistribution,
  getGradeLevelBreakdown,
  getRiskLevelLearners,
} from "../../services/atRiskApi";
import "../../styles/atRiskBreakdown.css";

const EMPTY_SUMMARY = { lowRisk: 0, mediumRisk: 0, highRisk: 0, total: 0 };
const EMPTY_DISTRIBUTION = { high: { count: 0, percent: 0 }, medium: { count: 0, percent: 0 }, low: { count: 0, percent: 0 }, totalFlagged: 0 };
const EMPTY_BREAKDOWN = [];
const EMPTY_NOTES = { count: 0, notes: [] };

export default function AtRiskBreakdown() {
  const [activeTerm, setActiveTerm] = useState("overall");
  const [schoolYear, setSchoolYear] = useState("");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [distribution, setDistribution] = useState(EMPTY_DISTRIBUTION);
  const [breakdown, setBreakdown] = useState(EMPTY_BREAKDOWN);
  const [lowNotes, setLowNotes] = useState(EMPTY_NOTES);
  const [mediumNotes, setMediumNotes] = useState(EMPTY_NOTES);
  const [highNotes, setHighNotes] = useState(EMPTY_NOTES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const termParam = activeTerm === "overall" ? undefined : activeTerm;
        const [summaryData, distData, breakdownData, lowData, mediumData, highData] =
          await Promise.all([
            getAtRiskSummary({ schoolYear, term: termParam }).catch(() => EMPTY_SUMMARY),
            getOverallDistribution({ schoolYear, term: termParam }).catch(() => EMPTY_DISTRIBUTION),
            getGradeLevelBreakdown({ schoolYear, term: termParam }).catch(() => EMPTY_BREAKDOWN),
            getRiskLevelLearners({ schoolYear, term: termParam, riskLevel: "low" }).catch(() => EMPTY_NOTES),
            getRiskLevelLearners({ schoolYear, term: termParam, riskLevel: "medium" }).catch(() => EMPTY_NOTES),
            getRiskLevelLearners({ schoolYear, term: termParam, riskLevel: "high" }).catch(() => EMPTY_NOTES),
          ]);

        if (cancelled) return;

        setSummary(summaryData);
        setDistribution(distData);
        setBreakdown(breakdownData);
        setLowNotes(lowData);
        setMediumNotes(mediumData);
        setHighNotes(highData);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load at-risk data");
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
  }, [activeTerm, schoolYear]);

  const handleTermChange = (term) => {
    setActiveTerm(term);
  };

  const handleSchoolYearChange = (e) => {
    setSchoolYear(e.target.value);
  };

  return (
    <div className="ar-page">
      <div className="ar-header">
        <div>
          <h1 className="ar-title">At-Risk Breakdown</h1>
          <p className="ar-subtitle">Distribution of flagged learners by risk</p>
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

        <div className="ar-charts-row">
          <OverallDistributionChart data={distribution} loading={loading} />
          <GradeLevelBreakdownChart data={breakdown} loading={loading} />
        </div>

        <div className="ar-risk-cards-row">
          <RiskLevelCard
            riskLevel="low"
            label="Low Risk"
            count={lowNotes.count}
            notes={lowNotes.notes}
            loading={loading}
          />
          <RiskLevelCard
            riskLevel="medium"
            label="Medium Risk"
            count={mediumNotes.count}
            notes={mediumNotes.notes}
            loading={loading}
          />
          <RiskLevelCard
            riskLevel="high"
            label="High Risk"
            count={highNotes.count}
            notes={highNotes.notes}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
