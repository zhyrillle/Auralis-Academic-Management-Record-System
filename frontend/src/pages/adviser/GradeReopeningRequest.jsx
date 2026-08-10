import React, { useState } from "react";
import { createPortal } from "react-dom";
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
  ChevronRight,
} from "lucide-react";
import "../../styles/gradeReopeningRequest.css";

const INITIAL_REQUESTS = [
  {
    id: "#REQ-2026-003",
    status: "Pending",
    subject: "English",
    term: "2nd Term",
    requestType: "Grade Reopening",
    requestedDate: "May 20, 2026 9:30 AM",
    accessUntil: "May 25, 2026 5:00 PM",
    reason:
      "Requesting access to update Quarter 2 raw scores for transferee students who recently submitted their missing performance tasks.",
    file: "Transferee_Grade_Records.pdf (1.2 MB)",
  },
  {
    id: "#REQ-2026-002",
    status: "Approved",
    subject: "English",
    term: "1st Term",
    requestType: "Grade Reopening",
    requestedDate: "April 25, 2026 2:15 PM",
    accessUntil: "April 28, 2026 5:00 PM",
    reason:
      "Need to encode late submission project grades for Grade 10 - Sampaguita.",
    file: "Approved_Form_137.pdf (850 KB)",
    adminNote: "Approved by Admin | April 25, 2026 03:40 PM",
    adminRemarks: "Granted 3 days reopening access for Grade 10 - Sampaguita.",
  },
  {
    id: "#REQ-2026-001",
    status: "Approved",
    subject: "English",
    term: "1st Term",
    requestType: "Grade Reopening",
    requestedDate: "January 30, 2026 10:16 AM",
    accessUntil: "February 02, 2026 5:00 PM",
    reason:
      "Correction of encoded quiz scores for 5 students due to item key adjustment.",
    file: null,
    adminNote: "Approved by Admin | January 30, 2026 01:15 PM",
    adminRemarks: "Approved as requested.",
  },
];

export default function GradeReopeningRequest() {
  // Form State
  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState("");
  const [requestType, setRequestType] = useState("");
  const [requestDate, setRequestDate] = useState("2026-05-20T09:30");
  const [requestAccessUntil, setRequestAccessUntil] = useState("2026-05-25T17:00");
  const [reason, setReason] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [formError, setFormError] = useState("");

  // Requests Data & Modals State
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [activeModalRequest, setActiveModalRequest] = useState(null);
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [lastSubmittedRequest, setLastSubmittedRequest] = useState(null);

  // Compute Stats
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === "Pending").length;
  const approvedCount = requests.filter((r) => r.status === "Approved").length;
  const rejectedCount = requests.filter((r) => r.status === "Rejected").length;

  // File Upload Handlers
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleClear = () => {
    setSubject("");
    setTerm("");
    setRequestType("");
    setRequestDate("2026-05-20T09:30");
    setRequestAccessUntil("2026-05-25T17:00");
    setReason("");
    setSelectedFile(null);
    setFormError("");
  };

  // Submit Handler
  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");

    if (!subject || !term || !requestType || !reason.trim()) {
      setFormError("Please fill in all required fields marked with *");
      return;
    }

    const newId = `#REQ-2026-${String(requests.length + 1).padStart(3, "0")}`;
    const formattedReqDate = new Date(requestDate).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const formattedUntilDate = new Date(requestAccessUntil).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const newReq = {
      id: newId,
      status: "Pending",
      subject,
      term,
      requestType,
      requestedDate: formattedReqDate,
      accessUntil: formattedUntilDate,
      reason,
      file: selectedFile ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(0)} KB)` : null,
    };

    setRequests([newReq, ...requests]);
    setLastSubmittedRequest(newReq);
    setIsSuccessModalOpen(true);
    handleClear();
  };

  // View Details Modal Handler
  const handleOpenDetails = (req) => {
    setActiveModalRequest(req);
    setIsViewDetailsOpen(true);
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
            {/* Row 1: Dropdowns */}
            <div className="grr-form-row three-col">
              <div className="grr-field-group">
                <label className="grr-label">
                  Subject <span className="required">*</span>
                </label>
                <select
                  className="grr-select"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option value="">Subject</option>
                  <option value="English">English</option>
                  <option value="Mathematics">Mathematics</option>
                  <option value="Science">Science</option>
                  <option value="Filipino">Filipino</option>
                  <option value="Araling Panlipunan">Araling Panlipunan</option>
                  <option value="MAPEH">MAPEH</option>
                  <option value="TLE">TLE</option>
                  <option value="ESP">ESP</option>
                </select>
              </div>

              <div className="grr-field-group">
                <label className="grr-label">
                  Term <span className="required">*</span>
                </label>
                <select
                  className="grr-select"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  <option value="">Term</option>
                  <option value="1st Term">1st Term</option>
                  <option value="2nd Term">2nd Term</option>
                  <option value="3rd Term">3rd Term</option>
                  <option value="4th Term">4th Term</option>
                </select>
              </div>

              <div className="grr-field-group">
                <label className="grr-label">
                  Request Type <span className="required">*</span>
                </label>
                <select
                  className="grr-select"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                >
                  <option value="">Request Type</option>
                  <option value="Grade Reopening">Grade Reopening</option>
                  <option value="Grade Edit Access">Grade Edit Access</option>
                  <option value="Late Grade Submission">Late Grade Submission</option>
                  <option value="Score Correction">Score Correction</option>
                </select>
              </div>
            </div>

            {/* Row 2: Date Pickers */}
            <div className="grr-form-row two-col">
              <div className="grr-field-group">
                <label className="grr-label">
                  Date of Request <span className="required">*</span>
                </label>
                <div className="grr-input-with-icon">
                  <Calendar className="grr-input-icon" size={18} />
                  <input
                    type="datetime-local"
                    className="grr-input"
                    value={requestDate}
                    onChange={(e) => setRequestDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grr-field-group">
                <label className="grr-label">
                  Request Access Until <span className="required">*</span>
                </label>
                <div className="grr-input-with-icon">
                  <Calendar className="grr-input-icon" size={18} />
                  <input
                    type="datetime-local"
                    className="grr-input"
                    value={requestAccessUntil}
                    onChange={(e) => setRequestAccessUntil(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Reason / Explanation */}
            <div className="grr-field-group">
              <label className="grr-label">
                Reason / Explanation <span className="required">*</span>
              </label>
              <span className="grr-sublabel">
                Please provide a clear and detailed explanation why you are requesting to reopen grade access.
              </span>
              <div className="grr-textarea-wrapper">
                <textarea
                  className="grr-textarea"
                  placeholder="Type your explanation here..."
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <span className="grr-char-counter">{reason.length}/1000</span>
              </div>
            </div>

            {/* Row 4: Supporting Documents */}
            <div className="grr-field-group">
              <label className="grr-label">Supporting Documents (Optional)</label>
              <span className="grr-sublabel">You may upload files that support your request.</span>

              <div
                className="grr-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-upload-input").click()}
              >
                <UploadCloud className="grr-dropzone-icon" />
                <div className="grr-dropzone-text">
                  <span className="grr-dropzone-title">Drag and drop files here or</span>
                  <span className="grr-dropzone-subtitle">PDF, JPG, PNG (Max. 10MB)</span>
                </div>
                <button type="button" className="grr-choose-btn">
                  Choose File
                </button>
                <input
                  id="file-upload-input"
                  type="file"
                  hidden
                  onChange={handleFileChange}
                  accept=".pdf,.png,.jpg,.jpeg"
                />
              </div>

              {selectedFile && (
                <div className="grr-file-preview">
                  <div className="grr-file-info">
                    <FileText size={16} color="#112d61" />
                    <span>
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="grr-remove-file-btn"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Row 5: Action Buttons */}
            <div className="grr-actions-row">
              <button type="button" className="grr-clear-btn" onClick={handleClear}>
                Clear
              </button>
              <button type="submit" className="grr-submit-btn">
                <Send size={16} />
                <span>Submit Request</span>
              </button>
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
            {requests.map((item) => {
              const isPending = item.status === "Pending";
              const isApproved = item.status === "Approved";
              const isRejected = item.status === "Rejected";

              return (
                <div key={item.id} className="grr-timeline-item">
                  <div className="grr-timeline-track" />

                  {/* Icon Circle */}
                  <div
                    className={`grr-timeline-icon-circle ${
                      isPending ? "pending" : isApproved ? "approved" : "rejected"
                    }`}
                  >
                    {isPending && <Clock size={18} />}
                    {isApproved && <CheckCircle2 size={18} />}
                    {isRejected && <XCircle size={18} />}
                  </div>

                  {/* Content */}
                  <div className="grr-timeline-content">
                    <div className="grr-timeline-top">
                      <span
                        className={`grr-badge ${
                          isPending ? "pending" : isApproved ? "approved" : "rejected"
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

                      {item.adminNote && (
                        <span
                          className={`grr-admin-note ${
                            isApproved ? "approved" : "rejected"
                          }`}
                        >
                          {item.adminNote}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
                  className={`grr-badge ${
                    activeModalRequest.status === "Pending"
                      ? "pending"
                      : activeModalRequest.status === "Approved"
                      ? "approved"
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
                  <span className="grr-info-item-label">Subject</span>
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
                  <span className="grr-info-item-label">Date of Request</span>
                  <span className="grr-info-item-value">{activeModalRequest.requestedDate}</span>
                </div>
                <div className="grr-info-item">
                  <span className="grr-info-item-label">Access Requested Until</span>
                  <span className="grr-info-item-value">{activeModalRequest.accessUntil}</span>
                </div>
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
                  <div style={{ fontSize: "13px", color: "#94a3b8", italic: "true" }}>
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
                      border: `1px solid ${
                        activeModalRequest.status === "Approved" ? "#bbf7d0" : "#fecaca"
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
              <button
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
