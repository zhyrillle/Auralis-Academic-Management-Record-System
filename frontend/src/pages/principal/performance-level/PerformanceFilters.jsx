import DropdownSelect from "../../../components/common/DropdownSelect";
import FilterToolbar from "../../../components/common/FilterToolbar";
import AnalyticsTermTabs from "../analytics/AnalyticsTermTabs";

export default function PerformanceFilters({ terms, term, onTermChange, schoolYears, schoolYear, onSchoolYearChange, disabled, children }) {
  return (
    <FilterToolbar className="pa-navigation pp-filter-bar" label="Performance filters" end={
      <div className="pa-filter-controls pp-filter-controls">
        {children}
        <DropdownSelect label="School year" value={schoolYear} options={schoolYears} onChange={onSchoolYearChange} disabled={disabled} />
      </div>
    }>
      <AnalyticsTermTabs options={terms} value={term} onChange={onTermChange} disabled={disabled} />
    </FilterToolbar>
  );
}
