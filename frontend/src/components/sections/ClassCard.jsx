import { Eye, FileSpreadsheet, Edit2 } from "lucide-react";

export default function ClassCard({ cls, onView, onGradingSheet, onEdit }) {
  const isAdvisory = cls.classType === "Advisory Class";

  return (
    <div className={`class-card ${isAdvisory ? "advisory" : ""}`}>
      <div>
        <div className="class-card-header">
          <h3 className="class-section-name">{cls.sectionName}</h3>
          <span className="class-grade-badge">{cls.gradeLevel}</span>
        </div>
        <div className="class-subject">{cls.subject}</div>
        <div className="class-type-tag">{cls.classType}</div>
      </div>

      <div className="class-card-actions">
        <button className="action-btn btn-view" onClick={() => onView(cls)}>
          <Eye size={16} />
          <span>View</span>
        </button>

        <button
          className="action-btn btn-icon grading-sheet-trigger"
          title="Grading Sheet"
          onClick={() => onGradingSheet(cls)}
        >
          <FileSpreadsheet size={18} />
        </button>

        <button
          className="action-btn btn-icon edit-trigger"
          title="Edit Details"
          onClick={() => onEdit(cls)}
        >
          <Edit2 size={16} />
        </button>
      </div>
    </div>
  );
}
