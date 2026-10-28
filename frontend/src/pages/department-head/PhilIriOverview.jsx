import GroupedBarChart from "../../components/charts/GroupedBarChart";
import EmptyState from "../../components/common/EmptyState";

export default function PhilIriOverview({ sections, available }) {
  const counts = new Map(sections.map(section => {
    const passed = Number(section.screeningPassed) || 0;
    const failed = Number(section.screeningFailed) || 0;
    return [Number(section.sectionId), { passed, failed, excluded: Math.max(0, section.learnerCount - passed - failed) }];
  }));
  const totals = [...counts.values()].reduce((sum, count) => ({ passed: sum.passed + count.passed, failed: sum.failed + count.failed, excluded: sum.excluded + count.excluded }), { passed: 0, failed: 0, excluded: 0 });
  const groups = sections.map(section => {
    const count = counts.get(Number(section.sectionId));
    return { id: section.sectionId, label: section.sectionName, values: [
      { id: `${section.sectionId}-passed`, label: "Passed", value: count.passed, color: "#168449" },
      { id: `${section.sectionId}-failed`, label: "Failed", value: count.failed, color: "#dc5252" },
    ] };
  });
  return <section className="dept-phil-overview" aria-label="PHIL-IRI screening overview">
    <header><div><h2>Screening Results by Section</h2><p>Passed means the learner met the saved screening score threshold. Results follow the school year, grade level, and section search above.</p></div></header>
    {available === false ? <EmptyState className="dept-monitor-state" title="Screening results unavailable" description="Screening records are not available for this school year." /> : <>
      <div className="dept-phil-overview__totals" aria-label="Screening totals">
        <span><i className="dept-phil-overview__passed" />Passed <strong>{totals.passed}</strong></span>
        <span><i className="dept-phil-overview__failed" />Failed <strong>{totals.failed}</strong></span>
        <span>Not classified <strong>{totals.excluded}</strong></span>
      </div>
      <GroupedBarChart groups={groups} minimum={0} maximum={Math.max(1, ...[...counts.values()].flatMap(count => [count.passed, count.failed]))} ticks={[]} benchmark={null} ariaLabel="Passed and failed screening learner counts by section" />
      <p className="dept-phil-overview__note">{totals.passed + totals.failed === 0 ? "No complete screening results with a valid threshold yet. " : ""}Incomplete, unassessed, and missing-threshold records are not classified as passed or failed.</p>
    </>}
  </section>;
}
