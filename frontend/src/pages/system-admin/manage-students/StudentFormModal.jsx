import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import OverlayPanel from "../../../components/common/OverlayPanel";
import DropdownSelect from "../../../components/common/DropdownSelect";
function initialValues(student) {
  const date = student?.birthdate ? new Date(student.birthdate) : null;
  return {
    student_id: student?.student_id ? String(student.student_id) : "",
    LRN: String(student?.LRN || student?.lrn || ""),
    first_name: student?.first_name || "",
    middle_name: student?.middle_name || "",
    last_name: student?.last_name || "",
    extension_name: student?.extension_name || "",
    birthdate: date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "",
    sex: student?.sex || "M",
    street: student?.street || "",
    barangay: student?.barangay || "",
    city: student?.city || "Gingoog City",
    province: student?.province || "Misamis Oriental",
    country: student?.country || "Philippines",
    postal_code: student?.postal_code || "9014",
    status: String(student?.status || "ACTIVE").toUpperCase(),
    program_id: String(student?.program_id || "4")
  };
}
function InputField({
  field,
  label,
  value,
  onChange,
  disabled,
  error,
  required,
  type = "text",
  ...props
}) {
  const id = useId();
  return <div className="student-admin-field"><label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    <input id={id} name={field} value={value} onChange={event => onChange(field, event.target.value)} disabled={disabled} type={type} aria-required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />
    {error && <span id={`${id}-error`} className="student-admin-field-error">{error}</span>}
  </div>;
}
export default function StudentFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  programs = [],
  isSaving = false,
  errorMessage
}) {
  const [state, setState] = useState(() => ({
    values: initialValues(initialData),
    errors: {}
  }));
  const formId = useId();
  const programId = useId();
  const sexId = useId();
  const isEdit = Boolean(initialData?.student_id || initialData?.id);
  useEffect(() => {
    if (!isOpen) return;
    // Reset only on opening, so the closing transition retains its content.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({
      values: initialValues(initialData),
      errors: {}
    });
  }, [initialData, isOpen]);
  const change = (field, value) => setState(previous => ({
    ...previous,
    values: {
      ...previous.values,
      [field]: value
    },
    errors: {
      ...previous.errors,
      [field]: ""
    }
  }));
  const submit = event => {
    event.preventDefault();
    if (isSaving) return;
    const values = state.values;
    const errors = {};
    if (!/^\d{12}$/.test(values.LRN.trim())) errors.LRN = "Enter a 12-digit LRN.";
    if (!values.first_name.trim()) errors.first_name = "First name is required.";
    if (!values.last_name.trim()) errors.last_name = "Last name is required.";
    if (!values.sex) errors.sex = "Select the student’s sex.";
    if (Object.keys(errors).length) {
      setState(previous => ({
        ...previous,
        errors
      }));
      event.currentTarget.elements.namedItem(Object.keys(errors)[0])?.focus();
      return;
    }
    onSubmit({
      ...values,
      LRN: values.LRN.trim(),
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      middle_name: values.middle_name.trim() || null,
      extension_name: values.extension_name.trim() || null,
      birthdate: values.birthdate || null,
      program_id: values.program_id ? Number(values.program_id) : null
    });
  };
  const input = (field, label, props = {}) => <InputField key={field} field={field} label={label} value={state.values[field]} onChange={change} disabled={isSaving} error={state.errors[field]} {...props} />;
  return <OverlayPanel isOpen={isOpen} onClose={onClose} busy={isSaving} title={isEdit ? "Edit student" : "Add student"} eyebrow="Learner profile" description="Maintain the student’s profile here. Grade and section assignments are handled separately." className="student-profile-drawer" footer={<><button type="button" className="student-admin-button" disabled={isSaving} onClick={onClose}>Cancel</button>
      <button type="submit" form={formId} className="student-admin-button student-admin-button--primary" aria-busy={isSaving} disabled={isSaving}>{isSaving && <Loader2 size={15} className="student-admin-spinner" aria-hidden="true" />}{isSaving ? "Saving…" : isEdit ? "Update student" : "Save student"}</button></>}>
    {errorMessage && <p role="alert" className="student-admin-field-error">{errorMessage}</p>}
    <form id={formId} onSubmit={submit} noValidate className="student-admin-form student-profile-form">
        <section className="student-admin-form-section"><h3>Identification & curriculum</h3><p>Required fields are marked with an asterisk.</p>
          <div className="student-admin-form-grid">{input("LRN", "Learner Reference Number", {
            required: true,
            inputMode: "numeric",
            maxLength: 12,
            placeholder: "12-digit LRN"
          })}
            <div className="student-admin-field"><label htmlFor={programId}>Curriculum program</label><DropdownSelect id={programId} label="Curriculum program" value={state.values.program_id} disabled={isSaving} options={programs.map(program => ({
              value: String(program.program_id),
              label: `${program.program_code} · ${program.program_name}`
            }))} onChange={value => change("program_id", value)} /></div></div>
        </section>
        <section className="student-admin-form-section"><h3>Personal information</h3><p>Use the learner’s official school records.</p>
          <div className="student-admin-form-grid">{input("first_name", "First name", {
            required: true
          })}{input("last_name", "Last name", {
            required: true
          })}
            {input("middle_name", "Middle name")}{input("extension_name", "Extension name", {
            placeholder: "e.g. Jr."
          })}{input("birthdate", "Birthdate", {
            type: "date"
          })}
            <div className="student-admin-field"><label htmlFor={sexId}>Sex *</label><DropdownSelect id={sexId} label="Sex" value={state.values.sex} disabled={isSaving} options={[{
              value: "M",
              label: "Male"
            }, {
              value: "F",
              label: "Female"
            }]} onChange={value => change("sex", value)} /></div>
          </div>
        </section>
      <section className="student-admin-form-section"><h3>Residential address</h3><p>Keep contact and address details current.</p>
        <div className="student-admin-form-grid">{input("street", "Street / Purok")}{input("barangay", "Barangay")}{input("city", "City / Municipality")}{input("province", "Province")}{input("country", "Country")}{input("postal_code", "Postal code")}</div>
      </section>
    </form>
  </OverlayPanel>;
}
