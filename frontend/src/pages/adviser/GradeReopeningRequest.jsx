import React, { useState, useEffect } from "react";
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
import { getStoredUser } from "../../utils/auth";

const INITIAL_REQUESTS = [];

export default function GradeReopeningRequest() {
  const currentUser = getStoredUser();

  // Handled Subjects / Sections State
  const [handledSections, setHandledSections] = useState([]);
  const [alreadyRequestedSections, setAlreadyRequestedSections] = useState(new Set());

  // Form State
  const [subject, setSubject] = useState("");
  const [currentTeacherAssignmentId, setCurrentTeacherAssignmentId] = useState(null);
  const [currentGradeSheetId, setCurrentGradeSheetId] = useState(null);
  const [term, setTerm] = useState("1st");
  const [termId, setTermId] = useState(1);
  const [requestType, setRequestType] = useState("Grade Reopening");
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

  // Fetch handled subjects and past requests
  useEffect(() => {
    if (!currentUser?.user_id) return;

    // 1. Fetch user's handled subjects/sections
    fetch(`http://localhost:5000/api/teacher-assignments/user/${currentUser.user_id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const list = data.map((item) => ({
            id: item.section_id || item.subject_offering_id || item.subject_name,
            teacherAssignmentId: item.teacher_assignment_id || item.id,
            gradeSheetId: item.grade_sheet_id || item.gradesheet_id || null,
            sectionName: item.section_name || item.subject_name,
            subjectName: item.subject_name || item.section_name,
            label: `${item.section_name} (${item.subject_name || 'Subject'})`
          }));
          setHandledSections(list);
        } else if (currentUser.adviser_assignment?.section_name) {
          setHandledSections([{
            id: currentUser.adviser_assignment.section_id || currentUser.adviser_assignment.section_name,
            teacherAssignmentId: currentUser.adviser_assignment.teacher_assignment_id || null,
            gradeSheetId: currentUser.adviser_assignment.grade_sheet_id || null,
            sectionName: currentUser.adviser_assignment.section_name,
            subjectName: "Advisory Class",
            label: currentUser.adviser_assignment.section_name
          }]);
        }
      })
      .catch((err) => console.error("Error fetching handled sections:", err));

    // 2. Fetch existing grade reopening requests for logged in user
    fetch(`http://localhost:5000/api/reopen-requests/user/${currentUser.user_id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const requestedSet = new Set();
          const mapped = data.map((item) => {
            const secName = item.section_name || item.subject_name || "Section";
            if (secName) requestedSet.add(secName);
            return {
              id: item.request_id ? `#REQ-${String(item.request_id).padStart(3, "0")}` : `#REQ-${item.id}`,
              status: item.status ? (item.status.charAt(0).toUpperCase() + item.status.slice(1).toLowerCase()) : "Pending",
              subject: secName,
              term: item.term || "1st",
              requestType: item.request_type || "Grade Reopening",
              requestedDate: item.requested_at ? new Date(item.requested_at).toLocaleString("en-US") : "May 20, 2026",
              accessUntil: item.access_until || item.reopen_until || "May 25, 2026",
              reason: item.reason || "",
              file: item.file_name ? `${item.file_name} (${(item.file_size ? item.file_size / 1024 : 100).toFixed(0)} KB)` : null,
              adminNote: item.admin_note,
              adminRemarks: item.admin_remarks
            };
          });
          setRequests(mapped);
          setAlreadyRequestedSections(requestedSet);
        }
      })
      .catch((err) => console.error("Error fetching user requests:", err));
  }, [currentUser?.user_id]);

  // Compute Stats
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === "Pending").length;
  const approvedCount = requests.filter((r) => r.status === "Approved").length;
  const rejectedCount = requests.filter((r) => r.status === "Rejected" || r.status === "Declined").length;

  // File Upload Handlers (10MB limit enforcement)
  const validateAndSetFile = (file) => {
    if (file.size > 10 * 1024 * 1024) {
      setFormError("File size exceeds maximum allowed limit of 10MB.");
      return false;
    }
    setFormError("");
    setSelectedFile(file);
    return true;
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleClear = () => {
    setSubject("");
    setCurrentTeacherAssignmentId(null);
    setCurrentGradeSheetId(null);
    setTerm("1st");
    setTermId(1);
    setRequestType("Grade Reopening");
    setRequestDate("2026-05-20T09:30");
    setRequestAccessUntil("2026-05-25T17:00");
    setReason("");
    setSelectedFile(null);
    setFormError("");
  };

  // Handle Dropdown Change for Subject/Section
  const handleSubjectSelect = (e) => {
    const selectedVal = e.target.value;
    setSubject(selectedVal);

    if (!selectedVal) {
      setCurrentTeacherAssignmentId(null);
      setCurrentGradeSheetId(null);
      return;
    }

    const matchingSection = handledSections.find(
      (sec) => sec.sectionName === selectedVal || sec.label === selectedVal
    );

    if (matchingSection) {
      setCurrentTeacherAssignmentId(matchingSection.teacherAssignmentId);
      setCurrentGradeSheetId(matchingSection.gradeSheetId);
    } else {
      // Fallback for hardcoded/default options (Honesty, Mahogany, Molave, etc.)
      setCurrentTeacherAssignmentId(null);
      setCurrentGradeSheetId(null);
    }
    console.log("Handled Sections Data:", handledSections);
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!subject || !term || !requestType || !reason.trim()) {
      setFormError("Please fill in all required fields marked with *");
      return;
    }

    if (!currentTeacherAssignmentId) {
      setFormError("Unable to locate teacher assignment details for the selected section.");
      return;
    }

    if (alreadyRequestedSections.has(subject)) {
      setFormError("You have already submitted a reopening request for this section.");
      return;
    }

    if (selectedFile && selectedFile.size > 10 * 1024 * 1024) {
      setFormError("File size exceeds maximum allowed limit of 10MB.");
      return;
    }

    const reqDateObj = requestDate ? new Date(requestDate) : new Date();
    const untilDateObj = requestAccessUntil ? new Date(requestAccessUntil) : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    const formattedReqDate = reqDateObj.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const formattedUntilDate = untilDateObj.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const payload = {
      user_id: currentUser.user_id,
      section_name: subject,
      teacher_assignment_id: currentTeacherAssignmentId,
      grade_sheet_id: currentGradeSheetId, // Can be null; Express backend will resolve it
      reason: reason,
      status: "PENDING",
      file_name: selectedFile ? selectedFile.name : null,
      file_path: null,
      file_type: selectedFile ? selectedFile.type : null,
      file_size: selectedFile ? selectedFile.size : null,
      term_id: termId,
      requested_at: new Date().toISOString()
    };

    try {
      const res = await fetch("http://localhost:5000/api/reopen-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to submit reopening request.");
        return;
      }

      const newReq = {
        id: `#REQ-${String(data.request_id || data.id).padStart(3, "0")}`,
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
      setAlreadyRequestedSections(new Set([...alreadyRequestedSections, subject]));
      setLastSubmittedRequest(newReq);
      setIsSuccessModalOpen(true);
      handleClear();
    } catch (err) {
      console.error("Submit error:", err);
      setFormError("An error occurred while connecting to the server.");
    }
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
                  Section / Handled Subject <span className="required">*</span>
                </label>
                <select
                  className="grr-select"
                  value={subject}
                  onChange={handleSubjectSelect}
                >
                  <option value="">Select Section / Handled Subject</option>
                  {handledSections.length > 0 ? (
                    handledSections
                      .filter((sec) => !alreadyRequestedSections.has(sec.sectionName))
                      .map((sec) => (
                        <option key={sec.id} value={sec.sectionName}>
                          {sec.label}
                        </option>
                      ))
                  ) : (
                    <>
                      <option value="Honesty">Honesty</option>
                      <option value="Mahogany">Mahogany</option>
                      <option value="Molave">Molave</option>
                    </>
                  )}
                </select>
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
            {requests.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
                No reopen requests submitted yet.
              </div>
            ) : (
              requests.map((item) => {
                const isPending = item.status === "Pending";
                const isApproved = item.status === "Approved";
                const isRejected = item.status === "Rejected";

                return (
                  <div key={item.id} className="grr-timeline-item">
                    <div className="grr-timeline-track" />

                    {/* Icon Circle */}
                    <div
                      className={`grr-timeline-icon-circle ${isPending ? "pending" : isApproved ? "approved" : "rejected"
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
                          className={`grr-badge ${isPending ? "pending" : isApproved ? "approved" : "rejected"
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
