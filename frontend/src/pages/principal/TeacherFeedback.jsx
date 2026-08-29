import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  LayoutGrid,
  CheckCircle2,
  Target,
  Search,
  ChevronDown,
  Moon,
  Bell,
  MessageSquareOff,
} from "lucide-react";

// Services
import {
  getTeacherFeedbackSummary,
  getLikertEvaluationResults,
  getTeacherFeedbackComments,
} from "../../services/principalFeedbackService";

// Scoped Styling
import "./TeacherFeedback.css";

export default function TeacherFeedback() {
  // Controls state
  const [selectedTerm, setSelectedTerm] = useState("Overall");
  const [selectedYear, setSelectedYear] = useState("2025-2026");
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Data states (Zero / Empty initial states)
  const [summary, setSummary] = useState({
    totalResponses: 0,
    overallRating: 0.0,
    ratingDiff: "+0.0",
    wouldRecommendPercent: 0,
    belowTargetCount: 0,
  });

  const [likertResults, setLikertResults] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  const terms = ["Overall", "Term 1", "Term 2", "Term 3"];
  const schoolYears = ["2025-2026", "2026-2027"];

  // Fetch feedback data on term / year change
  useEffect(() => {
    let isMounted = true;

    async function loadFeedbackData() {
      setLoading(true);
      try {
        const [sumRes, likertRes, commentsRes] = await Promise.all([
          getTeacherFeedbackSummary(selectedTerm, selectedYear),
          getLikertEvaluationResults(selectedTerm, selectedYear),
          getTeacherFeedbackComments(selectedTerm, selectedYear, searchQuery),
        ]);

        if (isMounted) {
          setSummary(sumRes || {});
          setLikertResults(
            Array.isArray(likertRes)
              ? likertRes
              : likertRes?.results || []
          );
          setComments(
            Array.isArray(commentsRes)
              ? commentsRes
              : commentsRes?.comments || []
          );
        }
      } catch (error) {
        console.error("Error loading teacher feedback:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadFeedbackData();

    return () => {
      isMounted = false;
    };
  }, [selectedTerm, selectedYear]);

  // Filter comments locally with search query
  const filteredComments = useMemo(() => {
    if (!searchQuery.trim()) return comments;
    const q = searchQuery.toLowerCase();
    return comments.filter((c) =>
      c.text?.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q)
    );
  }, [comments, searchQuery]);

  return (
    <div className="tf-container">
      {/* 1. Page Header */}
      <header className="tf-header">
        <div>
          <h1 className="tf-title">Teacher Feedback</h1>
          <p className="tf-subtitle">
            Anonymous teacher evaluation of principal leadership
          </p>
        </div>

        <div className="tf-header-actions">
          <button
            type="button"
            className="tf-header-icon-btn"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <Moon size={18} />
          </button>
          <button
            type="button"
            className="tf-header-icon-btn"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="tf-notif-badge">7</span>
          </button>
        </div>
      </header>

      {/* 2. Controls Filter Bar (Term Selector & School Year) */}
      <section className="tf-controls-bar">
        {/* Term Tabs */}
        <div className="tf-term-group">
          {terms.map((t) => (
            <button
              key={t}
              type="button"
              className={`tf-term-btn ${selectedTerm === t ? "active" : ""}`}
              onClick={() => setSelectedTerm(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* School Year Dropdown */}
        <div className="tf-dropdown-wrap">
          <button
            type="button"
            className="tf-dropdown-btn"
            onClick={() => setYearDropdownOpen((prev) => !prev)}
          >
            <span>School Year: {selectedYear}</span>
            <ChevronDown size={16} />
          </button>
          {yearDropdownOpen && (
            <div className="tf-dropdown-menu">
              {schoolYears.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  className={`tf-dropdown-item ${selectedYear === yr ? "active" : ""}`}
                  onClick={() => {
                    setSelectedYear(yr);
                    setYearDropdownOpen(false);
                  }}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 3. 4 Stat Summary Cards */}
      <section className="tf-stats-grid">
        {/* Card 1: Total Responses */}
        <div className="tf-stat-card">
          <div className="tf-stat-header">
            <span className="tf-stat-label">Total Responses</span>
            <div className="tf-stat-icon-wrap">
              <Users size={18} />
            </div>
          </div>
          <div className="tf-stat-body">
            <span className="tf-stat-value">{summary.totalResponses ?? 0}</span>
            <span className="tf-stat-sub">All terms</span>
          </div>
        </div>

        {/* Card 2: Overall Rating */}
        <div className="tf-stat-card">
          <div className="tf-stat-header">
            <span className="tf-stat-label">Overall Rating</span>
            <div className="tf-stat-icon-wrap tf-icon--yellow">
              <LayoutGrid size={18} />
            </div>
          </div>
          <div className="tf-stat-body">
            <span className="tf-stat-value">
              {Number(summary.overallRating || 0).toFixed(1)}
            </span>
            <span className="tf-stat-sub">
              {Number(summary.overallRating || 0) > 0 && (
                <span className="tf-stat-sub-diff">↗ {summary.ratingDiff || "+0.0"}</span>
              )}
              <span>out of 5.0</span>
            </span>
          </div>
        </div>

        {/* Card 3: Comments Received */}
        <div className="tf-stat-card">
          <div className="tf-stat-header">
            <span className="tf-stat-label">Comments Received</span>
            <div className="tf-stat-icon-wrap tf-icon--green">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="tf-stat-body">
            <span className="tf-stat-value">
              {summary.totalComments ?? comments.length ?? 0}
            </span>
            <span className="tf-stat-sub">Total teacher comments</span>
          </div>
        </div>

        {/* Card 4: Below Target */}
        <div className="tf-stat-card">
          <div className="tf-stat-header">
            <span className="tf-stat-label">Below Target</span>
            <div className="tf-stat-icon-wrap">
              <Target size={18} />
            </div>
          </div>
          <div className="tf-stat-body">
            <span className="tf-stat-value">
              {summary.belowTargetCount ?? 0}
            </span>
            <span className="tf-stat-sub">questions under 3.0</span>
          </div>
        </div>
      </section>

      {/* 4. Likert Scale Result - Leadership Evaluation */}
      <section className="tf-section-card">
        <div className="tf-section-title-wrap">
          <h2 className="tf-section-title">
            Likert Scale Result - Leadership Evaluation
          </h2>
          <div className="tf-section-divider" />
        </div>

        <div className="tf-likert-table-wrap">
          <table className="tf-likert-table">
            <thead>
              <tr>
                <th className="tf-likert-th">NO.</th>
                <th className="tf-likert-th">DESCRIPTION</th>
                <th className="tf-likert-th tf-th-rate">RATE</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(likertResults) ? likertResults : []).map((item, idx) => {
                const rate = Number(item.rate) || 0;
                const percent = Math.min(100, Math.max(0, (rate / 5) * 100));

                let fillClass = "tf-rate-fill--empty";
                if (rate >= 4.0) {
                  fillClass = "tf-rate-fill--high";
                } else if (rate > 0) {
                  fillClass = "tf-rate-fill--medium";
                }

                return (
                  <tr key={item.id || idx} className="tf-likert-tr">
                    <td className="tf-likert-td tf-likert-td-no">{idx + 1}.</td>
                    <td className="tf-likert-td tf-likert-td-desc">
                      {item.description}
                    </td>
                    <td className="tf-likert-td tf-likert-td-rate">
                      <div className="tf-rate-bar-wrap">
                        <div className="tf-rate-track">
                          <div
                            className={`tf-rate-fill ${fillClass}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="tf-rate-score">
                          {rate > 0 ? rate.toFixed(1) : "0.0"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Comment Explorer (Without Praise/Suggestion/Concern filter pills) */}
      <section className="tf-section-card">
        <div className="tf-comments-header">
          <div className="tf-comments-title-wrap">
            <h2 className="tf-section-title">Comment Explorer</h2>
            <p className="tf-subtitle">Open-ended responses from teachers</p>
          </div>

          <div className="tf-search-box">
            <Search size={16} className="tf-search-icon" />
            <input
              type="text"
              className="tf-search-input"
              placeholder="Search comments"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="tf-comments-list">
          {filteredComments.length > 0 ? (
            filteredComments.map((comment, idx) => (
              <div key={comment.id || idx} className="tf-comment-card">
                <p className="tf-comment-text">"{comment.text}"</p>
              </div>
            ))
          ) : (
            <div className="tf-empty-comments">
              <MessageSquareOff size={32} />
              <span className="tf-empty-text">
                No teacher comments available yet.
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

