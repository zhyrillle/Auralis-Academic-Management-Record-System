import DropdownSelect from '../common/DropdownSelect';
import FilterToolbar from '../common/FilterToolbar';

export default function FilterBar({ filters, onChange, disabled, schoolYears = [] }) {
  const years = schoolYears.map(year => ({ value: year.label, label: 'SY ' + year.label }));
  return <FilterToolbar label="Dashboard filters" className="dept-dashboard-navigation" end={
    <DropdownSelect label="School year" value={filters.schoolYear} options={years} placeholder="School year"
      onChange={value => onChange('schoolYear', value)} disabled={disabled || !years.length} />}>
    <DropdownSelect label="Term" value={filters.quarter} options={[{ value: '', label: 'Overall' },
      ...[1, 2, 3].map(term => ({ value: String(term), label: 'Term ' + term }))]}
      onChange={value => onChange('quarter', value)} disabled={disabled} />
    <DropdownSelect label="Grade level" value={filters.gradeLevel} options={[{ value: '', label: 'All grade levels' },
      ...[7, 8, 9, 10].map(grade => ({ value: 'G' + grade, label: 'Grade ' + grade }))]}
      onChange={value => onChange('gradeLevel', value)} disabled={disabled} />
  </FilterToolbar>;
}
