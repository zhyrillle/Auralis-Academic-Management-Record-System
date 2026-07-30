import React, { useState, useMemo } from "react";
import { Search, Pencil, X, ChevronDown } from "lucide-react";
import backIconUrl from "../../assets/backButton.svg";
import "../../styles/teacherEvalList.css";

// Mock Teacher Data 

const ALL_TEACHERS = [
  { id: 1, lastName: "Anderson", firstName: "Alex Matthew", subject: "English", grade: "Grade 7" },
  { id: 2, lastName: "Brown", firstName: "Bianca Marie", subject: "English", grade: "Grade 7" },
  { id: 3, lastName: "Cruz", firstName: "Carl Anthony", subject: "English", grade: "Grade 7" },
  { id: 4, lastName: "Davis", firstName: "Diana Rose", subject: "English", grade: "Grade 7" },
  { id: 5, lastName: "Edwards", firstName: "Ethan James", subject: "English", grade: "Grade 7" },
  { id: 6, lastName: "Flores", firstName: "Faith Nicole", subject: "Science", grade: "Grade 8" },
  { id: 7, lastName: "Garcia", firstName: "Gabriel Loui", subject: "Science", grade: "Grade 8" },
  { id: 8, lastName: "Hernandez", firstName: "Hannah Grace", subject: "Science", grade: "Grade 8" },
  { id: 9, lastName: "Ignacio", firstName: "Ivan Carlo", subject: "Science", grade: "Grade 8" },
  { id: 10, lastName: "Jimenez", firstName: "Julia Anne", subject: "Math", grade: "Grade 9" },
  { id: 11, lastName: "Kim", firstName: "Kevin Paul", subject: "Math", grade: "Grade 9" },
  { id: 12, lastName: "Lopez", firstName: "Lara Joy", subject: "Math", grade: "Grade 9" },
  { id: 13, lastName: "Mendoza", firstName: "Marco Luis", subject: "Filipino", grade: "Grade 7" },
  { id: 14, lastName: "Navarro", firstName: "Nina Belle", subject: "Filipino", grade: "Grade 8" },
  { id: 15, lastName: "Ocampo", firstName: "Oscar Dean", subject: "MAPEH", grade: "Grade 10" },
  { id: 16, lastName: "Perez", firstName: "Patricia Mae", subject: "MAPEH", grade: "Grade 10" },
  { id: 17, lastName: "Quirino", firstName: "Quentin Pio", subject: "TLE", grade: "Grade 9" },
  { id: 18, lastName: "Reyes", firstName: "Rachel Ann", subject: "TLE", grade: "Grade 10" },
  { id: 19, lastName: "Santos", firstName: "Samuel Jose", subject: "Araling Panlipunan", grade: "Grade 7" },
  { id: 20, lastName: "Torres", firstName: "Tricia Faye", subject: "Araling Panlipunan", grade: "Grade 8" },
];

const SUBJECTS = [...new Set(ALL_TEACHERS.map((t) => t.subject))].sort();
const GRADES = [...new Set(ALL_TEACHERS.map((t) => t.grade))].sort();

// Component 

export default function TeacherEvalList({ onBack, onCreateFeedback }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");

  // ── Filtered list ──
  const filtered = useMemo(() => {
    return ALL_TEACHERS.filter((t) => {
      const fullName = `${t.lastName}, ${t.firstName}`.toLowerCase();
      const matchSearch = fullName.includes(searchQuery.toLowerCase()) ||
        t.subject.toLowerCase().includes(searchQuery.toLowerCase());
      const matchSubject = subjectFilter ? t.subject === subjectFilter : true;
      const matchGrade = gradeFilter ? t.grade === gradeFilter : true;
      return matchSearch && matchSubject && matchGrade;
    });
  }, [searchQuery, subjectFilter, gradeFilter]);

  const clearFilters = () => {
    setSubjectFilter("");
    setGradeFilter("");
    setSearchQuery("");
  };

  const hasFilters = subjectFilter || gradeFilter || searchQuery;

  return (
    <div className="tel-container">

      {/* ── Header ── */}
      <div className="tel-header">
        <div className="tel-header-left">
          <button className="back-btn" onClick={onBack} title="Back to Peer Feedback">
            <img src={backIconUrl} alt="Back" width={17} height={17} />
          </button>
          <h1 className="tel-page-title">Peer Feedback</h1>
        </div>

        <div className="tel-header-right">
          {showSearch ? (
            <div className="tel-search-bar">
              <Search size={15} className="tel-search-icon" />
              <input
                className="tel-search-input"
                type="text"
                placeholder="Search teacher or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button className="tel-search-clear" onClick={() => setSearchQuery("")}>
                  <X size={14} />
                </button>
              )}
              <button className="tel-search-close" onClick={() => { setShowSearch(false); setSearchQuery(""); }}>
                <X size={16} />
              </button>
            </div>
          ) : (
            <button className="tel-search-toggle" onClick={() => setShowSearch(true)} title="Search">
              <Search size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="tel-filter-bar">
        <span className="tel-filter-label">Filters:</span>

        {/* Subject Filter */}
        <div className="tel-select-wrapper">
          <select
            className="tel-select"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="">Subject</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <ChevronDown size={13} className="tel-select-arrow" />
        </div>

        {/* Grade Level Filter */}
        <div className="tel-select-wrapper">
          <select
            className="tel-select"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
          >
            <option value="">Grade Level</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <ChevronDown size={13} className="tel-select-arrow" />
        </div>

        {hasFilters && (
          <button className="tel-clear-filters" onClick={clearFilters}>
            <X size={13} /> Clear
          </button>
        )}

        <span className="tel-result-count">{filtered.length} teacher{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Teacher List ── */}
      <div className="tel-list-card">
        {filtered.length === 0 ? (
          <div className="tel-empty">
            <Search size={32} color="#cbd5e1" />
            <p>No teachers found matching your filters.</p>
          </div>
        ) : (
          <ul className="tel-list">
            {filtered.map((teacher, idx) => (
              <li
                key={teacher.id}
                className="tel-list-item"
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                {/* Avatar */}
                <div className="tel-avatar">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#112d61">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                  </svg>
                </div>

                {/* Info */}
                <div className="tel-info">
                  <p className="tel-name">
                    {teacher.lastName}, {teacher.firstName}
                  </p>
                  <p className="tel-meta">
                    {teacher.subject} | {teacher.grade}
                  </p>
                </div>

                {/* Action */}
                <button
                  className="tel-create-btn"
                  onClick={() => onCreateFeedback && onCreateFeedback(teacher)}
                >
                  <Pencil size={14} />
                  Create Feedback
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
