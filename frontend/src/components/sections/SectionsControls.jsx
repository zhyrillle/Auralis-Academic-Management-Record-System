import { ArrowUpDown } from "lucide-react";

export default function SectionsControls({
  filterSubject,
  setFilterSubject,
  subjectOptions,
  filterGrade,
  setFilterGrade,
  gradeOptions,
  sortBy,
  setSortBy,
  sortAscending,
  setSortAscending,
}) {
  return (
    <div className="controls-row">
      <div className="filters-group">
        <div className="filter-wrapper">
          <span className="filter-label">Filter Subject</span>
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="select-filter"
          >
            <option value="All">All Subjects</option>
            {subjectOptions
              .filter((s) => s !== "All")
              .map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
          </select>
        </div>

        <div className="filter-wrapper">
          <span className="filter-label">Filter Grade Level</span>
          <select
            value={filterGrade}
            onChange={(e) => setFilterGrade(e.target.value)}
            className="select-filter"
          >
            <option value="All">All Grades</option>
            {gradeOptions
              .filter((g) => g !== "All")
              .map((grd) => (
                <option key={grd} value={grd}>
                  {grd}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="sorting-group">
        <div className="filter-wrapper">
          <span className="filter-label">Sort By</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="select-filter"
            style={{ minWidth: "140px" }}
          >
            <option value="sectionName">Section Name</option>
            <option value="gradeLevel">Grade Level</option>
            <option value="subject">Subject</option>
            <option value="deadline">Deadline</option>
          </select>
        </div>

        <button
          className="sort-order-btn"
          onClick={() => setSortAscending(!sortAscending)}
          title={sortAscending ? "Sort Descending" : "Sort Ascending"}
        >
          <ArrowUpDown
            size={18}
            style={{ transform: sortAscending ? "none" : "rotate(180deg)" }}
          />
        </button>
      </div>
    </div>
  );
}
