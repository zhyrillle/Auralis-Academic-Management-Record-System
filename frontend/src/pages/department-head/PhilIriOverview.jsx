import GroupedBarChart from "../../components/charts/GroupedBarChart";
import EmptyState from "../../components/common/EmptyState";

const PRE_CATEGORIES = [
  { key: "screeningPassed", label: "Passed", color: "#168449" },
  { key: "screeningFailed", label: "Failed", color: "#dc5252" },
];
const POST_CATEGORIES = [
  { key: "postTestIndependent", label: "Independent", color: "#168449" },
  { key: "postTestInstructional", label: "Instructional", color: "#eab308" },
  { key: "postTestFrustration", label: "Frustration", color: "#dc5252" },
];
export default function PhilIriOverview({ sections, available, testPhase }) {
  const pre = testPhase === "pre";
  const label = pre ? "Pre-test (Screening)" : "Post-test";
  const categories = pre ? PRE_CATEGORIES : POST_CATEGORIES;
  const groups = sections.map(section => ({
    id: section.sectionId, label: section.sectionName,
    values: categories.map(category => ({ id: `${section.sectionId}-${category.key}`,
      label: category.label, value: Number(section[category.key]) || 0, color: category.color })),
  }));
  const totals = categories.map((category, index) => ({ ...category,
    value: groups.reduce((sum, group) => sum + group.values[index].value, 0),
  }));
  const classified = totals.reduce((sum, category) => sum + category.value, 0);
  const excluded = Math.max(0, sections.reduce((sum, section) => sum + Number(section.learnerCount || 0), 0) - classified);
  return <section className="dept-phil-overview" aria-label={`PHIL-IRI ${label} overview`}>
    <header><div><h2>{label} Results by Section</h2><p>{pre
      ? "Passed: total score at or above the saved database threshold. Failed: total score below that threshold."
      : "Reading levels use each learner’s saved overall post-test classification."} Results follow the school year, grade level, and section search above.</p></div></header>
    {available === false ? <EmptyState className="dept-monitor-state" title={`${label} results unavailable`} description="Records are not available for this school year." /> : <>
      <div className="dept-phil-overview__totals" aria-label={`${label} totals`}>
        {totals.map(category => <span key={category.key}><i style={{ background: category.color }} />{category.label} <strong>{category.value}</strong></span>)}
      </div>
      <GroupedBarChart groups={groups} minimum={0} maximum={Math.max(1, ...groups.flatMap(group => group.values.map(bar => bar.value)))} ticks={[]} benchmark={null} ariaLabel={`${label} learner counts by section`} />
      <p className="dept-phil-overview__note">{classified === 0 ? "No complete results available for this test phase yet. " : ""}{excluded} learners not classified. {pre ? "Incomplete, unassessed, and missing-threshold records are excluded." : "Incomplete, unassessed, and unrecognized reading levels are excluded."}</p>
    </>}
  </section>;
}
