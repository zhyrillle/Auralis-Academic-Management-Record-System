import React, { useState, useEffect, useMemo } from "react";
import { Search, Pencil, X, ChevronDown, Check } from "lucide-react";
import backIconUrl from "../../assets/backButton.svg";
import "../../styles/teacherEvalList.css";
import { getStoredUser } from "../../utils/auth";

export default function TeacherEvalList({ onBack, onCreateFeedback }) {
  const currentUser = getStoredUser();
  const [teachers, setTeachers] = useState([]);
  const [evaluatedUserIds, setEvaluatedUserIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch users from backend
    fetch("http://localhost:5000/api/users")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Filter teachers/advisers apart from logged-in user
          const list = data
            .filter((u) => {
              if (currentUser && Number(u.user_id) === Number(currentUser.user_id)) {
                return false;
              }
              const r = (u.role || u.display_role || "").toLowerCase();
              return r.includes("teacher") || r.includes("adviser") || u.display_role === "Subject Teacher" || u.display_role === "Adviser";
            })
            .map((u) => ({
              id: u.user_id,
              lastName: u.last_name || "",
              firstName: u.first_name || "",
              subject: u.department_name || "General Education",
              grade: u.gradeLevel || u.section || "High School",
              user_id: u.user_id
            }));
          setTeachers(list);
        }
      })
      .catch((err) => console.error("Error fetching teachers:", err))
      .finally(() => setLoading(false));

    // 2. Fetch feedback given by current logged-in user
    if (currentUser?.user_id) {
      fetch(`http://localhost:5000/api/feedback/evaluator/${currentUser.user_id}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            const set = new Set(data.map((item) => item.evaluee_id));
            setEvaluatedUserIds(set);
          }
        })
        .catch((err) => console.error("Error fetching evaluator feedback:", err));
    }
  }, [currentUser?.user_id]);

  const subjects = useMemo(() => [...new Set(teachers.map((t) => t.subject))].sort(), [teachers]);
  const grades = useMemo(() => [...new Set(teachers.map((t) => t.grade))].sort(), [teachers]);

  // Filtered list
  const filtered = useMemo(() => {
    return teachers.filter((t) => {
      const fullName = `${t.lastName}, ${t.firstName}`.toLowerCase();
      const matchSearch =
        fullName.includes(searchQuery.toLowerCase()) ||
        t.subject.toLowerCase().includes(searchQuery.toLowerCase());
      const matchSubject = subjectFilter ? t.subject === subjectFilter : true;
      const matchGrade = gradeFilter ? t.grade === gradeFilter : true;
      return matchSearch && matchSubject && matchGrade;
    });
  }, [teachers, searchQuery, subjectFilter, gradeFilter]);

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
              <button
                className="tel-search-close"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                }}
              >
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
            <option value="">Subject / Department</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
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
            <option value="">Grade Level / Section</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="tel-select-arrow" />
        </div>

        {hasFilters && (
          <button className="tel-clear-filters" onClick={clearFilters}>
            <X size={13} /> Clear
          </button>
        )}

        <span className="tel-result-count">
          {filtered.length} teacher{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Teacher List ── */}
      <div className="tel-list-card">
        {loading ? (
          <div className="tel-empty">
            <p>Loading teachers...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="tel-empty">
            <Search size={32} color="#cbd5e1" />
            <p>No teachers found matching your filters.</p>
          </div>
        ) : (
          <ul className="tel-list">
            {filtered.map((teacher, idx) => {
              const isEvaluated = evaluatedUserIds.has(teacher.id);

              return (
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
                    className={`tel-create-btn ${isEvaluated ? "submitted" : ""}`}
                    disabled={isEvaluated}
                    style={isEvaluated ? { opacity: 0.6, cursor: "not-allowed", backgroundColor: "#64748b" } : {}}
                    onClick={() => !isEvaluated && onCreateFeedback && onCreateFeedback(teacher)}
                  >
                    {isEvaluated ? (
                      <>
                        <Check size={14} />
                        Feedback Submitted
                      </>
                    ) : (
                      <>
                        <Pencil size={14} />
                        Create Feedback
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
