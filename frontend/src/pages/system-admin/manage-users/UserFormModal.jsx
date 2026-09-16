import { useEffect, useRef } from "react";
import { Plus, Trash2, UserRoundPlus, X } from "lucide-react";
import DropdownSelect from "../../../components/common/DropdownSelect";

const roles = ["Subject Teacher", "Principal", "Adviser", "Department Head"];
const optionsFor = (items, key, label) =>
  items.map((item) => ({ value: String(item[key]), label: item[label] }));

function FormSelect({ label, value, options, placeholder, disabled, onChange }) {
  const fieldRef = useRef(null);
  return (
    <div className="user-form-field" ref={fieldRef}>
      <span className="user-form-label">{label} <span aria-hidden="true">*</span></span>
      <DropdownSelect
        label={label}
        value={value}
        options={[{ value: "", label: placeholder }, ...options]}
        onChange={(nextValue) => {
          onChange(nextValue);
          requestAnimationFrame(() => fieldRef.current?.querySelector(".dropdown-select__trigger")?.focus());
        }}
        disabled={disabled}
        className="user-form-select"
      />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="user-form-loading" role="status" aria-label="Loading account and assignment options">
      <div className="user-form-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="user-form-field" key={index}>
            <span className="manage-users-skeleton__block user-form-placeholder-label" />
            <span className="manage-users-skeleton__block user-form-placeholder-input" />
          </div>
        ))}
      </div>
      <span className="visually-hidden">Loading account and assignment options.</span>
    </div>
  );
}

export default function UserFormModal({
  mode, data, gradeLevels, sections, departments, subjectOfferings,
  loading, loadError, error, saving, onRetry, onChange,
  onAddAssignment, onRemoveAssignment, onAssignmentChange, onClose, onSave,
}) {
  const dialogRef = useRef(null);
  const isEdit = mode === "edit";
  const hasDepartment = ["Department Head", "Subject Teacher", "Adviser"].includes(data.role);
  const hasTeaching = ["Subject Teacher", "Adviser"].includes(data.role);
  const change = (name, value) => onChange({ target: { name, value } });
  const gradeOptions = optionsFor(gradeLevels, "grade_level_id", "grade_level_name");

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector(".user-management-page .add-user-btn")?.focus();
    };
  }, []);

  const handleKeyDown = (event) => {
    const dialog = dialogRef.current;
    if (event.key === "Escape") {
      // DropdownSelect handles Escape on window; leave the dialog open for that press.
      if (dialog.querySelector('[aria-expanded="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (!saving) onClose();
    }
    if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
      )].filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="user-form-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section
        className="user-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-form-title"
        aria-describedby="user-form-description"
        aria-busy={loading || saving}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <header className="user-form-header">
          <div className="user-form-heading">
            <span className="user-form-icon"><UserRoundPlus size={22} aria-hidden="true" /></span>
            <div>
              <h2 id="user-form-title">{isEdit ? "Edit User" : "Add New User"}</h2>
              <p id="user-form-description">Manage account details, access, and class assignments.</p>
            </div>
          </div>
          <button className="user-form-close" type="button" onClick={onClose} disabled={saving} aria-label="Close user form">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <form className="user-form-layout" noValidate onSubmit={(event) => {
          event.preventDefault();
          if (!saving && !loading && !loadError) onSave();
        }}>
          <div className="user-form-body">
            {loading ? <FormSkeleton /> : loadError ? (
              <div className="user-form-load-error" role="alert">
                <strong>Unable to prepare the user form</strong>
                <p>{loadError}</p>
                <button type="button" onClick={onRetry}>Try Again</button>
              </div>
            ) : (
              <fieldset className="user-form-fields" disabled={saving}>
                {error && <div className="user-form-error" role="alert">{error}</div>}
                <section className="user-form-section" aria-labelledby="user-account-heading">
                  <div className="user-form-section-heading">
                    <h3 id="user-account-heading">Account Details</h3>
                    <p>Required fields are marked with an asterisk (*).</p>
                  </div>
                  <div className="user-form-grid">
                    {[
                      ["first_name", "First Name", "text", "Enter first name", "given-name"],
                      ["last_name", "Last Name", "text", "Enter last name", "family-name"],
                      ["email", "Email", "email", "Enter email address", "email"],
                      ["password", "Password", "password", isEdit ? "Leave blank to keep current password" : "Enter password", "new-password"],
                    ].map(([name, label, type, placeholder, autoComplete]) => (
                      <div className="user-form-field" key={name}>
                        <label className="user-form-label" htmlFor={`user-form-${name}`}>
                          {label}{(name !== "password" || !isEdit) && <span aria-hidden="true"> *</span>}
                        </label>
                        <input id={`user-form-${name}`} name={name} type={type}
                          value={data[name]} onChange={onChange} placeholder={placeholder}
                          autoComplete={autoComplete} required={name !== "password" || !isEdit} />
                        {name === "password" && isEdit && <small>Leave blank to keep the current password.</small>}
                      </div>
                    ))}
                  </div>
                </section>
                <section className="user-form-section" aria-labelledby="user-role-heading">
                  <div className="user-form-section-heading">
                    <h3 id="user-role-heading">Role &amp; Department</h3>
                    <p>Select the account's role and assigned area.</p>
                  </div>
                  <div className="user-form-grid">
                    <FormSelect label="Role" value={data.role} options={roles.map((role) => ({ value: role, label: role }))}
                      placeholder="Select role" disabled={saving} onChange={(value) => change("role", value)} />
                    {hasDepartment && <FormSelect label="Department / Assigned Area" value={data.department_id}
                      options={optionsFor(departments, "department_id", "department_name")} placeholder="Select department"
                      disabled={saving || !departments.length} onChange={(value) => change("department_id", value)} />}
                  </div>
                  {hasDepartment && !departments.length && <p className="user-form-help">No departments are currently available.</p>}
                </section>
                {(hasTeaching || data.role === "Adviser") && (
                  <section className="user-form-section" aria-labelledby="user-assignments-heading">
                    <div className="user-form-section-heading">
                      <h3 id="user-assignments-heading">Assignments</h3>
                      <p>Assign the advisory section and subject classes for this account.</p>
                    </div>
                    {data.role === "Adviser" && (
                      <div className="user-form-advisory">
                        <h4>Advisory Section</h4>
                        <div className="user-form-grid">
                          <FormSelect label="Advisory Grade Level" value={data.adviser_grade_level_id} options={gradeOptions}
                            placeholder="Select grade level" disabled={saving || !gradeOptions.length}
                            onChange={(value) => change("adviser_grade_level_id", value)} />
                          <FormSelect label="Advisory Section" value={data.adviser_section_id}
                            options={optionsFor(sections.filter((section) => String(section.grade_level_id) === String(data.adviser_grade_level_id)), "section_id", "section_name")}
                            placeholder="Select section" disabled={saving || !data.adviser_grade_level_id}
                            onChange={(value) => change("adviser_section_id", value)} />
                        </div>
                      </div>
                    )}
                    {hasTeaching && <>
                      <div className="user-form-assignment-heading">
                        <h4>Teaching Subject Assignments</h4>
                        <button type="button" className="user-form-add" onClick={onAddAssignment} disabled={saving}>
                          <Plus size={16} aria-hidden="true" /> Add Subject Class
                        </button>
                      </div>
                      {data.teaching_assignments.length === 0 ? (
                        <p className="user-form-empty">No subject classes assigned. Use Add Subject Class to create an assignment.</p>
                      ) : data.teaching_assignments.map((assignment, index) => (
                        <div className="user-form-assignment" key={index}>
                          <div className="user-form-assignment-label">
                            <strong>Class {index + 1}</strong>
                            <button type="button" className="user-form-remove" disabled={saving}
                              aria-label={`Remove class ${index + 1}`} onClick={() => onRemoveAssignment(index)}>
                              <Trash2 size={15} aria-hidden="true" /> Remove
                            </button>
                          </div>
                          <div className="user-form-assignment-grid">
                            <FormSelect label={`Class ${index + 1} grade level`} value={assignment.grade_level_id} options={gradeOptions}
                              placeholder="Select grade" disabled={saving || !gradeOptions.length}
                              onChange={(value) => onAssignmentChange(index, "grade_level_id", value)} />
                            <FormSelect label={`Class ${index + 1} section`} value={assignment.section_id}
                              options={optionsFor(sections.filter((section) => String(section.grade_level_id) === String(assignment.grade_level_id)), "section_id", "section_name")}
                              placeholder="Select section" disabled={saving || !assignment.grade_level_id}
                              onChange={(value) => onAssignmentChange(index, "section_id", value)} />
                            <FormSelect label={`Class ${index + 1} subject`} value={assignment.subject_offering_id}
                              options={subjectOfferings.filter((offering) => String(offering.section_id) === String(assignment.section_id))
                                .map((offering) => ({ value: String(offering.subject_offering_id), label: offering.subject_name + (offering.subject_code ? ` (${offering.subject_code})` : "") }))}
                              placeholder="Select subject" disabled={saving || !assignment.section_id}
                              onChange={(value) => onAssignmentChange(index, "subject_offering_id", value)} />
                          </div>
                        </div>
                      ))}
                    </>}
                  </section>
                )}
              </fieldset>
            )}
          </div>
          <footer className="user-form-footer">
            <span>{saving ? "Saving account…" : "Review account details before saving."}</span>
            <div>
              <button type="button" className="user-form-cancel" disabled={saving} onClick={onClose}>Cancel</button>
              <button type="submit" className="user-form-submit" disabled={saving || loading || Boolean(loadError)}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
