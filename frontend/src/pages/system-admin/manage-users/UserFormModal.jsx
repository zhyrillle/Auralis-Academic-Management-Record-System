import { useId, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import OverlayPanel from "../../../components/common/OverlayPanel";
import DropdownSelect from "../../../components/common/DropdownSelect";
const roles = ["Subject Teacher", "Principal", "Adviser", "Department Head"];
const optionsFor = (items, key, label) => items.map(item => ({
  value: String(item[key]),
  label: item[label]
}));
function FormSelect({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange
}) {
  const fieldRef = useRef(null);
  return <div className="user-form-field" ref={fieldRef}>
      <span className="user-form-label">{label} <span aria-hidden="true">*</span></span>
      <DropdownSelect label={label} value={value} options={[{
      value: "",
      label: placeholder
    }, ...options]} onChange={nextValue => {
      onChange(nextValue);
      requestAnimationFrame(() => fieldRef.current?.querySelector(".dropdown-select__trigger")?.focus());
    }} disabled={disabled} className="user-form-select" />
    </div>;
}
function FormSkeleton() {
  return <div className="user-form-loading" role="status" aria-label="Loading account and assignment options">
      <div className="user-form-grid" aria-hidden="true">
        {Array.from({
        length: 6
      }, (_, index) => <div className="user-form-field" key={index}>
            <span className="manage-users-skeleton__block user-form-placeholder-label" />
            <span className="manage-users-skeleton__block user-form-placeholder-input" />
          </div>)}
      </div>
      <span className="visually-hidden">Loading account and assignment options.</span>
    </div>;
}
export default function UserFormModal({
  isOpen = false,
  mode,
  data,
  gradeLevels,
  sections,
  departments,
  subjectOfferings,
  users = [],
  loading,
  loadError,
  error,
  saving,
  onRetry,
  onChange,
  onAddAssignment,
  onRemoveAssignment,
  onAssignmentChange,
  onClose,
  onSave
}) {
  const formId = useId();
  const isEdit = mode === "edit";
  const isDepartmentHead = data.role === "Department Head";
  const hasDepartment = ["Department Head", "Subject Teacher", "Adviser"].includes(data.role);
  const hasTeaching = ["Subject Teacher", "Adviser"].includes(data.role);
  const change = (name, value) => onChange({
    target: {
      name,
      value
    }
  });
  const gradeOptions = optionsFor(gradeLevels, "grade_level_id", "grade_level_name");
  const availableDepartments = departments.filter(dept => {
    if (!isDepartmentHead) return true;

    // Filter out if assigned to another user via metadata
    if (dept.head_user_id && String(dept.head_user_id) !== String(data.user_id || "")) {
      return false;
    }

    // Filter out if assigned to another user in users array
    if (Array.isArray(users)) {
      const hasOtherHead = users.some(u => {
        if (String(u.user_id) === String(data.user_id || "")) return false;
        const role = (u.display_role || u.role || "").toLowerCase().trim();
        const isHead = role === "department head" || role === "department_head" || role === "dept_head";
        return isHead && String(u.department_id || "") === String(dept.department_id);
      });
      if (hasOtherHead) return false;
    }
    return true;
  });
  const availableAdvisorySections = sections.filter(section => String(section.grade_level_id) === String(data.adviser_grade_level_id)).filter(section => {
    // Filter out if assigned to another user via metadata
    if (section.adviser_user_id && String(section.adviser_user_id) !== String(data.user_id || "")) {
      return false;
    }

    // Filter out if assigned to another user in users array
    if (Array.isArray(users)) {
      const hasOtherAdviser = users.some(u => String(u.user_id) !== String(data.user_id || "") && String(u.adviser_section_id || "") === String(section.section_id));
      if (hasOtherAdviser) return false;
    }
    return true;
  });
  return <OverlayPanel isOpen={isOpen} onClose={onClose} busy={saving} title={isEdit ? "Edit User" : "Add New User"} eyebrow="Account management" description="Manage account details, access, and class assignments." className="user-management-overlay user-form-drawer" footer={<>
        <span className="user-form-footer-note">{saving ? "Saving account…" : "Review account details before saving."}</span>
        <div className="user-form-footer-actions">
          <button type="button" className="user-form-cancel" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" form={formId} className="user-form-submit" disabled={saving || loading || Boolean(loadError)}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
          </button>
        </div>
      </>}>
      <form id={formId} className="user-form-layout" noValidate onSubmit={event => {
      event.preventDefault();
      if (!saving && !loading && !loadError) onSave();
    }}>
          <div className="user-form-body">
            {loading ? <FormSkeleton /> : loadError ? <div className="user-form-load-error" role="alert">
                <strong>Unable to prepare the user form</strong>
                <p>{loadError}</p>
                <button type="button" onClick={onRetry}>Try Again</button>
              </div> : <fieldset className="user-form-fields" disabled={saving}>
                {error && <div className="user-form-error" role="alert">{error}</div>}
                <section className="user-form-section" aria-labelledby="user-account-heading">
                  <div className="user-form-section-heading">
                    <h3 id="user-account-heading">Account Details</h3>
                    <p>Required fields are marked with an asterisk (*).</p>
                  </div>
                  <div className="user-form-grid">
                    {[["first_name", "First Name", "text", "Enter first name", "given-name"], ["last_name", "Last Name", "text", "Enter last name", "family-name"], ["email", "Email", "email", "Enter email address", "email"], ["password", "Password", "password", isEdit ? "Leave blank to keep current password" : "Enter password", "new-password"]].map(([name, label, type, placeholder, autoComplete]) => <div className="user-form-field" key={name}>
                        <label className="user-form-label" htmlFor={`user-form-${name}`}>
                          {label}{(name !== "password" || !isEdit) && <span aria-hidden="true"> *</span>}
                        </label>
                        <input id={`user-form-${name}`} name={name} type={type} value={data[name]} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} required={name !== "password" || !isEdit} />
                        {name === "password" && isEdit && <small>Leave blank to keep the current password.</small>}
                      </div>)}
                  </div>
                </section>
                <section className="user-form-section" aria-labelledby="user-role-heading">
                  <div className="user-form-section-heading">
                    <h3 id="user-role-heading">Role &amp; Department</h3>
                    <p>Select the account's role and assigned area.</p>
                  </div>
                  <div className="user-form-grid">
                    <FormSelect label="Role" value={data.role} options={roles.map(role => ({
                value: role,
                label: role
              }))} placeholder="Select role" disabled={saving} onChange={value => change("role", value)} />
                    {hasDepartment && <FormSelect label="Department / Assigned Area" value={data.department_id} options={optionsFor(availableDepartments, "department_id", "department_name")} placeholder="Select department" disabled={saving || !availableDepartments.length} onChange={value => change("department_id", value)} />}
                  </div>
                  {hasDepartment && !availableDepartments.length && <p className="user-form-help">
                      {isDepartmentHead ? "All departments currently have an assigned Department Head." : "No departments are currently available."}
                    </p>}
                </section>
                {(hasTeaching || data.role === "Adviser") && <section className="user-form-section" aria-labelledby="user-assignments-heading">
                    <div className="user-form-section-heading">
                      <h3 id="user-assignments-heading">Assignments</h3>
                      <p>Assign the advisory section and subject classes for this account.</p>
                    </div>
                    {data.role === "Adviser" && <div className="user-form-advisory">
                        <h4>Advisory Section</h4>
                        <div className="user-form-grid">
                          <FormSelect label="Advisory Grade Level" value={data.adviser_grade_level_id} options={gradeOptions} placeholder="Select grade level" disabled={saving || !gradeOptions.length} onChange={value => change("adviser_grade_level_id", value)} />
                          <FormSelect label="Advisory Section" value={data.adviser_section_id} options={optionsFor(availableAdvisorySections, "section_id", "section_name")} placeholder="Select section" disabled={saving || !data.adviser_grade_level_id} onChange={value => change("adviser_section_id", value)} />
                        </div>
                        {data.adviser_grade_level_id && !availableAdvisorySections.length && <p className="user-form-help" style={{
                marginTop: "8px"
              }}>
                            All sections for this grade level already have an assigned adviser.
                          </p>}
                      </div>}
                    {hasTeaching && <>
                      <div className="user-form-assignment-heading">
                        <h4>Teaching Subject Assignments</h4>
                        <button type="button" className="user-form-add" onClick={onAddAssignment} disabled={saving}>
                          <Plus size={16} aria-hidden="true" /> Add Subject Class
                        </button>
                      </div>
                      {data.teaching_assignments.length === 0 ? <p className="user-form-empty">No subject classes assigned. Use Add Subject Class to create an assignment.</p> : data.teaching_assignments.map((assignment, index) => {
                          const availableOfferings = subjectOfferings.filter(offering => {
                            // Must belong to the chosen section
                            if (String(offering.section_id) !== String(assignment.section_id)) return false;

                            // If this offering is already the selected value for THIS row, keep it so it displays
                            if (assignment.subject_offering_id && String(offering.subject_offering_id) === String(assignment.subject_offering_id)) {
                              return true;
                            }

                            // Filter out if assigned to another user via metadata
                            if (offering.teacher_user_id && String(offering.teacher_user_id) !== String(data.user_id || "")) {
                              return false;
                            }

                            // Filter out if assigned to another active user in the users array
                            if (Array.isArray(users)) {
                              const isHandledByOtherUser = users.some(u => {
                                if (String(u.user_id) === String(data.user_id || "")) return false;
                                const status = String(u.account_status || "active").toLowerCase();
                                if (status === "inactive" || status === "archived") return false;
                                return Array.isArray(u.teaching_assignments) && u.teaching_assignments.some(
                                  ta => String(ta.subject_offering_id) === String(offering.subject_offering_id)
                                );
                              });
                              if (isHandledByOtherUser) return false;
                            }

                            // Filter out if selected in another row within this form
                            const isSelectedInOtherRow = data.teaching_assignments.some((otherAssign, otherIndex) => {
                              if (otherIndex === index) return false;
                              return String(otherAssign.subject_offering_id) === String(offering.subject_offering_id);
                            });
                            if (isSelectedInOtherRow) return false;

                            return true;
                          });

                          const noSubjectsAvailable = Boolean(assignment.section_id) && availableOfferings.length === 0 && !assignment.subject_offering_id;

                          return (
                            <div className="user-form-assignment" key={index}>
                              <div className="user-form-assignment-label">
                                <button type="button" className="user-form-remove" disabled={saving} aria-label={`Remove class assignment ${index + 1}`} onClick={() => onRemoveAssignment(index)}>
                                  <Trash2 size={15} aria-hidden="true" /> Remove
                                </button>
                              </div>
                              <div className="user-form-assignment-grid">
                                <FormSelect label="Grade Level" value={assignment.grade_level_id} options={gradeOptions} placeholder="Select grade" disabled={saving || !gradeOptions.length} onChange={value => onAssignmentChange(index, "grade_level_id", value)} />
                                <FormSelect label="Section" value={assignment.section_id} options={optionsFor(sections.filter(section => String(section.grade_level_id) === String(assignment.grade_level_id)), "section_id", "section_name")} placeholder="Select section" disabled={saving || !assignment.grade_level_id} onChange={value => onAssignmentChange(index, "section_id", value)} />
                                <FormSelect
                                  label="Subject"
                                  value={assignment.subject_offering_id}
                                  options={availableOfferings.map(offering => ({
                                    value: String(offering.subject_offering_id),
                                    label: offering.subject_name + (offering.subject_code ? ` (${offering.subject_code})` : "")
                                  }))}
                                  placeholder={noSubjectsAvailable ? "No available subjects" : "Select subject"}
                                  disabled={saving || !assignment.section_id || noSubjectsAvailable}
                                  onChange={value => onAssignmentChange(index, "subject_offering_id", value)}
                                />
                              </div>
                              {noSubjectsAvailable && (
                                <p className="user-form-help" style={{ marginTop: "6px" }}>
                                  All subjects for this section are already handled by other teachers.
                                </p>
                              )}
                            </div>
                          );
                        })}
                    </>}
                  </section>}
              </fieldset>}
          </div>

      </form>
    </OverlayPanel>;
}
