import { CheckCircle2, X } from "lucide-react";
import "../../styles/toast.css";

export default function Toast({
  message,
  onDismiss,
  className = "",
  icon: Icon = CheckCircle2,
  variant = "success",
}) {
  if (!message) {
    return null;
  }

  const classes = ["app-toast", `app-toast--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="status" aria-live="polite">
      {Icon && <Icon size={18} aria-hidden="true" />}
      <span className="app-toast__message">{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="app-toast__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

