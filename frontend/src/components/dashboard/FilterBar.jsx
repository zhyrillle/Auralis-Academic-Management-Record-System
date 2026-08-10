import { useMemo } from "react";

/**
 * @typedef {Object} FilterBarProps
 * @property {{ schoolYear: string, gradeLevel: string, quarter: string }} filters
 * @property {(key: string, value: string) => void} onChange
 * @property {boolean} [disabled]
 */

export default function FilterBar({ filters, onChange, disabled }) {
  const schoolYearOptions = useMemo(
    () => [
      { value: "", label: "School Year" },
      { value: "2025-2026", label: "SY 2025-2026" },
      { value: "2024-2025", label: "SY 2024-2025" },
      { value: "2023-2024", label: "SY 2023-2024" },
    ],
    []
  );

  const gradeLevelOptions = useMemo(
    () => [
      { value: "", label: "Grade Level" },
      { value: "7", label: "Grade 7" },
      { value: "8", label: "Grade 8" },
      { value: "9", label: "Grade 9" },
      { value: "10", label: "Grade 10" },
    ],
    []
  );

  const quarterOptions = useMemo(
    () => [
      { value: "", label: "Quarter" },
      { value: "1", label: "Q1" },
      { value: "2", label: "Q2" },
      { value: "3", label: "Q3" },
      { value: "4", label: "Q4" },
    ],
    []
  );

  return (
    <div className="dept-filter-bar">
      <div className="dept-filter-control">
        <label className="dept-filter-label">School Year</label>
        <select
          className="dept-filter-select"
          value={filters.schoolYear}
          onChange={(e) => onChange("schoolYear", e.target.value)}
          disabled={disabled}
        >
          {schoolYearOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="dept-filter-control">
        <label className="dept-filter-label">Grade Level</label>
        <select
          className="dept-filter-select"
          value={filters.gradeLevel}
          onChange={(e) => onChange("gradeLevel", e.target.value)}
          disabled={disabled}
        >
          {gradeLevelOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="dept-filter-control">
        <label className="dept-filter-label">Quarter</label>
        <select
          className="dept-filter-select"
          value={filters.quarter}
          onChange={(e) => onChange("quarter", e.target.value)}
          disabled={disabled}
        >
          {quarterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
