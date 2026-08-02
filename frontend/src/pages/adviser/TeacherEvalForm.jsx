import React, { useState, useEffect } from "react";
import { Pencil, X } from "lucide-react";
import backIconUrl from "../../assets/backButton.svg";
import "../../styles/teacherEvalForm.css";

// Likert Scale Questions 

const LIKERT_QUESTIONS = [
  "Demonstrates professionalism in dealing with colleagues.",
  "Shows respect toward fellow teachers and staff.",
  "Maintains a positive and professional attitude in the workplace.",
  "Demonstrates punctuality and preparedness in school-related activities.",
  "Contributes ideas during meetings and discussions.",
  "Responds professionally to concerns and suggestions.",
  "Completes assigned tasks on time.",
  "Takes initiative in solving problems and challenges.",
];

// Component 

export default function TeacherEvalForm({ teacher, onBack, onCancel }) {
  const [ratings, setRatings] = useState(Array(LIKERT_QUESTIONS.length).fill(null));
  const [strengths, setStrengths] = useState("");
  const [improve, setImprove] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});

  const handleRate = (qIdx, value) => {
    setRatings((prev) => {
      const next = [...prev];
      next[qIdx] = value;
      return next;
    });
    // clear error for that question
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`q${qIdx}`];
      return next;
    });
  };

  const validate = () => {
    const newErrors = {};
    ratings.forEach((r, i) => {
      if (r === null) newErrors[`q${i}`] = true;
    });
    if (!strengths.trim()) newErrors.strengths = true;
    if (!improve.trim()) newErrors.improve = true;
    return newErrors;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // scroll to first error
      const firstErr = document.querySelector(".tef-error");
      if (firstErr) firstErr.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitted(true);
  };

  // Auto-redirect after success modal is shown
  useEffect(() => {
    if (submitted) {
      const t = setTimeout(() => onCancel(), 2500);
      return () => clearTimeout(t);
    }
  }, [submitted]);

  return (
    <div className="tef-container">

      {/* ── Success Modal Overlay ── */}
      {submitted && (
        <div className="tef-modal-backdrop">
          <div className="tef-modal-card">
            <div className="tef-modal-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="tef-modal-text">Feedback submitted<br />successfully</p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="tef-header">
        <div className="tef-header-left">
          <button className="back-btn" onClick={onBack} title="Back to Teacher List">
            <img src={backIconUrl} alt="Back" width={17} height={17} />
          </button>
          <h1 className="tef-page-title">Subject Teacher Feedback</h1>
        </div>
        <div className="tef-header-actions">
          <button className="tef-submit-btn" onClick={handleSubmit}>
            <Pencil size={15} />
            Submit Feedback
          </button>
          <button className="tef-cancel-btn" onClick={onCancel}>
            <X size={15} />
            Cancel
          </button>
        </div>
      </div>

      {/* ── Form Card ── */}
      <div className="tef-form-card">

        {/* Card Header */}
        <div className="tef-form-intro">
          <h2 className="tef-form-heading">Submit your evaluation</h2>
          <p className="tef-form-subtext">
            All responses are anonymous. Please be honest and constructive.
          </p>
          {teacher && (
            <div className="tef-teacher-badge">
              <div className="tef-teacher-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#112d61">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
              </div>
              <div>
                <p className="tef-teacher-name">
                  {teacher.lastName}, {teacher.firstName}
                </p>
                <p className="tef-teacher-meta">
                  {teacher.subject} | {teacher.grade}
                </p>
              </div>
            </div>
          )}
        </div>

        <hr className="tef-divider" />

        {/* ── Part 1: Likert Scale ── */}
        <div className="tef-part">
          <h3 className="tef-part-title">
            Part 1 — Likert Scale{" "}
            <span className="tef-part-hint">(1 = Strongly Disagree · 5 = Strongly Agree)</span>
          </h3>

          <div className="tef-likert-list">
            {LIKERT_QUESTIONS.map((question, i) => (
              <div
                key={i}
                className={`tef-likert-row${errors[`q${i}`] ? " tef-error" : ""}`}
              >
                <p className="tef-q-text">
                  {i + 1}. {question}
                </p>
                <div className="tef-rating-group">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      className={`tef-rating-btn${ratings[i] === val ? " selected" : ""}`}
                      onClick={() => handleRate(i, val)}
                      title={
                        val === 1 ? "Strongly Disagree" :
                          val === 2 ? "Disagree" :
                            val === 3 ? "Neutral" :
                              val === 4 ? "Agree" : "Strongly Agree"
                      }
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <hr className="tef-divider" />

        {/* ── Part 2: Open-Ended ── */}
        <div className="tef-part">
          <h3 className="tef-part-title">Part 2 — Open-Ended Questions</h3>

          {/* Q1 */}
          <div className={`tef-open-group${errors.strengths ? " tef-error" : ""}`}>
            <label className="tef-open-label">
              What are the teacher's strongest qualities or contributions?
            </label>
            <textarea
              className="tef-textarea"
              placeholder="Share your observations..."
              value={strengths}
              onChange={(e) => {
                setStrengths(e.target.value);
                setErrors((p) => { const n = { ...p }; delete n.strengths; return n; });
              }}
              rows={5}
            />
          </div>

          {/* Q2 */}
          <div className={`tef-open-group${errors.improve ? " tef-error" : ""}`}>
            <label className="tef-open-label">
              What aspects can the teacher improve on professionally?
            </label>
            <textarea
              className="tef-textarea"
              placeholder="Share your observations..."
              value={improve}
              onChange={(e) => {
                setImprove(e.target.value);
                setErrors((p) => { const n = { ...p }; delete n.improve; return n; });
              }}
              rows={5}
            />
          </div>
        </div>

        {/* Validation hint */}
        {Object.keys(errors).length > 0 && (
          <p className="tef-validation-msg">
            ⚠ Please answer all questions before submitting.
          </p>
        )}

        {/* Bottom action row */}
        <div className="tef-form-footer">
          <button className="tef-submit-btn" onClick={handleSubmit}>
            <Pencil size={15} />
            Submit Feedback
          </button>
          <button className="tef-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
