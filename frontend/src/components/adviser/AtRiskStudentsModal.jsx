import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Users,
  Calendar,
  TrendingDown,
  Info,
  Loader2,
  BookOpen,
  Filter,
} from "lucide-react";
import { getAtRiskStudents } from "../../services/adviserDashboardService";

export default function AtRiskStudentsModal({ isOpen, onClose, userId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    highRiskCount: 0,
    students: [],
    totalScored: 0,
    unavailableCount: 0,
    targetTerm: "T2",
    schoolYear: "2026-2027",
  });
  const [selectedSection, setSelectedSection] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    getAtRiskStudents(userId)
      .then((res) => {
        if (!isMounted) return;
        setData({
          highRiskCount: res?.highRiskCount || 0,
          students: Array.isArray(res?.students) ? res.students : [],
          totalScored: res?.totalScored || 0,
          unavailableCount: res?.unavailableCount || 0,
          targetTerm: res?.targetTerm || "T2",
          schoolYear: res?.schoolYear || "2026-2027",
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Failed to load high-risk students.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Available sections for filtering
  const sectionOptions = useMemo(() => {
    const list = data.students
      .map((s) => s.section_name)
      .filter(Boolean);
    return ["all", ...Array.from(new Set(list))];
  }, [data.students]);

  // Filtered students
  const filteredStudents = useMemo(() => {
    return data.students.filter((student) => {
      const matchesSection =
        selectedSection === "all" || student.section_name === selectedSection;
      const matchesSearch =
        !searchQuery.trim() ||
        student.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(student.lrn || "").includes(searchQuery) ||
        student.handled_subject?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSection && matchesSearch;
    });
  }, [data.students, selectedSection, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="at-risk-modal__backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="at-risk-modal-title"
    >
      <div className="at-risk-modal__card">
        {/* Header */}
        <div className="at-risk-modal__header">
          <div className="at-risk-modal__title-row">
            <div className="at-risk-modal__icon-wrap">
              <AlertTriangle size={22} className="at-risk-modal__icon" />
            </div>
            <div>
              <div className="at-risk-modal__badge-row">
                <span className="at-risk-modal__badge at-risk-modal__badge--ml">
                  ML Prediction
                </span>
                <span className="at-risk-modal__badge at-risk-modal__badge--term">
                  {data.targetTerm} · SY {data.schoolYear}
                </span>
              </div>
              <h2 id="at-risk-modal-title" className="at-risk-modal__title">
                High-Risk Students
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="at-risk-modal__close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <p className="at-risk-modal__subtitle">
          Learners identified as <strong>High-Risk</strong> by the academic machine learning model across the subject sections you handle.
        </p>

        {/* Filters Bar */}
        {data.students.length > 0 && (
          <div className="at-risk-modal__controls">
            <div className="at-risk-modal__search-box">
              <input
                type="text"
                placeholder="Search by student name, LRN, or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="at-risk-modal__search-input"
              />
            </div>
            {sectionOptions.length > 2 && (
              <div className="at-risk-modal__section-tabs">
                <Filter size={15} className="at-risk-modal__filter-icon" />
                {sectionOptions.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    className={`at-risk-modal__tab ${selectedSection === sec ? "at-risk-modal__tab--active" : ""}`}
                    onClick={() => setSelectedSection(sec)}
                  >
                    {sec === "all" ? "All Sections" : sec}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="at-risk-modal__body">
          {loading ? (
            <div className="at-risk-modal__loading">
              <Loader2 size={32} className="at-risk-modal__spinner" />
              <p>Evaluating academic risk factors...</p>
            </div>
          ) : error ? (
            <div className="at-risk-modal__error">
              <AlertTriangle size={24} />
              <p>{error}</p>
            </div>
          ) : filteredStudents.length > 0 ? (
            <div className="at-risk-modal__list">
              {filteredStudents.map((student, idx) => (
                <div key={student.student_id || idx} className="at-risk-modal__student-card">
                  <div className="at-risk-modal__student-card-top">
                    <div>
                      <h4 className="at-risk-modal__student-name">{student.name}</h4>
                      <div className="at-risk-modal__student-meta">
                        <span className="at-risk-modal__student-lrn">
                          LRN: {student.lrn || "Not specified"}
                        </span>
                        <span className="at-risk-modal__dot">·</span>
                        <span className="at-risk-modal__student-section">
                          Section: <strong>{student.section_name}</strong>
                        </span>
                        {student.grade_level && (
                          <>
                            <span className="at-risk-modal__dot">·</span>
                            <span>{student.grade_level}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="at-risk-modal__score-pill">
                      <span className="at-risk-modal__score-label">HIGH RISK</span>
                      <span className="at-risk-modal__score-val">
                        {Math.round(student.risk_score || student.score * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="at-risk-modal__subject-tag">
                    <BookOpen size={14} />
                    <span>Handled in: <strong>{student.handled_subject}</strong></span>
                  </div>

                  {student.flags && student.flags.length > 0 && (
                    <div className="at-risk-modal__flags-row">
                      {student.flags.map((flag, fIdx) => (
                        <div key={fIdx} className="at-risk-modal__flag-badge">
                          {flag.icon === "calendar" ? (
                            <Calendar size={13} />
                          ) : flag.icon === "trending-down" ? (
                            <TrendingDown size={13} />
                          ) : (
                            <Info size={13} />
                          )}
                          <span>{flag.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="at-risk-modal__empty">
              <div className="at-risk-modal__empty-icon-wrap">
                <CheckCircle2 size={36} className="at-risk-modal__empty-icon" />
              </div>
              <h3 className="at-risk-modal__empty-title">
                No High-Risk Students Detected
              </h3>
              <p className="at-risk-modal__empty-desc">
                {searchQuery || selectedSection !== "all"
                  ? "No students match your active section or search query."
                  : "Based on the team's machine learning evaluation, no students in your handled sections currently meet the High-Risk threshold (model probability score \u2265 70%)."}
              </p>

              {data.unavailableCount > 0 && !searchQuery && selectedSection === "all" && (
                <div className="at-risk-modal__notice">
                  <Info size={16} className="at-risk-modal__notice-icon" />
                  <span>
                    Note: {data.unavailableCount} student(s) in your handled classes currently have incomplete prerequisite data (such as pending source attendance or dated reading screening) and could not be evaluated by the model yet.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="at-risk-modal__footer">
          <span className="at-risk-modal__footer-note">
            Predictions are generated for early academic intervention.
          </span>
          <button
            type="button"
            className="at-risk-modal__done-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
