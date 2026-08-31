import DropdownSelect from "../../../components/common/DropdownSelect";
import AnalyticsTermTabs from "../analytics/AnalyticsTermTabs";

export default function PerformanceFilters({ terms, term, onTermChange, schoolYears, schoolYear, onSchoolYearChange, disabled, children }) {
  return (
    <section className="pa-filter-bar pp-filter-bar" aria-label="Performance filters">
      <AnalyticsTermTabs options={terms} value={term} onChange={onTermChange} disabled={disabled} />
      <div className="pa-filter-controls pp-filter-controls">
        {children}
        <label>
          <DropdownSelect label="School year" value={schoolYear} options={schoolYears} onChange={onSchoolYearChange} disabled={disabled} />
        </label>
      </div>
    </section>
  );
}
