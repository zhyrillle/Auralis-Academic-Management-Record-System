import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  FileQuestion,
  FileText,
  Image as ImageIcon,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import "../../../styles/AttachmentPreviewModal.css";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

function extensionFromName(name = "") {
  return String(name).split(".").pop()?.toLowerCase() || "";
}

function getPreviewKind(attachment) {
  const type = String(attachment?.type || "").toLowerCase();
  const extension = extensionFromName(attachment?.name);

  if (type.startsWith("image/") || IMAGE_EXTENSIONS.includes(extension)) {
    return "image";
  }
  if (type === "application/pdf" || extension === "pdf") {
    return "pdf";
  }
  return "unsupported";
}

function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatFileType(attachment) {
  const type = String(attachment?.type || "").trim();
  if (type) return type;

  const extension = extensionFromName(attachment?.name);
  return extension ? `${extension.toUpperCase()} file` : "File type unavailable";
}

export default function AttachmentPreviewModal({ attachment, onClose }) {
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [imageError, setImageError] = useState(false);
  const previewKind = useMemo(() => getPreviewKind(attachment), [attachment]);

  useEffect(() => {
    if (!attachment) return undefined;

    const previouslyFocusedElement = document.activeElement;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = modalRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], iframe, object, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusableElements?.length) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedElement?.focus?.();
    };
  }, [attachment, onClose]);

  if (!attachment) return null;

  const fileName = attachment.name || "Request attachment";
  const fileMeta = `${formatFileType(attachment)} • ${formatFileSize(attachment.size)}`;
  const hasPreviewableImage = previewKind === "image" && !imageError;

  return createPortal(
    <div
      className="attachment-preview-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="attachment-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attachment-preview-title"
        aria-describedby="attachment-preview-description"
        ref={modalRef}
      >
        <header className="attachment-preview-header">
          <div className="attachment-preview-heading">
            <span className="attachment-preview-file-icon" aria-hidden="true">
              {previewKind === "image" ? <ImageIcon size={20} /> : <FileText size={20} />}
            </span>
            <div>
              <h2 id="attachment-preview-title">{fileName}</h2>
              <p id="attachment-preview-description">{fileMeta}</p>
            </div>
          </div>

          <div className="attachment-preview-header-actions">
            {attachment.url && (
              <a
                className="attachment-preview-download"
                href={attachment.url}
                download={fileName}
                aria-label={`Download ${fileName}`}
              >
                <Download size={17} aria-hidden="true" />
                <span>Download</span>
              </a>
            )}
            <button
              type="button"
              className="attachment-preview-close"
              onClick={onClose}
              aria-label="Close attachment preview"
              ref={closeButtonRef}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        {hasPreviewableImage && (
          <div className="attachment-preview-toolbar" aria-label="Image zoom controls">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
              disabled={zoom <= 0.5}
              aria-label="Zoom out"
            >
              <Minus size={17} aria-hidden="true" />
            </button>
            <span aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
              disabled={zoom >= 3}
              aria-label="Zoom in"
            >
              <Plus size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              disabled={zoom === 1}
              aria-label="Reset zoom"
            >
              <RotateCcw size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="attachment-preview-content">
          {previewKind === "image" && !imageError && (
            <div className="attachment-preview-image-stage">
              <img
                src={attachment.url}
                alt={`Attachment preview: ${fileName}`}
                style={{ transform: `scale(${zoom})` }}
                onError={() => setImageError(true)}
              />
            </div>
          )}

          {previewKind === "pdf" && (
            <object
              className="attachment-preview-pdf"
              data={attachment.url}
              type="application/pdf"
              aria-label={`PDF preview: ${fileName}`}
            >
              <div className="attachment-preview-fallback">
                <FileQuestion size={38} aria-hidden="true" />
                <h3>PDF preview is unavailable</h3>
                <p>Download the attachment to view it with your device’s PDF reader.</p>
              </div>
            </object>
          )}

          {(previewKind === "unsupported" || imageError) && (
            <div className="attachment-preview-fallback">
              <FileQuestion size={42} aria-hidden="true" />
              <h3>Preview unavailable</h3>
              <p>This file type cannot be previewed here. You can still download the original attachment.</p>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
