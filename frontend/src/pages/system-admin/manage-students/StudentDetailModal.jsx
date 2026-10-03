import { X } from "lucide-react";

export default function StudentDetailModal({ isOpen, onClose, student }) {
  if (!isOpen || !student) return null;

  const fullName =
    student.name ||
    `${student.first_name || ""} ${student.middle_name || ""} ${student.last_name || ""} ${student.extension_name || ""}`.trim();

  const formattedBirthdate = student.birthdate
    ? new Date(student.birthdate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Not provided";

  const calculateAge = (dob) => {
    if (!dob) return "N/A";
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age > 0 ? `${age} years old` : "N/A";
  };

  const fullAddress = [
    student.street,
    student.barangay,
    student.city,
    student.province,
    student.country,
    student.postal_code,
  ]
    .filter(Boolean)
    .join(", ") || "No address on record";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="student-modal-card">
        {/* Header */}
        <div className="student-modal-header">
          <h2>Student Profile Details</h2>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="student-modal-body">
          {/* Section: Academic Information */}
          <div className="modal-section-title">Academic Information</div>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Learner Reference Number (LRN)</span>
              <span className="detail-value">
                <span className="lrn-badge">{student.LRN || student.lrn || "N/A"}</span>
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Current Grade Level</span>
              <span className="detail-value">
                <span className="badge-pill badge-grade">
                  {student.gradeLevel || student.grade_level_name || "Unassigned"}
                </span>
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Assigned Section</span>
              <span className="detail-value">
                <span className="badge-pill badge-section">
                  {student.section || student.section_name || "Unassigned"}
                </span>
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Curriculum Program</span>
              <span className="detail-value">
                <span className="badge-pill badge-program">
                  {student.program_code
                    ? `${student.program_code} - ${student.program_name || ""}`
                    : "EBEC - General"}
                </span>
              </span>
            </div>
          </div>

          {/* Section: Personal Information */}
          <div className="modal-section-title">Personal Details</div>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Full Name</span>
              <span className="detail-value">{fullName}</span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Biological Sex</span>
              <span className="detail-value">
                {student.sex === "M"
                  ? "Male"
                  : student.sex === "F"
                  ? "Female"
                  : student.sex || "N/A"}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Birthdate</span>
              <span className="detail-value">{formattedBirthdate}</span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Age</span>
              <span className="detail-value">{calculateAge(student.birthdate)}</span>
            </div>
          </div>

          {/* Section: Residential Address */}
          <div className="modal-section-title">Residential Address</div>
          <div className="detail-grid">
            <div className="detail-item detail-full-address">
              <span className="detail-label">Complete Address</span>
              <span className="detail-value">{fullAddress}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="student-modal-footer">
          <button type="button" className="btn-modal-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
