import React from "react";
import { Users } from "lucide-react";

export default function AdviserClassCard({
  cls,
  section,
  subject = "English",
  studentCount = 50,
  entryProgress = 50,
  status = "In Progress",
  onContinueEntry,
}) {
  const safeProgress = Math.min(100, Math.max(0, Number(entryProgress) || 0));
  const effectiveSection = section || cls?.sectionName || cls?.section || "Class";
  const effectiveSubject = subject || cls?.subject || "General";
  const effectiveCount = studentCount ?? cls?.studentCount ?? 0;

  return (
    <div className="adviser-dashboard__class-card">
      <div className="adviser-dashboard__class-card-header">
        <h4 className="adviser-dashboard__class-card-title">{effectiveSection}</h4>
        <span className="adviser-dashboard__class-status-badge">{status}</span>
      </div>

      <div className="adviser-dashboard__class-subject">{effectiveSubject}</div>

      <div className="adviser-dashboard__class-students">
        <Users size={16} className="adviser-dashboard__class-icon" />
        <span>{effectiveCount} students</span>
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
        onClick={(e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          if (onContinueEntry) {
            onContinueEntry(
              cls || {
                section: effectiveSection,
                sectionName: effectiveSection,
                subject: effectiveSubject,
                studentCount: effectiveCount,
                entryProgress: safeProgress,
                status,
              }
            );
          }
        }}
      >
        CONTINUE ENTRY
      </button>
    </div>
  );
}

