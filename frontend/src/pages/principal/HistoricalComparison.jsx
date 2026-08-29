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
import AverageLineChart from "./analytics/AverageLineChart";
import HistoricalComparisonTable from "./analytics/HistoricalComparisonTable";
import SubjectBarChart from "./analytics/SubjectBarChart";
import "../../styles/principalAnalytics.css";

const round = (value) => Math.round(value * 10) / 10;
const average = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const termIndex = (term) => Number(term.split("-")[1]) - 1;

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
    if (!data?.subjects.length) return [];
    const selectedTermIndex =
      data.term === "overall" ? null : termIndex(data.term);
    return data.subjects.map((subject) => {
      const primaryAverage = round(
        selectedTermIndex === null
          ? average(subject.primaryTermAverages)
          : subject.primaryTermAverages[selectedTermIndex],
      );
      const comparisonAverage = round(
        selectedTermIndex === null
          ? average(subject.comparisonTermAverages)
          : subject.comparisonTermAverages[selectedTermIndex],
      );
      const passRate = round(
        selectedTermIndex === null
          ? average(subject.primaryTermPassRates)
          : subject.primaryTermPassRates[selectedTermIndex],
      );
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
    const passRate = round(average(rows.map((row) => row.passRate)));
    const currentAverage = round(
      average(rows.map((row) => row.primaryAverage)),
    );
    return [
      {
        label: "Total Students",
        value: data.totalStudents.toLocaleString(),
        description:
          data.term === "overall"
            ? "Across all three terms"
            : `Included in Term ${termIndex(data.term) + 1}`,
        icon: Users,
        tone: "navy",
      },
      {
        label: "Pass Rate",
        value: `${passRate}%`,
        description: "Grade 75 or higher",
        icon: TrendingUp,
        tone: "green",
      },
      {
        label: "Fail Rate",
        value: `${round(100 - passRate)}%`,
        description: "Below the passing grade",
        icon: TrendingDown,
        tone: "red",
      },
      {
        label: "Average Grade",
        value: currentAverage,
        description: data.primarySchoolYear.label,
        icon: ChartNoAxesCombined,
        tone: "gold",
      },
    ];
  }, [data, rows]);

  if (requestMode === "initial" && !data) return <AnalyticsSkeleton table />;

  if (!data && error) {
    return (
      <main className="pa-page">
        <section className="pa-state-panel">
          <EmptyState
            className="pa-empty-state"
            icon={AlertTriangle}
            title="Historical analytics are unavailable"
            description={error}
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

  const allYears = data.availableSchoolYears;
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

  return (
    <main className="pa-page">
      <header className="pa-page-header">
        <div>
          <div className="pa-title-row">
            <h1>Historical Comparison</h1>
            {import.meta.env.DEV && (
              <span className="pa-preview-badge">Preview data</span>
            )}
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
                    {displayedTerm === "overall"
                      ? "School-wide Average Grade Trend"
                      : `Term ${selectedTermIndex + 1} Subject Comparison`}
                  </h2>
                  <p>
                    {displayedTerm === "overall"
                      ? "Compare average-grade movement across all three terms."
                      : "Compare subject results for the selected term."}
                  </p>
                </div>
                <div
                  className="pa-series-key"
                  aria-label="Compared school years"
                >
                  <span>
                    <i style={{ "--series-color": "#17376d" }} />
                    {data.primarySchoolYear.label}
                  </span>
                  <span>
                    <i style={{ "--series-color": "#d4a017" }} />
                    {data.comparisonSchoolYear.label}
                  </span>
                </div>
              </div>
              {displayedTerm === "overall" ? (
                <AverageLineChart
                  ariaLabel={`Average grade comparison for ${data.primarySchoolYear.label} and ${data.comparisonSchoolYear.label}`}
                  series={[
                    {
                      id: "primary",
                      label: data.primarySchoolYear.label,
                      color: "#17376d",
                      values: data.primaryTrend.map((value) => ({
                        value,
                        learnerCount: data.totalStudents,
                      })),
                    },
                    {
                      id: "comparison",
                      label: data.comparisonSchoolYear.label,
                      color: "#d4a017",
                      values: data.comparisonTrend.map((value) => ({
                        value,
                        learnerCount: data.totalStudents,
                      })),
                    },
                  ]}
                />
              ) : (
                <SubjectBarChart
                  ariaLabel={`Term ${selectedTermIndex + 1} subject comparison between selected school years`}
                  groups={rows.map((row) => ({
                    id: row.id,
                    label: row.label,
                    shortLabel: row.code,
                    values: [
                      {
                        id: `${row.id}-primary`,
                        label: data.primarySchoolYear.label,
                        value: row.primaryAverage,
                        learnerCount: row.learnerCount,
                        color: "#17376d",
                      },
                      {
                        id: `${row.id}-comparison`,
                        label: data.comparisonSchoolYear.label,
                        value: row.comparisonAverage,
                        learnerCount: row.learnerCount,
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
                primaryLabel={data.primarySchoolYear.label}
                comparisonLabel={data.comparisonSchoolYear.label}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
