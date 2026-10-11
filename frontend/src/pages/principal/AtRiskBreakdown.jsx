import React, { useState, useEffect } from "react";
import { AlertCircle, MinusCircle, AlertTriangle, Users } from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
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
import { getAtRiskOptions } from "../../services/atRiskPredictionApi";
import "../../styles/atRiskBreakdown.css";

const EMPTY_SUMMARY = { lowRisk: 0, mediumRisk: 0, highRisk: 0, total: 0 };
const EMPTY_DISTRIBUTION = {
  high: { count: 0, percent: 0 },
  medium: { count: 0, percent: 0 },
  low: { count: 0, percent: 0 },
  totalFlagged: 0,
};
const EMPTY_BREAKDOWN = [];

export default function AtRiskBreakdown() {
  const [activeTerm, setActiveTerm] = useState("overall");
  const [schoolYear, setSchoolYear] = useState("2026-2027");
  const [schoolYearsList, setSchoolYearsList] = useState([
    { value: "2026-2027", label: "SY 2026–2027" },
    { value: "2025-2026", label: "SY 2025–2026" },
  ]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [distribution, setDistribution] = useState(EMPTY_DISTRIBUTION);
  const [breakdown, setBreakdown] = useState(EMPTY_BREAKDOWN);
  const [lowNotes, setLowNotes] = useState({ count: 0, notes: [], students: [] });
  const [mediumNotes, setMediumNotes] = useState({ count: 0, notes: [], students: [] });
  const [highNotes, setHighNotes] = useState({ count: 0, notes: [], students: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load dynamic options on mount
  useEffect(() => {
    getAtRiskOptions()
      .then((opts) => {
        if (opts.schoolYears && opts.schoolYears.length > 0) {
          setSchoolYearsList(opts.schoolYears);
          setSchoolYear(opts.schoolYears[0].value);
        }
      })
      .catch((err) => console.warn("Failed to load options for breakdown:", err));
  }, []);

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
            getRiskLevelLearners({ schoolYear, term: termParam, riskLevel: "low" }).catch(() => ({ count: 0, notes: [], students: [] })),
            getRiskLevelLearners({ schoolYear, term: termParam, riskLevel: "medium" }).catch(() => ({ count: 0, notes: [], students: [] })),
            getRiskLevelLearners({ schoolYear, term: termParam, riskLevel: "high" }).catch(() => ({ count: 0, notes: [], students: [] })),
          ]);

        if (cancelled) return;

        setSummary(summaryData || EMPTY_SUMMARY);
        setDistribution(distData || EMPTY_DISTRIBUTION);
        setBreakdown(breakdownData || EMPTY_BREAKDOWN);
        setLowNotes(lowData || { count: 0, notes: [] });
        setMediumNotes(mediumData || { count: 0, notes: [] });
        setHighNotes(highData || { count: 0, notes: [] });
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

  return (
    <div className="ar-page ar-breakdown-page">
      {/* Header */}
      <div className="ar-header">
        <div>
          <h1 className="ar-title">At-Risk Breakdown</h1>
          <p className="ar-subtitle">Distribution of flagged learners by risk</p>
        </div>
      </div>

      {/* Filter Row: Term Tabs on Left, Dropdown on Right */}
      <div className="ar-filter-row">
        <TermTabs active={activeTerm} onChange={setActiveTerm} disabled={loading} />

        <div className="ar-filter-group">
          <DropdownSelect
            label="School Year"
            value={schoolYear}
            options={schoolYearsList}
            onChange={setSchoolYear}
            disabled={loading}
          />
        </div>
      </div>

      {error && <div className="ar-error-banner">{error}</div>}

      <div className="ar-body">
        {/* Top 4 KPI Cards */}
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

        {/* Middle Charts: Overall Distribution Donut + Grade Level Grouped Bar Chart */}
        <div className="ar-charts-row">
          <OverallDistributionChart data={distribution} loading={loading} />
          <GradeLevelBreakdownChart data={breakdown} loading={loading} />
        </div>

        {/* Bottom 3 Risk Level Cards */}
        <div className="ar-bottom-risk-grid">
          <RiskLevelCard
            riskLevel="low"
            label="Low Risk"
            count={summary.lowRisk}
            students={lowNotes.students}
            notes={lowNotes.notes}
            loading={loading}
          />
          <RiskLevelCard
            riskLevel="medium"
            label="Medium Risk"
            count={summary.mediumRisk}
            students={mediumNotes.students}
            notes={mediumNotes.notes}
            loading={loading}
          />
          <RiskLevelCard
            riskLevel="high"
            label="High Risk"
            count={summary.highRisk}
            students={highNotes.students}
            notes={highNotes.notes}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
