import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Printer, FileSpreadsheet, Loader2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import SF10Document, { safeStr, parseNameParts } from "./SF10Document";
import { exportSf10Excel } from "../utils/exportSf10Excel";
import { getStudentSF10Details } from "../services/reportService";
import "../styles/SF10PreviewModal.css";

/**
 * React Error Boundary specific to SF10 Modal
 */
class SF10ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("SF10PreviewModal Render Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.inline) return <div role="alert" className="sf10-inline-error">
        The SF10 record could not be displayed. Select another tab and try again.
      </div>;
      return (
        <div className="sf10-modal-overlay" onClick={this.props.onClose}>
          <div
            className="sf10-modal-container"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "560px", marginTop: "80px" }}
          >
            <div
              style={{
                background: "#1e293b",
                color: "#f8fafc",
                borderRadius: "12px",
                padding: "24px",
                boxShadow: "0 20px 30px -10px rgba(0,0,0,0.6)",
                border: "1px solid #334155",
                width: "100%",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <AlertCircle size={22} color="#ef4444" />
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#f87171" }}>
                    Form 10 Preview Error
                  </h3>
                </div>
                <button
                  onClick={this.props.onClose}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <p style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: "1.5", marginBottom: "14px" }}>
                We encountered an issue preparing the official SF10 permanent record for preview.
              </p>

              <pre
                style={{
                  background: "#0f172a",
                  padding: "12px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  color: "#fca5a5",
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  maxHeight: "150px",
                }}
              >
                {this.state.error?.message || safeStr(this.state.error)}
              </pre>

              <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    if (this.props.onClose) this.props.onClose();
                  }}
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 18px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: "500",
                  }}
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Inner presentation component for SF10 Form Preview
 */
function SF10PreviewModalContent({ isOpen, onClose, student, requireOfficialData = false, inline = false, toolbarTarget = null, initialData = null, onDataLoaded }) {
  const identifier = student?.student_id || student?.studentId || student?.student_section_id
    || student?.studentSectionId || student?.LRN || student?.lrn || student?.id;
  const hasFallback = Boolean(student?.name || student?.lrn);
  const [sf10Data, setSf10Data] = useState(initialData);
  const [loading, setLoading] = useState(!initialData && Boolean(identifier));
  const [downloading, setDownloading] = useState(false);
  const [selectedPage, setSelectedPage] = useState(1);
  const [error, setError] = useState(requireOfficialData && !identifier
    ? "A learner identifier is required to load official SF10 details." : null);

  const page1Ref = useRef(null);
  const page2Ref = useRef(null);

  // Reuse this learner's successful load; failed requests are not cached.
  useEffect(() => {
    if (!isOpen || initialData) return;
    let cancelled = false;

    if (identifier) {
      getStudentSF10Details(identifier)
        .then((data) => {
          if (cancelled) return;
          if (requireOfficialData && !data) throw new Error("Official SF10 records are unavailable.");
          if (data) {
            setSf10Data(data);
            setLoading(false);
            onDataLoaded?.(data);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          if (requireOfficialData) {
            setError(inline ? "Failed to load official SF10 details. Select another tab and try again."
              : "Failed to load official SF10 details. Close the preview and try again.");
            return;
          }
          console.warn("Could not load backend SF10 records, using client student record fallback:", err);
          if (!hasFallback) {
            setError("Failed to load official SF10 details.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => { cancelled = true; };
  }, [isOpen, identifier, hasFallback, requireOfficialData, inline, initialData, onDataLoaded]);

  // ESC key listener to dismiss
  useEffect(() => {
    if (inline) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, inline]);

  const getLastNameForFile = () => {
    const nameParts = parseNameParts(student?.name);
    const raw = sf10Data?.learner?.last_name || student?.last_name || student?.lastName || nameParts.last || "STUDENT";
    return safeStr(raw).trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "") || "STUDENT";
  };

  const handlePrint = () => {
    if (loading || (requireOfficialData && (error || !sf10Data))) return;
    window.print();
  };

  const handleDownloadExcel = async () => {
    if (loading || downloading || (requireOfficialData && (error || !sf10Data))) return;
    setDownloading(true);

    try {
      const fileName = `${getLastNameForFile()}_SF10.xlsx`;
      await exportSf10Excel({
        student,
        sf10Data,
        fileName
      });
    } catch (err) {
      console.error("Error generating SF10 Excel:", err);
      alert("Failed to export Excel document. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const actions = <>
    {inline && <div className="sf10-page-navigation" aria-label="SF10 pages">
      <button onClick={() => setSelectedPage(1)} disabled={selectedPage === 1} aria-label="Previous SF10 page" title="Previous page"><ChevronLeft size={16} /></button>
      <span aria-live="polite">Page {selectedPage} of 2</span>
      <button onClick={() => setSelectedPage(2)} disabled={selectedPage === 2} aria-label="Next SF10 page" title="Next page"><ChevronRight size={16} /></button>
    </div>}
    <button className={inline ? "sf9-print-btn" : "sf10-btn sf10-btn-print"} onClick={handlePrint}
      disabled={loading || (requireOfficialData && (Boolean(error) || !sf10Data))} title="Print SF10 document">
      <Printer size={15} /><span>Print</span>
    </button>
    <button className={inline ? "sf9-download-btn" : "sf10-btn sf10-btn-download"}
      onClick={handleDownloadExcel}
      disabled={downloading || loading || (requireOfficialData && (Boolean(error) || !sf10Data))}
      title="Download Form 10 Excel (.xlsx)">
      {downloading ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
      <span>{downloading ? "Generating Excel..." : "Download (.xlsx)"}</span>
    </button>
  </>;

  return (
    <div className={inline ? "sf10-inline" : "sf10-modal-overlay"} onClick={inline ? undefined : onClose}
      role={inline ? "region" : undefined} aria-label={inline ? "Learner's permanent record" : undefined}>
      <div className="sf10-modal-container" onClick={(e) => e.stopPropagation()}>

        {/* Modal Toolbar */}
        {inline ? (toolbarTarget && createPortal(actions, toolbarTarget)) : <div className="sf10-toolbar">
          <div className="sf10-toolbar-title">
            <span>Learner's Permanent Academic Record</span>
            <span className="sf10-toolbar-badge">SF10-JHS</span>
          </div>
          <div className="sf10-toolbar-actions">
            {actions}
            {!inline && <button className="sf10-btn-close" onClick={onClose} title="Close Preview">
              <X size={18} />
            </button>}
          </div>
        </div>}

        {loading && (
          <div className="sf10-loading-skeleton" role="status" aria-label="Loading permanent record" aria-busy="true">
            <div aria-hidden="true">
              <span className="sf10-skeleton-title" />
              {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
            </div>
          </div>
        )}

        {error && (requireOfficialData || (!student?.name && !student?.lrn)) && (
          <div style={{ color: "#f87171", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", padding: "8px 16px", borderRadius: "6px", marginBottom: "12px", fontSize: "12px", width: "100%", maxWidth: "816px", textAlign: "center" }}>
            {error}
          </div>
        )}

        {/* Document Pages Container */}
        <div className={inline ? "sf10-inline-document" : undefined}>
        {!loading && (!requireOfficialData || (!error && sf10Data)) && <SF10Document
          student={student}
          sf10Data={sf10Data}
          page1Ref={page1Ref}
          page2Ref={page2Ref}
          selectedPage={inline ? selectedPage : null}
        />}
        </div>

      </div>
    </div>
  );
}

/**
 * Default export wrapped with ErrorBoundary
 */
export default function SF10PreviewModal(props) {
  if (!props.isOpen) return null;
  const identifier = props.student?.student_id || props.student?.studentId || props.student?.student_section_id
    || props.student?.studentSectionId || props.student?.LRN || props.student?.lrn || props.student?.id;
  return (
    <SF10ErrorBoundary onClose={props.onClose} inline={props.inline}>
      <SF10PreviewModalContent key={`${identifier}:${props.student?.schoolYearId || ""}:${Boolean(props.requireOfficialData)}`} {...props} />
    </SF10ErrorBoundary>
  );
}
