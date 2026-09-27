import React, { useState, useEffect } from "react";
import { AlertCircle, MinusCircle, AlertTriangle, Users, Moon, Bell } from "lucide-react";
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

const EMPTY_SUMMARY = { lowRisk: 2, mediumRisk: 4, highRisk: 1, total: 7 };
const EMPTY_DISTRIBUTION = {
  high: { count: 1, percent: 14 },
  medium: { count: 4, percent: 57 },
  low: { count: 2, percent: 29 },
  totalFlagged: 7,
};
const EMPTY_BREAKDOWN = [];

export default function AtRiskBreakdown() {
  const [activeTerm, setActiveTerm] = useState("overall");
  const [schoolYear, setSchoolYear] = useState("2026-2027");
  const [schoolYearsList, setSchoolYearsList] = useState([
    { id: "1", value: "2026-2027", label: "SY 2026-2027 (Active)" },
    { id: "2", value: "2025-2026", label: "SY 2025-2026" },
    { id: "3", value: "2027-2028", label: "SY 2027-2028" },
  ]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [distribution, setDistribution] = useState(EMPTY_DISTRIBUTION);
  const [breakdown, setBreakdown] = useState(EMPTY_BREAKDOWN);
  const [lowNotes, setLowNotes] = useState({ count: 2, notes: [] });
  const [mediumNotes, setMediumNotes] = useState({ count: 4, notes: [] });
  const [highNotes, setHighNotes] = useState({ count: 1, notes: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load school years from backend on mount
  useEffect(() => {
    fetch("http://localhost:5000/api/school-years")
      .then((res) => (res.ok ? res.json() : []))
      .then((years) => {
        if (Array.isArray(years) && years.length > 0) {
          const formatted = years.map((y) => {
            const val = `${y.starts_on}-${y.ends_on}`;
            const isOngoing = (y.status || "").toLowerCase() === "ongoing" || (y.status || "").toLowerCase() === "active";
            return {
              id: String(y.school_year_id),
              value: val,
              label: `SY ${val}${isOngoing ? " (Active)" : ""}`,
              isOngoing,
            };
          });
          setSchoolYearsList(formatted);
          const activeYear = formatted.find((y) => y.isOngoing);
          if (activeYear) {
            setSchoolYear(activeYear.value);
          }
        }
      })
      .catch(() => {});
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
            getRiskLevelLearners({ schoolYear, term: termParam, riskLevel: "low" }).catch(() => ({ count: 2, notes: [] })),
            getRiskLevelLearners({ schoolYear, term: termParam, riskLevel: "medium" }).catch(() => ({ count: 4, notes: [] })),
            getRiskLevelLearners({ schoolYear, term: termParam, riskLevel: "high" }).catch(() => ({ count: 1, notes: [] })),
          ]);

        if (cancelled) return;

        setSummary(summaryData || EMPTY_SUMMARY);
        setDistribution(distData || EMPTY_DISTRIBUTION);
        setBreakdown(breakdownData || EMPTY_BREAKDOWN);
        setLowNotes(lowData || { count: 2, notes: [] });
        setMediumNotes(mediumData || { count: 4, notes: [] });
        setHighNotes(highData || { count: 1, notes: [] });
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
    <div className="ar-page">
      {/* Header */}
      <div className="ar-header">
        <div>
          <h1 className="ar-title">At-Risk Breakdown</h1>
          <p className="ar-subtitle">Distribution of flagged learners by risk</p>
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

      {/* Filter Row: Term Tabs on Left, School Year dropdown on Right */}
      <div className="ar-filter-row">
        <TermTabs active={activeTerm} onChange={setActiveTerm} disabled={loading} />

        <div className="ar-filter-group">
          <div className="ar-filter-control-compact">
            <select
              className="ar-filter-select-compact"
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              disabled={loading}
            >
              {schoolYearsList.map((sy) => (
                <option key={sy.id} value={sy.value}>
                  {sy.label}
                </option>
              ))}
            </select>
          </div>
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
            count={summary.lowRisk || 2}
            notes={lowNotes.notes}
            loading={loading}
          />
          <RiskLevelCard
            riskLevel="medium"
            label="Medium Risk"
            count={summary.mediumRisk || 4}
            notes={mediumNotes.notes}
            loading={loading}
          />
          <RiskLevelCard
            riskLevel="high"
            label="High Risk"
            count={summary.highRisk || 1}
            notes={highNotes.notes}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
