import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, LayoutGrid, MessageSquareOff, RefreshCw, Target, Users } from "lucide-react";
import { getPrincipalFeedback } from "../../services/principalFeedbackService";
import { usePrincipalQuery } from "../../services/principalData";
import DropdownSelect from "../../components/common/DropdownSelect";
import EmptyState from "../../components/common/EmptyState";
import FilterToolbar from "../../components/common/FilterToolbar";
import SearchBar from "../../components/common/SearchBar";
import ProgressBar from "../../components/charts/ProgressBar";
import AnalyticsSkeleton from "./analytics/AnalyticsSkeleton";
import AnalyticsStatCard from "./analytics/AnalyticsStatCard";
import PerformanceProgressTable from "./performance-level/PerformanceProgressTable";
import "../../styles/principalAnalytics.css";
import "../../styles/principalPerformance.css";
import "./TeacherFeedback.css";

const categories = [
  { value: "All", label: "All categories" },
  { value: "Strengths & Contributions", label: "Strengths & Contributions" },
  { value: "Areas for Improvement", label: "Areas for Improvement" },
];
const categoryKind = value => {
  const text = String(value || "").toLowerCase();
  return /strength|praise/.test(text) ? "strengths" : /improvement|suggestion|area/.test(text) ? "improvements" : "general";
};

export default function TeacherFeedback() {
  const [requestedYear, setSchoolYear] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const { data, loading, isPreviousData, error, refresh, schoolYear, schoolYears } = usePrincipalQuery(
    "principal:feedback", { schoolYear: requestedYear }, getPrincipalFeedback,
  );
  const filteredComments = useMemo(() => (data?.comments || []).filter(comment => {
    const categoryMatches = selectedCategory === "All" || categoryKind(comment.category) === categoryKind(selectedCategory);
    const query = searchQuery.trim().toLowerCase();
    return categoryMatches && (!query || comment.text.toLowerCase().includes(query) || comment.category.toLowerCase().includes(query));
  }), [data, selectedCategory, searchQuery]);

  if (loading && !data) return <AnalyticsSkeleton table />;
  if (!data) return <main className="pa-page tf-page">
    <section className="pa-state-panel" role="alert">
      <EmptyState icon={AlertTriangle} title="Unable to load feedback" description={error || "Feedback records are unavailable."} />
      <button type="button" className="pa-retry-button" onClick={refresh}><RefreshCw size={16} />Retry</button>
    </section>
  </main>;

  const { summary, likertResults } = data;
  const rated = summary.totalResponses > 0 && Number(summary.overallRating) > 0;
  const cards = [
    { label: "Total Responses", value: summary.totalResponses, description: `SY ${schoolYear}`, icon: Users, tone: "navy" },
    { label: "Overall Rating", value: rated ? Math.round(Number(summary.overallRating)) : "Not rated", description: rated ? `Out of 5${summary.ratingDiff != null ? ` · ${summary.ratingDiff} vs reference` : ""}` : "No recorded ratings", icon: LayoutGrid, tone: "gold" },
    { label: "Comments Received", value: summary.totalComments, description: "Anonymous teacher comments", icon: CheckCircle2, tone: "green" },
    { label: "Below Target", value: summary.belowTargetCount, description: "Rated questions under 3.0", icon: Target, tone: "red" },
  ];
  const columns = [
    { key: "number", label: "No.", render: row => likertResults.indexOf(row) + 1 },
    { key: "description", label: "Description" },
    { key: "rate", label: "Rate", render: row => Number(row.rate) > 0
      ? <div className="tf-rating"><ProgressBar value={Number(row.rate)} maximum={5} tone={Number(row.rate) >= 4 ? "blue" : "gold"} ariaLabel={`${row.description}: ${row.rate} of 5`} /><span>{row.rate}</span></div>
      : <span className="tf-not-rated">Not rated</span> },
  ];
  return <main className="pa-page tf-page">
    <header className="pa-page-header"><div><h1>Teacher Feedback</h1><p>Anonymous teacher evaluation of principal leadership</p></div></header>
    <FilterToolbar className="pa-navigation" label="Feedback filters" end={
      <DropdownSelect label="School year" value={schoolYear} options={schoolYears} onChange={setSchoolYear} disabled={isPreviousData} />
    }><span className="tf-filter-caption">Leadership evaluation</span></FilterToolbar>
    {error && <div className="pa-inline-error" role="alert"><span>Unable to load updates. {error}</span><button type="button" onClick={refresh}>Retry</button></div>}
    <div className={`pa-content${isPreviousData ? " is-busy" : ""}`} aria-busy={isPreviousData}>
      {isPreviousData && <div className="pa-busy-overlay" role="status" aria-label="Updating feedback"><span className="pa-spinner pa-spinner--large" /></div>}
      <section className="pa-stat-grid" aria-label="Feedback overview">{cards.map(card => <AnalyticsStatCard key={card.label} {...card} />)}</section>
      {Number(summary.totalResponses) === 0 ? <section className="pa-panel tf-empty" aria-label="No feedback"><EmptyState className="tf-empty-state" icon={MessageSquareOff} title="No teacher feedback for this school year" description="Ratings and comments will appear here once teachers submit their evaluations. You can select another school year to view earlier feedback." /></section> : <>
      <PerformanceProgressTable title="Likert Scale Result - Leadership Evaluation" subtitle="Recorded question ratings on a five-point scale." columns={columns} data={likertResults} emptyMessage="No survey questions are configured." />
      <section className="pa-panel">
        <div className="pa-panel__header"><div><h2>Comment Explorer</h2><p>Anonymous open-ended responses from teachers</p></div>
          <div className="tf-comment-controls">
            <DropdownSelect label="Comment category" value={selectedCategory} options={categories} onChange={setSelectedCategory} />
            <SearchBar query={searchQuery} setQuery={setSearchQuery} placeholder="Search comments" />
          </div>
        </div>
        <div className="tf-comment-list">
          {filteredComments.length ? filteredComments.map((comment, index) => <article key={comment.id || index} className="tf-comment">
            <header><span className={`tf-tag tf-tag--${categoryKind(comment.category)}`}>{comment.category || "Comment"}</span>
              {comment.created_at && <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>}
            </header><p>{comment.text}</p>
          </article>) : <EmptyState className="tf-empty-state" icon={MessageSquareOff} title={data.comments.length ? "No matching comments" : "No comments submitted"} description={data.comments.length ? "No saved comments match the selected filters." : "Teacher evaluations for this school year do not include any comments."} />}
        </div>
      </section>
      </>}
    </div>
  </main>;
}

