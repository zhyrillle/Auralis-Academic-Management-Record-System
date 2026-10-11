import { useState, useEffect } from "react";
import { X, Loader2, ChevronDown } from "lucide-react";

export default function StudentFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  programs = [],
  isSaving = false,
}) {
  const isEdit = Boolean(initialData?.student_id);

  const [formData, setFormData] = useState({
    student_id: "",
    LRN: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    extension_name: "",
    birthdate: "",
    sex: "M",
    street: "",
    barangay: "",
    city: "Gingoog City",
    province: "Misamis Oriental",
    country: "Philippines",
    postal_code: "9014",
    status: "ACTIVE",
    program_id: "4", // Default to EBEC
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        student_id: initialData.student_id ? String(initialData.student_id) : "",
        LRN: initialData.LRN || initialData.lrn || "",
        first_name: initialData.first_name || "",
        middle_name: initialData.middle_name || "",
        last_name: initialData.last_name || "",
        extension_name: initialData.extension_name || "",
        birthdate: initialData.birthdate
          ? new Date(initialData.birthdate).toISOString().split("T")[0]
          : "",
        sex: initialData.sex || "M",
        street: initialData.street || "",
        barangay: initialData.barangay || "",
        city: initialData.city || "Gingoog City",
        province: initialData.province || "Misamis Oriental",
        country: initialData.country || "Philippines",
        postal_code: initialData.postal_code || "9014",
        status: initialData.status ? initialData.status.toUpperCase() : "ACTIVE",
        program_id: initialData.program_id ? String(initialData.program_id) : "4",
      });
      setErrors({});
    } else {
      setFormData({
        student_id: "",
        LRN: "",
        first_name: "",
        middle_name: "",
        last_name: "",
        extension_name: "",
        birthdate: "",
        sex: "M",
        street: "",
        barangay: "",
        city: "Gingoog City",
        province: "Misamis Oriental",
        country: "Philippines",
        postal_code: "9014",
        status: "ACTIVE",
        program_id: "4",
      });
      setErrors({});
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const validate = () => {
    const newErrors = {};
    const lrnClean = String(formData.LRN || "").trim();

    if (!lrnClean) {
      newErrors.LRN = "LRN is required.";
    } else if (!/^\d{12}$/.test(lrnClean)) {
      newErrors.LRN = "LRN must be exactly 12 numeric digits.";
    }

    if (!formData.first_name?.trim()) {
      newErrors.first_name = "First name is required.";
    }

    if (!formData.last_name?.trim()) {
      newErrors.last_name = "Last name is required.";
    }

    if (!formData.sex) {
      newErrors.sex = "Please select sex.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      ...formData,
      LRN: String(formData.LRN).trim(),
      first_name: String(formData.first_name).trim(),
      last_name: String(formData.last_name).trim(),
      middle_name: formData.middle_name ? String(formData.middle_name).trim() : null,
      extension_name: formData.extension_name ? String(formData.extension_name).trim() : null,
      birthdate: formData.birthdate || null,
      program_id: formData.program_id ? Number(formData.program_id) : null,
      status: formData.status || "ACTIVE",
    };

    onSubmit(payload);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="student-modal-card">
        {/* Fixed Header */}
        <div className="student-modal-header">
          <h2>{isEdit ? "Edit Student Record" : "Register New Student"}</h2>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={isSaving}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="student-modal-form">
          <div className="student-modal-body">
            {/* Academic & Identification */}
            <div className="modal-section-title">Academic & Identification</div>
            <div className="student-form-grid three-col">
              <div className="student-form-field">
                <label className="student-form-label" htmlFor="student_id">
                  Student ID
                </label>
                <input
                  id="student_id"
                  type="text"
                  className="student-form-input"
                  placeholder="Auto-generated"
                  value={formData.student_id ? `ID #${formData.student_id}` : ""}
                  disabled
                />
                <div className="student-form-error-slot" />
              </div>

              <div className="student-form-field">
                <label className="student-form-label" htmlFor="LRN">
                  LRN <span className="required">*</span>
                </label>
                <input
                  id="LRN"
                  type="text"
                  maxLength="12"
                  className={`student-form-input${errors.LRN ? " has-error" : ""}`}
                  placeholder="Enter 12-digit LRN"
                  value={formData.LRN}
                  onChange={(e) =>
                    handleChange("LRN", e.target.value.replace(/\D/g, ""))
                  }
                  disabled={isSaving}
                />
                <div className="student-form-error-slot">
                  {errors.LRN && <span className="student-form-error">{errors.LRN}</span>}
                </div>
              </div>

              <div className="student-form-field">
                <label className="student-form-label" htmlFor="program_id">
                  Specialized Program / Track <span className="required">*</span>
                </label>
                <div className="select-wrapper">
                  <select
                    id="program_id"
                    className="student-form-input student-form-select"
                    value={formData.program_id}
                    onChange={(e) => handleChange("program_id", e.target.value)}
                    disabled={isSaving}
                  >
                    {programs.map((p) => (
                      <option key={p.program_id} value={String(p.program_id)}>
                        {p.program_code} - {p.program_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="select-caret" />
                </div>
                <div className="student-form-error-slot" />
              </div>
            </div>

            {/* Basic Information */}
            <div className="modal-section-title">Basic Information</div>
            <div className="student-form-grid three-col">
              <div className="student-form-field">
                <label className="student-form-label" htmlFor="first_name">
                  First Name <span className="required">*</span>
                </label>
                <input
                  id="first_name"
                  type="text"
                  className={`student-form-input${errors.first_name ? " has-error" : ""}`}
                  placeholder="Enter first name"
                  value={formData.first_name}
                  onChange={(e) => handleChange("first_name", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot">
                  {errors.first_name && (
                    <span className="student-form-error">{errors.first_name}</span>
                  )}
                </div>
              </div>

              <div className="student-form-field">
                <label className="student-form-label" htmlFor="middle_name">
                  Middle Name
                </label>
                <input
                  id="middle_name"
                  type="text"
                  className="student-form-input"
                  placeholder="Enter middle name"
                  value={formData.middle_name}
                  onChange={(e) => handleChange("middle_name", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot" />
              </div>

              <div className="student-form-field">
                <label className="student-form-label" htmlFor="last_name">
                  Last Name <span className="required">*</span>
                </label>
                <input
                  id="last_name"
                  type="text"
                  className={`student-form-input${errors.last_name ? " has-error" : ""}`}
                  placeholder="Enter last name"
                  value={formData.last_name}
                  onChange={(e) => handleChange("last_name", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot">
                  {errors.last_name && (
                    <span className="student-form-error">{errors.last_name}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="student-form-grid three-col">
              <div className="student-form-field">
                <label className="student-form-label" htmlFor="extension_name">
                  Name Extension
                </label>
                <input
                  id="extension_name"
                  type="text"
                  className="student-form-input"
                  placeholder="e.g. Jr., Sr., II, III"
                  value={formData.extension_name}
                  onChange={(e) => handleChange("extension_name", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot" />
              </div>

              <div className="student-form-field">
                <label className="student-form-label" htmlFor="birthdate">
                  Birthdate
                </label>
                <input
                  id="birthdate"
                  type="date"
                  className="student-form-input"
                  value={formData.birthdate}
                  onChange={(e) => handleChange("birthdate", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot" />
              </div>

              <div className="student-form-field">
                <label className="student-form-label" htmlFor="sex">
                  Sex <span className="required">*</span>
                </label>
                <div className="select-wrapper">
                  <select
                    id="sex"
                    className="student-form-input student-form-select"
                    value={formData.sex}
                    onChange={(e) => handleChange("sex", e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                  <ChevronDown size={15} className="select-caret" />
                </div>
                <div className="student-form-error-slot" />
              </div>
            </div>

            {/* Residential Address */}
            <div className="modal-section-title">Residential Address</div>
            <div className="student-form-grid">
              <div className="student-form-field">
                <label className="student-form-label" htmlFor="street">
                  Street / Purok
                </label>
                <input
                  id="street"
                  type="text"
                  className="student-form-input"
                  placeholder="Enter street or purok (e.g. Purok 2)"
                  value={formData.street}
                  onChange={(e) => handleChange("street", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot" />
              </div>

              <div className="student-form-field">
                <label className="student-form-label" htmlFor="barangay">
                  Barangay
                </label>
                <input
                  id="barangay"
                  type="text"
                  className="student-form-input"
                  placeholder="Enter barangay (e.g. Barangay 1)"
                  value={formData.barangay}
                  onChange={(e) => handleChange("barangay", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot" />
              </div>
            </div>

            <div className="student-form-grid">
              <div className="student-form-field">
                <label className="student-form-label" htmlFor="city">
                  City / Municipality
                </label>
                <input
                  id="city"
                  type="text"
                  className="student-form-input"
                  placeholder="Enter city (e.g. Gingoog City)"
                  value={formData.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot" />
              </div>

              <div className="student-form-field">
                <label className="student-form-label" htmlFor="province">
                  Province
                </label>
                <input
                  id="province"
                  type="text"
                  className="student-form-input"
                  placeholder="Enter province (e.g. Misamis Oriental)"
                  value={formData.province}
                  onChange={(e) => handleChange("province", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot" />
              </div>
            </div>

            <div className="student-form-grid">
              <div className="student-form-field">
                <label className="student-form-label" htmlFor="country">
                  Country
                </label>
                <input
                  id="country"
                  type="text"
                  className="student-form-input"
                  placeholder="Enter country (default: Philippines)"
                  value={formData.country}
                  onChange={(e) => handleChange("country", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot" />
              </div>

              <div className="student-form-field">
                <label className="student-form-label" htmlFor="postal_code">
                  Postal Code
                </label>
                <input
                  id="postal_code"
                  type="text"
                  className="student-form-input"
                  placeholder="Enter postal code (e.g. 9014)"
                  value={formData.postal_code}
                  onChange={(e) => handleChange("postal_code", e.target.value)}
                  disabled={isSaving}
                />
                <div className="student-form-error-slot" />
              </div>
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="student-modal-footer">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-modal-save"
              disabled={isSaving}
            >
              {isSaving && <Loader2 size={16} className="animate-spin" />}
              {isEdit ? "Update Student" : "Save Student"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
