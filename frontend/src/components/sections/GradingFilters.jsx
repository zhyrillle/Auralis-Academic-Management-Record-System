import { Search, Check } from "lucide-react";

export default function GradingFilters({
  searchStudentQuery,
  setSearchStudentQuery,
  filterDescriptor,
  setFilterDescriptor,
  filterRemark,
  setFilterRemark,
  submitted,
}) {
  return (
    <div className="grading-filters-row">
      <div className="grading-filters-left">
        <div className="search-bar-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search student names or LRN..."
            value={searchStudentQuery}
            onChange={(e) => setSearchStudentQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <select
          value={filterDescriptor}
          onChange={(e) => setFilterDescriptor(e.target.value)}
          className="select-filter"
          style={{ minWidth: "150px" }}
        >
          <option value="All">All Descriptors</option>
          <option value="Outstanding">Outstanding</option>
          <option value="Very Satisfactory">Very Satisfactory</option>
          <option value="Satisfactory">Satisfactory</option>
          <option value="Fairly Satisfactory">Fairly Satisfactory</option>
          <option value="Did Not Meet Expectations">Did Not Meet Expectations</option>
        </select>

        <select
          value={filterRemark}
          onChange={(e) => setFilterRemark(e.target.value)}
          className="select-filter"
          style={{ minWidth: "130px" }}
        >
          <option value="All">All Remarks</option>
          <option value="Passed">Passed</option>
          <option value="Failed">Failed</option>
        </select>
      </div>
      
      {submitted && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            backgroundColor: "#d1fae5",
            color: "#065f46",
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "600",
          }}
        >
          <Check size={16} />
          <span>Grades Submitted (Locked)</span>
        </div>
      )}
    </div>
  );
}
