import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "../../styles/overlayPanel.css";

// Shared native-dialog shell: focus trapping, Escape, backdrop and enter/exit motion.
export default function OverlayPanel({
  isOpen,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  variant = "drawer",
  className = "",
  busy = false,
  error,
  notification
}) {
  const dialog = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return undefined;
    if (isOpen) {
      if (!node.open) node.showModal();
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (node.open) node.close();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [isOpen]);
  if (typeof document === "undefined") return null;
  const requestClose = () => {
    if (!busy) onClose();
  };
  const notificationTray = notification ? <div className="app-overlay__notification-tray">{notification}</div> : null;
  return createPortal(<dialog ref={dialog} className={`app-overlay app-overlay--${variant} ${isOpen ? "is-open" : "is-closing"} ${className}`} aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={event => {
    event.preventDefault();
    requestClose();
  }} onMouseDown={event => {
    if (event.target === event.currentTarget) requestClose();
  }}>
      <section className="app-overlay__panel" aria-busy={busy}>
        <header className="app-overlay__header">
          <div>{eyebrow && <span className="app-overlay__eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button type="button" className="app-overlay__close" onClick={requestClose} disabled={busy} aria-label={`Close ${title}`}><X size={20} /></button>
        </header>
        <div className="app-overlay__body">{error && <p className="app-overlay__error" role="alert">{error}</p>}{children}</div>
        {footer ? <footer className="app-overlay__footer">{footer}{notificationTray}</footer> : notificationTray}
      </section>
    </dialog>, document.body);
}
