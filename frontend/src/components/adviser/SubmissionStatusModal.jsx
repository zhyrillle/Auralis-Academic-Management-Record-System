import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  CheckCircle2,
  Clock,
  BookOpen,
  Users,
  Search,
  Filter,
  ArrowRight,
  Loader2,
  Calendar,
  AlertCircle,
  ExternalLink,
  FileSpreadsheet,
} from "lucide-react";
import { getTeacherSubmissions } from "../../services/adviserDashboardService";

export default function SubmissionStatusModal({
  isOpen,
  onClose,
  initialTab = "pending", // 'pending' | 'submitted'
  userId,
  activeTerm = "T1",
  preloadedSubmissions = null,
  assignedClasses = [],
  onNavigateToClass,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState("all");

  // Keep active tab in sync with initialTab prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSearchQuery("");
      setSelectedSection("all");
    }
  }, [isOpen, initialTab]);

  // Load submissions data
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    // Use preloaded data if available
    if (Array.isArray(preloadedSubmissions) && preloadedSubmissions.length > 0) {
      setSubmissions(preloadedSubmissions);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getTeacherSubmissions(userId)
      .then((res) => {
        if (!isMounted) return;
        const list = Array.isArray(res?.submissionDetails)
          ? res.submissionDetails
          : Array.isArray(res?.submissions)
          ? res.submissions
          : [];

        if (list.length > 0) {
          setSubmissions(list);
        } else if (Array.isArray(assignedClasses) && assignedClasses.length > 0) {
          // Fallback to assignedClasses if submissions endpoint returned empty
          const fallback = assignedClasses.map((cls) => {
            const isSub = cls.status === "Submitted" || cls.entryProgress >= 100;
            return {
              teacher_assignment_id: cls.assignmentId || cls.id,
              subject_offering_id: cls.subject_offering_id || cls.subject_id,
              subject_id: cls.subject_id,
              subject_name: cls.subject || "General Subject",
              subject_code: "",
              section_id: cls.section_id,
              section_name: cls.section || cls.sectionName,
              grade_level_name: cls.gradeLevel || "",
              workflow_status: isSub ? "SUBMITTED" : "DRAFT",
              lock_status: isSub ? "TERM_LOCKED" : "EDITABLE",
              is_submitted: isSub,
              student_count: cls.studentCount || 0,
              graded_count: isSub ? cls.studentCount || 0 : Math.round(((cls.entryProgress || 0) / 100) * (cls.studentCount || 0)),
              progress: cls.entryProgress || 0,
              submitted_at: null,
            };
          });
          setSubmissions(fallback);
        } else {
          setSubmissions([]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn("Could not fetch submissions, using fallback:", err);
        if (Array.isArray(assignedClasses) && assignedClasses.length > 0) {
          const fallback = assignedClasses.map((cls) => {
            const isSub = cls.status === "Submitted" || cls.entryProgress >= 100;
            return {
              teacher_assignment_id: cls.assignmentId || cls.id,
              subject_offering_id: cls.subject_offering_id || cls.subject_id,
              subject_id: cls.subject_id,
              subject_name: cls.subject || "General Subject",
              subject_code: "",
              section_id: cls.section_id,
              section_name: cls.section || cls.sectionName,
              grade_level_name: cls.gradeLevel || "",
              workflow_status: isSub ? "SUBMITTED" : "DRAFT",
              lock_status: isSub ? "TERM_LOCKED" : "EDITABLE",
              is_submitted: isSub,
              student_count: cls.studentCount || 0,
              progress: cls.entryProgress || 0,
              submitted_at: null,
            };
          });
          setSubmissions(fallback);
        } else {
          setError(err.message || "Failed to load submission data.");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId, preloadedSubmissions, assignedClasses]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Split into pending and submitted lists
  const { pendingList, submittedList } = useMemo(() => {
    const pending = [];
    const submitted = [];
    submissions.forEach((item) => {
      if (item.is_submitted || item.workflow_status === "SUBMITTED" || item.lock_status === "TERM_LOCKED") {
        submitted.push(item);
      } else {
        pending.push(item);
      }
    });
    return { pendingList: pending, submittedList: submitted };
  }, [submissions]);

  // Unique sections list for filtering
  const sectionOptions = useMemo(() => {
    const list = submissions.map((s) => s.section_name).filter(Boolean);
    return ["all", ...Array.from(new Set(list))];
  }, [submissions]);

  // Active list based on current tab
  const currentTabItems = activeTab === "pending" ? pendingList : submittedList;

  // Filtered by search and section filter
  const filteredItems = useMemo(() => {
    return currentTabItems.filter((item) => {
      const matchesSection =
        selectedSection === "all" || item.section_name === selectedSection;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.section_name?.toLowerCase().includes(query) ||
        item.subject_name?.toLowerCase().includes(query) ||
        item.subject_code?.toLowerCase().includes(query) ||
        item.grade_level_name?.toLowerCase().includes(query);
      return matchesSection && matchesSearch;
    });
  }, [currentTabItems, selectedSection, searchQuery]);

  const handleActionClick = (item) => {
    if (onNavigateToClass) {
      onClose();
      onNavigateToClass({
        id: item.teacher_assignment_id
          ? `teaching-${item.teacher_assignment_id}`
          : (item.id || `teaching-${item.subject_offering_id || item.section_id}`),
        assignmentType: "teaching",
        assignmentId: item.teacher_assignment_id || item.assignmentId,
        teacher_assignment_id: item.teacher_assignment_id,
        section_id: item.section_id,
        sectionName: item.section_name || item.section,
        section: item.section_name || item.section,
        subject_offering_id: item.subject_offering_id,
        offering_id: item.subject_offering_id,
        subject_id: item.subject_id,
        subject: item.subject_name || item.subject,
        subject_name: item.subject_name || item.subject,
        gradeLevel: item.grade_level_name || item.gradeLevel,
        grade_level_name: item.grade_level_name || item.gradeLevel,
        school_year_id: item.school_year_id || item.schoolYearId || 1,
        schoolYearId: item.school_year_id || item.schoolYearId || 1,
        studentCount: item.student_count,
        entryProgress: item.progress,
        status: item.is_submitted ? "Submitted" : "In Progress",
        active_term: activeTerm,
      });
    }
  };

  const formatSubmittedDate = (dateString) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="submission-status-modal__backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="submission-status-modal-title"
    >
      <div className="submission-status-modal__card">
        {/* Header */}
        <div className="submission-status-modal__header">
          <div className="submission-status-modal__title-row">
            <div
              className={`submission-status-modal__icon-wrap ${
                activeTab === "pending"
                  ? "submission-status-modal__icon-wrap--pending"
                  : "submission-status-modal__icon-wrap--submitted"
              }`}
            >
              {activeTab === "pending" ? (
                <Clock size={22} className="submission-status-modal__icon" />
              ) : (
                <CheckCircle2 size={22} className="submission-status-modal__icon" />
              )}
            </div>
            <div>
              <div className="submission-status-modal__badge-row">
                <span className="submission-status-modal__badge submission-status-modal__badge--term">
                  Active Term: {activeTerm}
                </span>
                <span
                  className={`submission-status-modal__badge ${
                    activeTab === "pending"
                      ? "submission-status-modal__badge--pending"
                      : "submission-status-modal__badge--submitted"
                  }`}
                >
                  {activeTab === "pending"
                    ? `${pendingList.length} Pending`
                    : `${submittedList.length} Submitted`}
                </span>
              </div>
              <h2
                id="submission-status-modal-title"
                className="submission-status-modal__title"
              >
                Grade Submissions Status
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="submission-status-modal__close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <p className="submission-status-modal__subtitle">
          Sections and subjects you handle for <strong>{activeTerm}</strong> and their submission status.
        </p>

        {/* Tab Switcher */}
        <div className="submission-status-modal__tabs-nav">
          <button
            type="button"
            className={`submission-status-modal__tab-btn ${
              activeTab === "pending"
                ? "submission-status-modal__tab-btn--active submission-status-modal__tab-btn--pending"
                : ""
            }`}
            onClick={() => setActiveTab("pending")}
          >
            <Clock size={16} />
            <span>Pending Submissions</span>
            <span className="submission-status-modal__tab-counter submission-status-modal__tab-counter--pending">
              {pendingList.length}
            </span>
          </button>
          <button
            type="button"
            className={`submission-status-modal__tab-btn ${
              activeTab === "submitted"
                ? "submission-status-modal__tab-btn--active submission-status-modal__tab-btn--submitted"
                : ""
            }`}
            onClick={() => setActiveTab("submitted")}
          >
            <CheckCircle2 size={16} />
            <span>Submitted Grades</span>
            <span className="submission-status-modal__tab-counter submission-status-modal__tab-counter--submitted">
              {submittedList.length}
            </span>
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="submission-status-modal__controls">
          <div className="submission-status-modal__search-box">
            <Search size={16} className="submission-status-modal__search-icon" />
            <input
              type="text"
              placeholder="Search by section, subject, or grade level..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="submission-status-modal__search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="submission-status-modal__clear-btn"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {sectionOptions.length > 2 && (
            <div className="submission-status-modal__section-tabs">
              <Filter size={14} className="submission-status-modal__filter-icon" />
              {sectionOptions.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={`submission-status-modal__section-pill ${
                    selectedSection === sec
                      ? "submission-status-modal__section-pill--active"
                      : ""
                  }`}
                  onClick={() => setSelectedSection(sec)}
                >
                  {sec === "all" ? "All Sections" : sec}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="submission-status-modal__body">
          {loading ? (
            <div className="submission-status-modal__loading">
              <Loader2 size={32} className="submission-status-modal__spinner" />
              <p>Loading handled sections & subjects...</p>
            </div>
          ) : error ? (
            <div className="submission-status-modal__error">
              <AlertCircle size={22} />
              <p>{error}</p>
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="submission-status-modal__list">
              {filteredItems.map((item, idx) => {
                const isSub = Boolean(item.is_submitted);
                const formattedDate = formatSubmittedDate(item.submitted_at);
                const progressVal = Math.min(100, Math.max(0, item.progress || 0));

                return (
                  <div
                    key={item.subject_offering_id || item.teacher_assignment_id || idx}
                    className={`submission-status-modal__item-card ${
                      isSub
                        ? "submission-status-modal__item-card--submitted"
                        : "submission-status-modal__item-card--pending"
                    }`}
                  >
                    <div className="submission-status-modal__item-top">
                      <div className="submission-status-modal__item-info">
                        <div className="submission-status-modal__section-line">
                          <span className="submission-status-modal__section-name">
                            {item.section_name}
                          </span>
                          {item.grade_level_name && (
                            <span className="submission-status-modal__grade-pill">
                              {item.grade_level_name}
                            </span>
                          )}
                        </div>

                        <div className="submission-status-modal__subject-line">
                          <BookOpen size={16} className="submission-status-modal__subject-icon" />
                          <span className="submission-status-modal__subject-name">
                            {item.subject_name}
                          </span>
                          {item.subject_code && (
                            <span className="submission-status-modal__subject-code">
                              ({item.subject_code})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="submission-status-modal__status-col">
                        <span
                          className={`submission-status-modal__status-pill ${
                            isSub
                              ? "submission-status-modal__status-pill--submitted"
                              : "submission-status-modal__status-pill--pending"
                          }`}
                        >
                          {isSub ? (
                            <>
                              <CheckCircle2 size={13} />
                              Submitted
                            </>
                          ) : (
                            <>
                              <Clock size={13} />
                              Not Submitted
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Progress / Enrollment bar */}
                    <div className="submission-status-modal__item-mid">
                      <div className="submission-status-modal__meta-row">
                        <div className="submission-status-modal__meta-item">
                          <Users size={13} />
                          <span>
                            {item.student_count ?? 0} {item.student_count === 1 ? "student" : "students"}
                          </span>
                        </div>

                        <div className="submission-status-modal__meta-item">
                          {isSub ? (
                            formattedDate ? (
                              <span className="submission-status-modal__submitted-date">
                                <Calendar size={13} /> Submitted on {formattedDate}
                              </span>
                            ) : (
                              <span>100% Finalized</span>
                            )
                          ) : (
                            <span>
                              {progressVal > 0
                                ? `${progressVal}% Encoded`
                                : "0% — Not yet started"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="submission-status-modal__progress-bar-wrap">
                        <div
                          className={`submission-status-modal__progress-bar ${
                            isSub
                              ? "submission-status-modal__progress-bar--submitted"
                              : "submission-status-modal__progress-bar--pending"
                          }`}
                          style={{ width: `${isSub ? 100 : progressVal}%` }}
                        />
                      </div>
                    </div>

                    {/* Action button */}
                    <div className="submission-status-modal__item-bottom">
                      <button
                        type="button"
                        className={`submission-status-modal__action-btn ${
                          isSub
                            ? "submission-status-modal__action-btn--view"
                            : "submission-status-modal__action-btn--encode"
                        }`}
                        onClick={() => handleActionClick(item)}
                      >
                        <FileSpreadsheet size={15} />
                        <span>{isSub ? "View Grading Sheet" : "Open Grading Sheet"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="submission-status-modal__empty">
              <div
                className={`submission-status-modal__empty-icon-wrap ${
                  activeTab === "pending"
                    ? "submission-status-modal__empty-icon-wrap--success"
                    : "submission-status-modal__empty-icon-wrap--neutral"
                }`}
              >
                {activeTab === "pending" ? (
                  <CheckCircle2 size={36} className="submission-status-modal__empty-icon" />
                ) : (
                  <Clock size={36} className="submission-status-modal__empty-icon" />
                )}
              </div>
              <h3 className="submission-status-modal__empty-title">
                {searchQuery || selectedSection !== "all"
                  ? "No matching classes found"
                  : activeTab === "pending"
                  ? "All Grades Submitted!"
                  : "No Submitted Grades Yet"}
              </h3>
              <p className="submission-status-modal__empty-desc">
                {searchQuery || selectedSection !== "all"
                  ? "No sections or subjects match your search query or section filter."
                  : activeTab === "pending"
                  ? `All sections and subjects you handle have been submitted for ${activeTerm}. You're all caught up!`
                  : `None of your handled sections and subjects have been finalized and submitted for ${activeTerm} yet.`}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="submission-status-modal__footer">
          <span className="submission-status-modal__footer-count">
            Showing {filteredItems.length} of {currentTabItems.length}{" "}
            {activeTab === "pending" ? "pending" : "submitted"} {currentTabItems.length === 1 ? "class" : "classes"}
          </span>
          <button
            type="button"
            className="submission-status-modal__done-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
