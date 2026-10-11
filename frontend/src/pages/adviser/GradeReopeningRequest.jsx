import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  MessageSquarePlus,
  Clock,
  CheckCircle2,
  XCircle,
  BookOpen,
  Calendar,
  Info,
  Send,
  UploadCloud,
  FileText,
  X,
  AlertCircle,
} from "lucide-react";
import "../../styles/gradeReopeningRequest.css";
import { getStoredUser } from "../../utils/auth";
import DropdownSelect from "../../components/common/DropdownSelect";
import { eligibilityMessages } from "../../services/gradingPeriodService";

const INITIAL_REQUESTS = [];
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
function requestDateLabel(value) {
  const date = new Date(value ?? NaN);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString("en-PH", { timeZone: "Asia/Manila" });
}

export default function GradeReopeningRequest() {
  const currentUser = getStoredUser();
  const location = useLocation();
  const prefillId = new URLSearchParams(location.search).get("gradeSheetId");

  // Sheet IDs distinguish terms and subjects even when section names repeat.
  const [gradeSheets, setGradeSheets] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const [selection, setSelection] = useState({ yearId: "", sectionId: "", subjectId: "", termId: "" });
  const [prefillError, setPrefillError] = useState("");
  const [reason, setReason] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [formError, setFormError] = useState("");
  const [subjectError, setSubjectError] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Requests Data & Modals State
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [activeModalRequest, setActiveModalRequest] = useState(null);
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [lastSubmittedRequest, setLastSubmittedRequest] = useState(null);

  useEffect(() => {
    if (!currentUser?.user_id) return;
    let isCurrent = true;
    const headers = { "X-Auralis-User-Id": String(currentUser.user_id) };
    async function load() {
      setOptionsLoading(true);
      setOptionsError("");
      try {
        const responses = await Promise.all([
          fetch(`${API_BASE_URL}/grading-periods/grade-sheets/reopening-options`, { headers }),
          fetch(`${API_BASE_URL}/reopen-requests/user/${currentUser.user_id}`, { headers }),
        ]);
        const payloads = await Promise.all(responses.map(response => response.json()));
        if (responses.some(response => !response.ok)) throw new Error(payloads.find(payload => payload.error || payload.message)?.error || "Reopening data could not be loaded.");
        const [options, history] = payloads;
        if (!Array.isArray(options.gradeSheets) || !Array.isArray(history)) throw new Error("Reopening response is incomplete.");
        if (options.gradeSheets.some(sheet => !sheet.section_id || !sheet.subject_id || !sheet.term_id || !sheet.school_year_id)) {
          throw new Error("Grade-sheet identifiers are unavailable. Restart the updated backend and try again.");
        }
        if (options.gradeSheets.length && !options.defaultSchoolYearId) {
          throw new Error("The default school year is unavailable. Restart the updated backend and try again.");
        }
        if (!isCurrent) return;
        setGradeSheets(options.gradeSheets);
        const prefilled = prefillId && options.gradeSheets.find(sheet => String(sheet.grade_sheet_id) === prefillId);
        setPrefillError(prefillId && !prefilled ? "The linked grade sheet is not available among your assigned sheets." : "");
        setSelection(previous => prefilled ? {
          yearId: String(prefilled.school_year_id), sectionId: String(prefilled.section_id),
          subjectId: String(prefilled.subject_id), termId: String(prefilled.term_id),
        } : {
          ...previous,
          yearId: options.gradeSheets.some(sheet => String(sheet.school_year_id) === previous.yearId)
            ? previous.yearId : String(options.defaultSchoolYearId ?? ""),
        });
        setRequests(history.map(item => ({
          id: `#REQ-${String(item.request_id).padStart(3, "0")}`,
          gradeSheetId: String(item.grade_sheet_id),
          status: String(item.status || "").charAt(0).toUpperCase() + String(item.status || "").slice(1).toLowerCase(),
          subject: `${item.subject_name || "Subject"} — ${item.section_name || "Section"}`,
          term: item.term_name || "Term unavailable",
          requestType: item.request_type || "Grade Reopening",
          requestedDate: requestDateLabel(item.requested_at),
          approvedDate: item.reviewed_at ? requestDateLabel(item.reviewed_at) : null,
          accessUntil: item.access_until ? requestDateLabel(item.access_until) : "Not assigned",
          reason: item.reason || "", file: item.file_name || null,
          adminNote: item.admin_note, adminRemarks: item.admin_remarks,
        })));
      } catch (error) {
        if (isCurrent) setOptionsError(error.message || "Reopening data could not be loaded.");
      } finally { if (isCurrent) setOptionsLoading(false); }
    }
    load();
    return () => { isCurrent = false; };
  }, [currentUser?.user_id, refreshAttempt, prefillId]);

  // Compute Stats
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === "Pending").length;
  const approvedCount = requests.filter((r) => r.status === "Approved").length;
  const rejectedCount = requests.filter((r) => r.status === "Rejected" || r.status === "Declined" || r.status === "Denied").length;

  // File Upload Handlers (10MB per-file limit)
  const validateAndAddFiles = (newFiles) => {
    const oversized = Array.from(newFiles).filter(
      (f) => f.size > 10 * 1024 * 1024
    );
    if (oversized.length > 0) {
      setFormError(`File "${oversized[0].name}" exceeds the 10MB limit.`);
      return;
    }
    setFormError("");
    setSelectedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const unique = Array.from(newFiles).filter(
        (f) => !existingNames.has(f.name)
      );
      return [...prev, ...unique];
    });
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
      // Defer reset so browser doesn't cancel the file selection
      const input = e.target;
      setTimeout(() => { input.value = ""; }, 0);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClear = () => {
    setSelection(previous => ({ ...previous, sectionId: "", subjectId: "", termId: "" }));
    setPrefillError("");
    setReason("");
    setSelectedFiles([]);
    setFormError("");
    setSubjectError("");
    setReasonError("");
  };
  const yearSheets = gradeSheets.filter(sheet => String(sheet.school_year_id) === selection.yearId);
  const sectionSheets = yearSheets.filter(sheet => String(sheet.section_id) === selection.sectionId);
  const subjectSheets = sectionSheets.filter(sheet => String(sheet.subject_id) === selection.subjectId);
  const selectedSheets = subjectSheets.filter(sheet => String(sheet.term_id) === selection.termId);
  const selectedSheet = selectedSheets.length === 1 ? selectedSheets[0] : null;
  const yearOptions = [...new Map(gradeSheets.map(sheet => [String(sheet.school_year_id), {
    value: String(sheet.school_year_id),
    label: `SY ${sheet.school_year_starts_on}–${sheet.school_year_ends_on}`,
  }])).values()];
  const sectionOptions = [...new Map(yearSheets.map(sheet => [String(sheet.section_id), {
    value: String(sheet.section_id), label: `${sheet.grade_level_name} ${sheet.section_name}`,
  }])).values()];
  const subjectOptions = [...new Map(sectionSheets.map(sheet => [String(sheet.subject_id), {
    value: String(sheet.subject_id), label: sheet.subject_name,
  }])).values()];
  const termOptions = [...new Map(subjectSheets.map(sheet => {
    const duplicate = subjectSheets.filter(other => String(other.term_id) === String(sheet.term_id)).length !== 1;
    return [String(sheet.term_id), {
      value: String(sheet.term_id), label: `${sheet.term_name} Term`,
      disabled: duplicate || !sheet.eligible,
      title: duplicate ? "Multiple grade sheets match this term. Administrator review is required."
        : sheet.eligible ? "Accepting reopening requests." : eligibilityMessages[sheet.reason] || "Sheet unavailable.",
    }];
  })).values()];
  const handleSelectionChange = (field, value) => {
    setSelection(previous => ({
      ...previous, [field]: value,
      ...(field === "yearId" ? { sectionId: "", subjectId: "", termId: "" } : {}),
      ...(field === "sectionId" ? { subjectId: "", termId: "" } : {}),
      ...(field === "subjectId" ? { termId: "" } : {}),
    }));
    setPrefillError("");
    setSubjectError("");
    setFormError("");
  };
  const disableInfo = {
    isDisabled: !currentUser?.user_id || optionsLoading || Boolean(optionsError) || Boolean(prefillError) || !selectedSheet || !selectedSheet.eligible,
    reason: optionsLoading ? "Loading grade sheets…" : optionsError || prefillError
      || (!selectedSheet ? "Select a grade sheet." : eligibilityMessages[selectedSheet.reason] || "This grade sheet is not eligible."),
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormError("");
    setSubjectError("");
    setReasonError("");

    let hasFieldErrors = false;
    if (!selectedSheet) {
      setSubjectError("Please select a section, subject and eligible term.");
      hasFieldErrors = true;
    }
    if (!reason.trim()) {
      setReasonError("Please provide a reason / explanation for requesting grade reopening.");
      hasFieldErrors = true;
    }

    if (hasFieldErrors) {
      setFormError("Please fill in all required fields marked with *");
      return;
    }

    if (disableInfo.isDisabled) {
      setFormError(disableInfo.reason);
      return;
    }

    setIsSubmitting(true);

    try {
      // Create FormData
      const formData = new FormData();

      formData.append("grade_sheet_id", selectedSheet.grade_sheet_id);
      formData.append("reason", reason);

      // Append each selected file under the same field name
      selectedFiles.forEach((file) => {
        formData.append("supporting_file", file);
      });

      // IMPORTANT:
      // Do NOT manually set Content-Type.
      // Browser automatically sets multipart/form-data boundary.
      const res = await fetch(
        `${API_BASE_URL}/reopen-requests`,
        {
          method: "POST",
          headers: { "X-Auralis-User-Id": String(currentUser.user_id) },
          body: formData,
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setFormError(
          data.error || "Failed to submit reopening request."
        );
        return;
      }

      console.log("Request submitted:", data);

      // Create the request displayed in the frontend
      const newReq = {
        id: `#REQ-${String(
          data.request_id || data.id
        ).padStart(3, "0")}`,

        status: "Pending",
        gradeSheetId: String(selectedSheet.grade_sheet_id),
        subject: `${selectedSheet.subject_name} — ${selectedSheet.section_name}`,
        term: selectedSheet.term_name,
        requestType: selectedSheet.request_type === "LATE_SUBMISSION" ? "Late Submission" : "Grade Correction",

        requestedDate: new Date().toLocaleString("en-US"),

        accessUntil: "Not assigned",

        reason,

        file: selectedFiles.length > 0
          ? selectedFiles.map((f) => `${f.name} (${(f.size / 1024).toFixed(0)} KB)`).join(", ")
          : null,
      };

      setRequests((prev) => [newReq, ...prev]);

      setRefreshAttempt(value => value + 1);

      setLastSubmittedRequest(newReq);
      setIsSuccessModalOpen(true);

      handleClear();

    } catch (err) {
      console.error("Submit error:", err);

      setFormError(
        "An error occurred while connecting to the server."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // View Details Modal Handler
  const handleOpenDetails = (req) => {
    setActiveModalRequest(req);
    setIsViewDetailsOpen(true);
  };

  // Never show a successful cancellation until the server confirms it.
  const handleCancelRequest = async (targetReq) => {
    if (!targetReq) return;
    const requestId = parseInt(String(targetReq.id).replace(/\D/g, ""), 10);
    try {
      const response = await fetch(`${API_BASE_URL}/reopen-requests/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Auralis-User-Id": String(currentUser.user_id) },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Cancellation failed.");
      setRefreshAttempt(value => value + 1);
      setIsViewDetailsOpen(false);
    } catch (error) { setFormError(error.message || "Cancellation failed."); }
  };

  return (
    <div className="grr-container">
      {/* ── Page Header ── */}
      <h1 className="grr-page-title">Grade Reopening Request</h1>

      {/* ── Top Stat Cards ── */}
      <div className="grr-stats-grid">
        <div className="grr-stat-card">
          <span className="grr-stat-label">Total Requests</span>
          <span className="grr-stat-value">{totalCount}</span>
          <span className="grr-stat-sub all-time">All Time</span>
        </div>

        <div className="grr-stat-card">
          <span className="grr-stat-label">Pending Requests</span>
          <span className="grr-stat-value">{pendingCount}</span>
          <span className="grr-stat-sub pending">For Review</span>
        </div>

        <div className="grr-stat-card">
          <span className="grr-stat-label">Approved Requests</span>
          <span className="grr-stat-value">{approvedCount}</span>
          <span className="grr-stat-sub approved">This School Year</span>
        </div>

        <div className="grr-stat-card">
          <span className="grr-stat-label">Rejected Requests</span>
          <span className="grr-stat-value">{rejectedCount}</span>
          <span className="grr-stat-sub rejected">This School Year</span>
        </div>
      </div>

      {/* ── Main Layout: Create Request Form + My Requests List ── */}
      <div className="grr-main-grid">
        {/* Left Column: Create New Request Card */}
        <div className="grr-form-card">
          <div className="grr-card-header">
            <MessageSquarePlus className="grr-card-header-icon" />
            <h2 className="grr-card-title">Create New Request</h2>
          </div>

          {formError && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: "8px",
                color: "#dc2626",
                fontSize: "13px",
              }}
            >
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="grr-field-group">
              <label className="grr-label" htmlFor="reopening-school-year">School Year</label>
              {yearOptions.length > 1 ? (
                <DropdownSelect id="reopening-school-year" label="School Year" value={selection.yearId}
                  options={yearOptions} placeholder="Select school year"
                  onChange={value => handleSelectionChange("yearId", value)}
                  disabled={optionsLoading || Boolean(optionsError) || isSubmitting} />
              ) : (
                <span className="grr-sublabel">{yearOptions[0]?.label || (optionsLoading ? "Loading school year…" : "No school year available")}</span>
              )}
            </div>

            {/* Cascading selectors resolve one sheet without parsing display names. */}
            <div className="grr-form-row three-col">
              <div className="grr-field-group">
                <label className="grr-label" htmlFor="reopening-section">
                  Section <span className="required">*</span>
                </label>
                <DropdownSelect id="reopening-section" label="Section"
                  value={selection.sectionId} options={sectionOptions}
                  placeholder={optionsLoading ? "Loading sections…" : "Select section"}
                  onChange={value => handleSelectionChange("sectionId", value)}
                  disabled={optionsLoading || Boolean(optionsError) || isSubmitting}
                  error={Boolean(subjectError) && !selection.sectionId} />
              </div>
              <div className="grr-field-group">
                <label className="grr-label" htmlFor="reopening-subject">Subject <span className="required">*</span></label>
                <DropdownSelect id="reopening-subject" label="Subject"
                  value={selection.subjectId} options={subjectOptions} placeholder="Select subject"
                  onChange={value => handleSelectionChange("subjectId", value)}
                  disabled={!selection.sectionId || optionsLoading || Boolean(optionsError) || isSubmitting}
                  error={Boolean(subjectError) && !selection.subjectId} />
              </div>
              <div className="grr-field-group">
                <label className="grr-label" htmlFor="reopening-term">Term <span className="required">*</span></label>
                <DropdownSelect id="reopening-term" label="Term"
                  value={selection.termId} options={termOptions} placeholder="Select term"
                  onChange={value => handleSelectionChange("termId", value)}
                  disabled={!selection.subjectId || optionsLoading || Boolean(optionsError) || isSubmitting}
                  error={Boolean(subjectError) && !selectedSheet} />
              </div>
            </div>
            {subjectError && <span className="grr-field-error-msg" role="alert"><AlertCircle size={13} />{subjectError}</span>}
            {prefillError && (
              <div className="grr-window-notice closed" role="alert">
                <Info size={16} /><div><strong>Linked grade sheet unavailable</strong><p>{prefillError} Select an available sheet instead.</p></div>
              </div>
            )}

            {optionsError && (
              <div className="grr-window-notice closed" role="alert">
                <AlertCircle size={16} />
                <div><strong>Unable to load grade sheets</strong><p>{optionsError}</p>
                  <button type="button" onClick={() => setRefreshAttempt(value => value + 1)}>Retry</button>
                </div>
              </div>
            )}
            {!optionsLoading && !optionsError && gradeSheets.length === 0 && (
              <p role="status">No assigned grade sheets are available.</p>
            )}
            {selectedSheet && (
              <div className={`grr-window-notice ${selectedSheet.eligible ? "info" : "closed"}`} role="status">
                <Info size={16} className="grr-window-notice-icon" />
                <div>
                  <strong>{selectedSheet.eligible ? "Request window open" : eligibilityMessages[selectedSheet.reason] || "Sheet unavailable"}</strong>
                  <p>Requests: {requestDateLabel(selectedSheet.reopening_requests_open_at)} to {requestDateLabel(selectedSheet.reopening_requests_close_at)} (Philippine time). Review may happen later; the administrator sets the editing deadline.</p>
                </div>
              </div>
            )}

            {/* Row 3: Reason / Explanation */}
            <div className="grr-field-group">
              <label className="grr-label">
                Reason / Explanation <span className="required">*</span>
              </label>
              <span className="grr-sublabel">
                Please provide a clear and detailed explanation why you are requesting to reopen grade access.
              </span>
              <div className={`grr-textarea-wrapper${reasonError ? " grr-field-error-input" : ""}`}>
                <textarea
                  className="grr-textarea"
                  placeholder="Type your explanation here..."
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (e.target.value.trim()) setReasonError("");
                  }}
                />
                <span className="grr-char-counter">{reason.length}/1000</span>
              </div>
              {reasonError && (
                <span className="grr-field-error-msg">
                  <AlertCircle size={13} />
                  {reasonError}
                </span>
              )}
            </div>

            {/* Row 4: Supporting Documents */}
            <div className="grr-field-group">
              <label className="grr-label">Supporting Documents (Optional)</label>
              <span className="grr-sublabel">You may upload files that support your request.</span>

              <label
                htmlFor="file-upload-input"
                className={`grr-dropzone${isDragOver ? " grr-dropzone--active" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <UploadCloud className="grr-dropzone-icon" />
                <div className="grr-dropzone-text">
                  <span className="grr-dropzone-title">Drag and drop files here or</span>
                  <span className="grr-dropzone-subtitle">PDF, JPG, PNG (Max. 10MB each)</span>
                </div>
                <span className="grr-choose-btn">Choose Files</span>
                <input
                  id="file-upload-input"
                  type="file"
                  hidden
                  multiple
                  onChange={handleFileChange}
                  accept=".pdf,.png,.jpg,.jpeg"
                />
              </label>

              {selectedFiles.length > 0 && (
                <div className="grr-file-list">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="grr-file-preview">
                      <div className="grr-file-info">
                        <FileText size={16} color="#112d61" />
                        <span>
                          {file.name} ({(file.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        className="grr-remove-file-btn"
                        onClick={() => handleRemoveFile(idx)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Row 5: Action Buttons */}
            <div className="grr-actions-row">
              <button type="button" className="grr-clear-btn" onClick={handleClear} disabled={isSubmitting}>
                Clear
              </button>
              <div
                className={`grr-submit-wrapper${disableInfo.isDisabled || isSubmitting ? " grr-submit-wrapper--disabled" : ""}`}
                title={disableInfo.isDisabled ? disableInfo.reason : ""}
              >
                <button
                  type="submit"
                  className="grr-submit-btn"
                  disabled={disableInfo.isDisabled || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="grr-spinner" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Submit Request</span>
                    </>
                  )}
                </button>
                {disableInfo.isDisabled && !isSubmitting && (
                  <div className="grr-submit-tooltip" role="tooltip">
                    <Info size={14} style={{ flexShrink: 0, marginTop: "2px" }} />
                    <span>{disableInfo.reason}</span>
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* Footer Info Box */}
          <div className="grr-info-footer">
            <Info size={16} style={{ color: "#64748b", flexShrink: 0 }} />
            <span>You will be notified once your request has been reviewed.</span>
          </div>
        </div>

        {/* Right Column: My Requests Timeline Card */}
        <div className="grr-requests-card">
          <h2 className="grr-card-title">My Requests</h2>

          <div className="grr-timeline">
            {requests.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
                No reopen requests submitted yet.
              </div>
            ) : (
              requests.map((item) => {
                const statusUpper = String(item.status || "").toUpperCase();
                const isPending = statusUpper === "PENDING";
                const isApproved = statusUpper === "APPROVED";
                const isCancelled = statusUpper === "CANCELLED";
                const isRejected = !isPending && !isApproved && !isCancelled;

                return (
                  <div key={item.id} className="grr-timeline-item">
                    <div className="grr-timeline-track" />

                    {/* Icon Circle */}
                    <div
                      className={`grr-timeline-icon-circle ${isPending ? "pending" : isApproved ? "approved" : isCancelled ? "cancelled" : "rejected"
                        }`}
                    >
                      {isPending && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" />
                          <polyline points="12 7 12 12 16.2 14.2" />
                        </svg>
                      )}
                      {isApproved && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {isCancelled && (
                        <X size={18} />
                      )}
                      {isRejected && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                      )}
                    </div>

                    {/* Content */}
                    <div className="grr-timeline-content">
                      <div className="grr-timeline-top">
                        <span
                          className={`grr-badge ${isPending ? "pending" : isApproved ? "approved" : isCancelled ? "cancelled" : "rejected"
                            }`}
                        >
                          {item.status}
                        </span>
                        <button
                          className="grr-view-details-btn"
                          onClick={() => handleOpenDetails(item)}
                        >
                          View Details
                        </button>
                      </div>

                      <div className="grr-timeline-details">
                        <div className="grr-detail-line">
                          <BookOpen className="grr-detail-icon" />
                          <span>{item.subject}</span>
                        </div>
                        <div className="grr-detail-line">
                          <Calendar className="grr-detail-icon" />
                          <span>{item.term}</span>
                        </div>
                        <div className="grr-detail-line">
                          <Clock className="grr-detail-icon" />
                          <span>Requested: {item.requestedDate}</span>
                        </div>
                        {isApproved && (
                          <div className="grr-detail-line">
                            <CheckCircle2 className="grr-detail-icon" style={{ color: "#16a34a" }} />
                            <span>Approved: {item.approvedDate || item.accessUntil || "May 22, 2026"}</span>
                          </div>
                        )}

                        {item.adminNote && (
                          <span
                            className={`grr-admin-note ${isApproved ? "approved" : "rejected"
                              }`}
                          >
                            {item.adminNote}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── MODAL 1: View Details Modal ── */}
      {isViewDetailsOpen && activeModalRequest && createPortal(
        <div
          className="grr-modal-backdrop"
          onClick={() => setIsViewDetailsOpen(false)}
        >
          <div className="grr-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="grr-modal-header">
              <div className="grr-modal-title-group">
                <h3 className="grr-modal-title">Request Details</h3>
                <span
                  className={`grr-badge ${activeModalRequest.status === "Pending"
                    ? "pending"
                    : activeModalRequest.status === "Approved"
                      ? "approved"
                      : activeModalRequest.status === "Cancelled"
                        ? "cancelled"
                        : "rejected"
                    }`}
                >
                  {activeModalRequest.status}
                </span>
              </div>
              <button
                className="grr-modal-close-btn"
                onClick={() => setIsViewDetailsOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="grr-modal-body">
              {/* Information Grid */}
              <div className="grr-info-grid">
                <div className="grr-info-item">
                  <span className="grr-info-item-label">Request ID</span>
                  <span className="grr-info-item-value">{activeModalRequest.id}</span>
                </div>
                <div className="grr-info-item">
                  <span className="grr-info-item-label">Section</span>
                  <span className="grr-info-item-value">{activeModalRequest.subject}</span>
                </div>
                <div className="grr-info-item">
                  <span className="grr-info-item-label">Term</span>
                  <span className="grr-info-item-value">{activeModalRequest.term}</span>
                </div>
                <div className="grr-info-item">
                  <span className="grr-info-item-label">Request Type</span>
                  <span className="grr-info-item-value">{activeModalRequest.requestType}</span>
                </div>
                <div className="grr-info-item">
                  <span className="grr-info-item-label">Requested Date</span>
                  <span className="grr-info-item-value">{activeModalRequest.requestedDate}</span>
                </div>
                {activeModalRequest.status === "Approved" && (
                  <div className="grr-info-item">
                    <span className="grr-info-item-label">Approved Date</span>
                    <span className="grr-info-item-value" style={{ color: "#16a34a", fontWeight: 700 }}>
                      {activeModalRequest.approvedDate || activeModalRequest.accessUntil || "May 22, 2026"}
                    </span>
                  </div>
                )}
              </div>

              {/* Reason Box */}
              <div className="grr-section-box">
                <span className="grr-section-box-title">Reason / Explanation</span>
                <div className="grr-section-box-content">{activeModalRequest.reason}</div>
              </div>

              {/* Supporting Document */}
              <div className="grr-section-box">
                <span className="grr-section-box-title">Supporting Document</span>
                {activeModalRequest.file ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      background: "#f1f5f9",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "#1e293b",
                    }}
                  >
                    <FileText size={18} color="#112d61" />
                    <span>{activeModalRequest.file}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: "13px", color: "#94a3b8", fontStyle: "italic" }}>
                    No supporting document attached.
                  </div>
                )}
              </div>

              {/* Admin Remarks if decision has been made */}
              {activeModalRequest.adminRemarks && (
                <div className="grr-section-box">
                  <span className="grr-section-box-title">Administrator Decision & Remarks</span>
                  <div
                    style={{
                      background: activeModalRequest.status === "Approved" ? "#f0fdf4" : "#fef2f2",
                      border: `1px solid ${activeModalRequest.status === "Approved" ? "#bbf7d0" : "#fecaca"
                        }`,
                      borderRadius: "10px",
                      padding: "14px",
                      fontSize: "13px",
                      color: activeModalRequest.status === "Approved" ? "#15803d" : "#b91c1c",
                    }}
                  >
                    <div style={{ fontWeight: "700", marginBottom: "4px" }}>
                      {activeModalRequest.adminNote}
                    </div>
                    <div>{activeModalRequest.adminRemarks}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="grr-modal-footer">
              {activeModalRequest.status === "Pending" ? (
                <button
                  type="button"
                  className="grr-cancel-request-btn"
                  onClick={() => handleCancelRequest(activeModalRequest)}
                  title="Cancel this pending request"
                >
                  <XCircle size={16} />
                  <span>Cancel Request</span>
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                className="grr-clear-btn"
                onClick={() => setIsViewDetailsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 2: Submission Success Modal ── */}
      {isSuccessModalOpen && createPortal(
        <div
          className="grr-modal-backdrop"
          onClick={() => setIsSuccessModalOpen(false)}
        >
          <div
            className="grr-modal-card grr-success-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grr-success-icon-wrapper">
              <CheckCircle2 size={36} />
            </div>

            <h3 className="grr-success-title">Request Submitted Successfully!</h3>
            <p className="grr-success-desc">
              Your grade reopening request has been submitted to the administrator for review. You will be notified once a decision has been made.
            </p>

            {lastSubmittedRequest && (
              <div className="grr-success-summary">
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  <strong>Request ID:</strong> {lastSubmittedRequest.id}
                </div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  <strong>Subject:</strong> {lastSubmittedRequest.subject} ({lastSubmittedRequest.term})
                </div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  <strong>Requested Access Until:</strong> {lastSubmittedRequest.accessUntil}
                </div>
              </div>
            )}

            <button
              className="grr-submit-btn"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => setIsSuccessModalOpen(false)}
            >
              Done
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
