import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChartNoAxesCombined,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import EmptyState from "../../components/common/EmptyState";
import {
  getHistoricalComparison,
  principalAnalyticsTerms,
} from "../../services/principalAnalyticsService";
import AnalyticsSkeleton from "./analytics/AnalyticsSkeleton";
import AnalyticsStatCard from "./analytics/AnalyticsStatCard";
import AnalyticsTermTabs from "./analytics/AnalyticsTermTabs";
import LineChart from "../../components/charts/LineChart";
import HistoricalComparisonTable from "./analytics/HistoricalComparisonTable";
import GroupedBarChart from "../../components/charts/GroupedBarChart";
import "../../styles/principalAnalytics.css";

const round = (value) => Math.round(Number(value || 0) * 10) / 10;
const average = (values) =>
  Array.isArray(values) && values.length
    ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length
    : 0;
const termIndex = (term) => {
  const num = Number(String(term || "").split("-")[1]);
  return isNaN(num) ? 0 : num - 1;
};

const getStatus = (currentAverage, difference) => {
  if (currentAverage < 75 || difference <= -3) return "Needs attention";
  if (currentAverage < 80 || (difference < -1 && difference > -3))
    return "Monitor";
  return "On track";
};

export default function HistoricalComparison() {
  const [primarySchoolYear, setPrimarySchoolYear] = useState("2026-2027");
  const [comparisonSchoolYear, setComparisonSchoolYear] = useState("2025-2026");
  const [term, setTerm] = useState("overall");
  const [data, setData] = useState(null);
  const [requestMode, setRequestMode] = useState("initial");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;

    getHistoricalComparison({ primarySchoolYear, comparisonSchoolYear, term })
      .then((nextData) => {
        if (currentRequest === requestId.current) setData(nextData);
      })
      .catch((requestError) => {
        if (currentRequest === requestId.current)
          setError(
            requestError.message || "Unable to load historical analytics.",
          );
      })
      .finally(() => {
        if (currentRequest === requestId.current) setRequestMode("idle");
      });
    return () => { requestId.current += 1; };
  }, [primarySchoolYear, comparisonSchoolYear, term, retryKey]);

  const changeFilter = (setter) => (nextValue) => {
    setRequestMode("filtering");
    setError("");
    setter(nextValue);
  };

  const handleRetry = () => {
    setRequestMode(data ? "filtering" : "initial");
    setError("");
    setRetryKey((key) => key + 1);
  };

  const rows = useMemo(() => {
    if (!data?.subjects?.length) return [];
    const selectedTermIndex =
      data.term === "overall" ? null : termIndex(data.term);
    return data.subjects.map((subject) => {
      const primaryAverages = subject.primaryTermAverages;
      const comparisonAverages = subject.comparisonTermAverages;
      const primaryPassRates = subject.primaryTermPassRates;

      const primaryAverage = round(
        !Array.isArray(primaryAverages) ? subject.primaryAverage : selectedTermIndex === null
          ? average(primaryAverages)
          : primaryAverages[selectedTermIndex] || 0,
      );
      const comparisonAverage = round(
        !Array.isArray(comparisonAverages) ? subject.comparisonAverage : selectedTermIndex === null
          ? average(comparisonAverages)
          : comparisonAverages[selectedTermIndex] || 0,
      );
      const passRate = Array.isArray(primaryPassRates) ? round(
        selectedTermIndex === null
          ? average(primaryPassRates)
          : primaryPassRates[selectedTermIndex] || 0,
      ) : subject.passRate == null ? null : round(subject.passRate);
      const difference = round(primaryAverage - comparisonAverage);
      return {
        ...subject,
        primaryAverage,
        comparisonAverage,
        difference,
        passRate,
        status: getStatus(primaryAverage, difference),
      };
    });
  }, [data]);

  const statistics = useMemo(() => {
    if (!rows.length || !data) return [];
    const passRates = rows.map((row) => row.passRate).filter((value) => value !== null);
    const passRate = passRates.length ? round(average(passRates)) : null;
    const currentAverage = round(
      average(rows.map((row) => row.primaryAverage)),
    );
    return [
      {
        label: "Total Students",
        value: data.totalStudents == null ? "—" : Number(data.totalStudents).toLocaleString(),
        description:
          data.totalStudents == null ? "Student count is unavailable"
          : data.term === "overall"
            ? "Across all three terms"
            : `Included in Term ${termIndex(data.term) + 1}`,
        icon: Users,
        tone: "navy",
      },
      {
        label: "Pass Rate",
        value: passRate === null ? "—" : `${passRate}%`,
        description: passRate === null ? "Pass-rate data is unavailable" : "Grade 75 or higher",
        icon: TrendingUp,
        tone: "green",
      },
      {
        label: "Fail Rate",
        value: passRate === null ? "—" : `${round(100 - passRate)}%`,
        description: passRate === null ? "Fail-rate data is unavailable" : "Below the passing grade",
        icon: TrendingDown,
        tone: "red",
      },
      {
        label: "Average Grade",
        value: currentAverage,
        description: data.primarySchoolYear?.label || "Primary SY",
        icon: ChartNoAxesCombined,
        tone: "gold",
      },
    ];
  }, [data, rows]);

  if (requestMode === "initial" && !data) return <AnalyticsSkeleton table />;

  if (!data) {
    return (
      <main className="pa-page">
        <section className="pa-state-panel">
          <EmptyState
            className="pa-empty-state"
            icon={AlertTriangle}
            title="Historical analytics are unavailable"
            description={error || "No historical comparison response is available."}
          />
          <button
            className="pa-retry-button"
            type="button"
            onClick={handleRetry}
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </section>
      </main>
    );
  }

  const allYears = Array.isArray(data.availableSchoolYears)
    ? data.availableSchoolYears
    : [];
  const primaryOptions = allYears
    .filter((year) => year.value !== comparisonSchoolYear)
    .map((year) => ({ value: year.value, label: year.label }));
  const comparisonOptions = allYears
    .filter((year) => year.value !== primarySchoolYear)
    .map((year) => ({ value: year.value, label: year.label }));
  const isFiltering = requestMode === "filtering";
  const displayedTerm = data.term;
  const selectedTermIndex =
    displayedTerm === "overall" ? null : termIndex(displayedTerm);
  const primaryLabel = data.primarySchoolYear?.label || primarySchoolYear;
  const comparisonLabel = data.comparisonSchoolYear?.label || comparisonSchoolYear;
  const primaryTrend = data.primaryTrend;
  const comparisonTrend = data.comparisonTrend;
  const hasTrends = [data.primaryTrend, data.comparisonTrend].every((values) =>
    Array.isArray(values) && values.length === 3 && values.every((value) => value != null && Number.isFinite(Number(value))),
  );

  return (
    <main className="pa-page">
      <header className="pa-page-header">
        <div>
          <div className="pa-title-row">
            <h1>Historical Comparison</h1>
          </div>
          <p>Compare average grades and pass rates across two school years.</p>
        </div>
      </header>

      <section
        className="pa-filter-bar"
        aria-label="Historical comparison filters"
      >
        <AnalyticsTermTabs
          options={principalAnalyticsTerms}
          value={term}
          onChange={changeFilter(setTerm)}
          disabled={isFiltering}
        />
        <div className="pa-filter-controls pa-filter-controls--comparison">
          <label>
            <DropdownSelect
              label="Primary school year"
              value={primarySchoolYear}
              options={primaryOptions}
              onChange={changeFilter(setPrimarySchoolYear)}
              disabled={isFiltering}
            />
          </label>
          <span className="pa-versus" aria-hidden="true">
            vs
          </span>
          <label>
            <DropdownSelect
              label="Comparison school year"
              value={comparisonSchoolYear}
              options={comparisonOptions}
              onChange={changeFilter(setComparisonSchoolYear)}
              disabled={isFiltering}
            />
          </label>
        </div>
      </section>

      {error && data && (
        <div className="pa-inline-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      <div
        className={`pa-content${isFiltering ? " is-busy" : ""}`}
        aria-busy={isFiltering}
      >
        {isFiltering && (
          <div
            className="pa-busy-overlay"
            role="status"
            aria-label="Updating comparison"
          >
            <span className="pa-spinner pa-spinner--large" />
          </div>
        )}
        {!rows.length ? (
          <section className="pa-state-panel">
            <EmptyState
              className="pa-empty-state"
              icon={ChartNoAxesCombined}
              title="No comparison data found"
              description="Choose another pair of school years."
            />
          </section>
        ) : (
          <>
            <section
              className="pa-stat-grid"
              aria-label="Historical comparison summary"
            >
              {statistics.map((statistic) => (
                <AnalyticsStatCard key={statistic.label} {...statistic} />
              ))}
            </section>

            <section className="pa-panel">
              <div className="pa-panel__header">
                <div>
                  <h2>
                    {displayedTerm === "overall" && hasTrends
                      ? "School-wide Average Grade Trend"
                      : displayedTerm === "overall" ? "Subject Comparison"
                      : `Term ${selectedTermIndex + 1} Subject Comparison`}
                  </h2>
                  <p>
                    {displayedTerm === "overall" && hasTrends
                      ? "Compare average-grade movement across all three terms."
                      : "Compare subject results for the selected school years and period."}
                  </p>
                </div>
                <div
                  className="pa-series-key"
                  aria-label="Compared school years"
                >
                  <span>
                    <i style={{ "--series-color": "#17376d" }} />
                    {primaryLabel}
                  </span>
                  <span>
                    <i style={{ "--series-color": "#d4a017" }} />
                    {comparisonLabel}
                  </span>
                </div>
              </div>
              {displayedTerm === "overall" && hasTrends ? (
                <LineChart
                  ariaLabel={`Average grade comparison for ${primaryLabel} and ${comparisonLabel}`}
                  labels={["Term 1", "Term 2", "Term 3"]}
                  series={[
                    {
                      id: "primary",
                      label: primaryLabel,
                      color: "#17376d",
                      values: primaryTrend.map((value) => ({
                        value,
                        detail: data.totalStudents == null ? undefined : `${data.totalStudents} learners`,
                      })),
                    },
                    {
                      id: "comparison",
                      label: comparisonLabel,
                      color: "#d4a017",
                      values: comparisonTrend.map((value) => ({
                        value,
                        detail: data.totalStudents == null ? undefined : `${data.totalStudents} learners`,
                      })),
                    },
                  ]}
                />
              ) : (
                <GroupedBarChart
                  ariaLabel={`Subject comparison between selected school years (${displayedTerm === "overall" ? "overall" : `Term ${selectedTermIndex + 1}`})`}
                  groups={rows.map((row) => ({
                    id: row.id,
                    label: row.label,
                    shortLabel: row.code,
                    values: [
                      {
                        id: `${row.id}-primary`,
                        label: primaryLabel,
                        value: row.primaryAverage,
                        detail: row.learnerCount == null ? undefined : `${row.learnerCount} learners`,
                        color: "#17376d",
                      },
                      {
                        id: `${row.id}-comparison`,
                        label: comparisonLabel,
                        value: row.comparisonAverage,
                        detail: row.learnerCount == null ? undefined : `${row.learnerCount} learners`,
                        color: "#d4a017",
                      },
                    ],
                  }))}
                />
              )}
            </section>

            <section className="pa-panel pa-panel--table">
              <div className="pa-panel__header">
                <div>
                  <h2>Subject-level Breakdown</h2>
                  <p>
                    {displayedTerm === "overall"
                      ? "Three-term averages"
                      : `Term ${selectedTermIndex + 1} results`}{" "}
                    for the selected school years.
                  </p>
                </div>
              </div>
              <HistoricalComparisonTable
                rows={rows}
                primaryLabel={primaryLabel}
                comparisonLabel={comparisonLabel}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
