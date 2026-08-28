import React from "react";
import { Users } from "lucide-react";

export default function AdviserClassCard({
  section,
  subject = "English",
  studentCount = 50,
  entryProgress = 50,
  status = "In Progress",
  onContinueEntry,
}) {
  const safeProgress = Math.min(100, Math.max(0, Number(entryProgress) || 0));

  return (
    <div className="adviser-dashboard__class-card">
      <div className="adviser-dashboard__class-card-header">
        <h4 className="adviser-dashboard__class-card-title">{section}</h4>
        <span className="adviser-dashboard__class-status-badge">{status}</span>
      </div>

      <div className="adviser-dashboard__class-subject">{subject}</div>

      <div className="adviser-dashboard__class-students">
        <Users size={16} className="adviser-dashboard__class-icon" />
        <span>{studentCount} students</span>
      </div>

      <div className="adviser-dashboard__class-progress-wrap">
        <div className="adviser-dashboard__class-progress-label">
          Entry Progress
        </div>
        <div className="adviser-dashboard__class-progress-bar-bg">
          <div
            className="adviser-dashboard__class-progress-bar-fill"
            style={{ width: `${safeProgress}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        className="adviser-dashboard__class-cta-btn"
        onClick={() => onContinueEntry && onContinueEntry(section)}
      >
        CONTINUE ENTRY
      </button>
    </div>
  );
}

