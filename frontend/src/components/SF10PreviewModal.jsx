import React, { useState, useEffect, useRef } from "react";
import { X, Printer, Download, FileSpreadsheet, Loader2, AlertCircle } from "lucide-react";
import SF10Document, { safeStr, parseNameParts } from "./SF10Document";
import { exportSf10Excel } from "../utils/exportSf10Excel";
import { generateSF10PdfFromPages } from "../utils/sf10PdfGenerator";
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
function SF10PreviewModalContent({ isOpen, onClose, student }) {
  const [sf10Data, setSf10Data] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const page1Ref = useRef(null);
  const page2Ref = useRef(null);

  // Fetch official SF10 data on open
  useEffect(() => {
    if (!isOpen) return;

    const identifier =
      student?.student_id ||
      student?.studentId ||
      student?.student_section_id ||
      student?.studentSectionId ||
      student?.LRN ||
      student?.lrn ||
      student?.id;

    if (identifier) {
      setLoading(true);
      setError(null);
      getStudentSF10Details(identifier)
        .then((data) => {
          if (data) {
            setSf10Data(data);
          }
        })
        .catch((err) => {
          console.warn("Could not load backend SF10 records, using client student record fallback:", err);
          if (!student?.name && !student?.lrn) {
            setError("Failed to load official SF10 details.");
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, student]);

  // ESC key listener to dismiss
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const getLastNameForFile = () => {
    const nameParts = parseNameParts(student?.name);
    const raw = sf10Data?.learner?.last_name || student?.last_name || student?.lastName || nameParts.last || "STUDENT";
    return safeStr(raw).trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "") || "STUDENT";
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadExcel = async () => {
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

  return (
    <div className="sf10-modal-overlay" onClick={onClose}>
      <div className="sf10-modal-container" onClick={(e) => e.stopPropagation()}>

        {/* Modal Toolbar */}
        <div className="sf10-toolbar">
          <div className="sf10-toolbar-title">
            <span>Learner's Permanent Academic Record</span>
            <span className="sf10-toolbar-badge">SF10-JHS</span>
          </div>
          <div className="sf10-toolbar-actions">
            <button className="sf10-btn sf10-btn-print" onClick={handlePrint} title="Print Document">
              <Printer size={15} />
              <span>Print</span>
            </button>
            <button
              className="sf10-btn sf10-btn-download"
              onClick={handleDownloadExcel}
              disabled={downloading || loading}
              title="Download Form 10 Excel (.xlsx)"
            >
              {downloading ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
              <span>{downloading ? "Generating Excel..." : "Download (.xlsx)"}</span>
            </button>
            <button className="sf10-btn-close" onClick={onClose} title="Close Preview">
              <X size={18} />
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ color: "#ffffff", padding: "14px", display: "flex", gap: "10px", alignItems: "center", justifyContent: "center" }}>
            <Loader2 className="animate-spin" size={20} />
            <span>Loading official SF10 records...</span>
          </div>
        )}

        {error && !student?.name && !student?.lrn && (
          <div style={{ color: "#f87171", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", padding: "8px 16px", borderRadius: "6px", marginBottom: "12px", fontSize: "12px", width: "100%", maxWidth: "816px", textAlign: "center" }}>
            {error}
          </div>
        )}

        {/* Document Pages Container */}
        <SF10Document
          student={student}
          sf10Data={sf10Data}
          page1Ref={page1Ref}
          page2Ref={page2Ref}
        />

      </div>
    </div>
  );
}

/**
 * Default export wrapped with ErrorBoundary
 */
export default function SF10PreviewModal(props) {
  if (!props.isOpen) return null;
  return (
    <SF10ErrorBoundary onClose={props.onClose}>
      <SF10PreviewModalContent {...props} />
    </SF10ErrorBoundary>
  );
}
