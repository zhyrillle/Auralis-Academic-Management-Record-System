import { useId } from "react";
import DropdownSelect from "../../../components/common/DropdownSelect";
import { SECTION_PROGRAMS } from "../../../utils/studentSections";
export default function SectionFormFields({
  value,
  onChange,
  gradeLevels,
  disabled
}) {
  const id = useId();
  const update = patch => onChange({
    ...value,
    ...patch
  });
  return <div className="student-admin-form">
    <div className="student-admin-field"><label htmlFor={`${id}-name`}>Section name <span aria-hidden="true">*</span></label>
      <input id={`${id}-name`} required placeholder="e.g. Banana" value={value.name} onChange={event => update({
        name: event.target.value
      })} disabled={disabled} /></div>
    <div className="student-admin-field"><label htmlFor={`${id}-grade`}>Grade level</label>
      <DropdownSelect id={`${id}-grade`} label="Section grade level" value={String(value.grade_level_id)} options={gradeLevels.map(grade => ({
        value: String(grade.id),
        label: grade.label
      }))} onChange={id => update({
        grade_level_id: Number(id),
        level: gradeLevels.find(grade => String(grade.id) === id)?.name || "G7"
      })} disabled={disabled} /></div>
    <section className="student-admin-form-section"><h3>Curriculum program</h3><p>Regular sections follow EBEC. Enable a specialization when needed.</p>
      <label className="student-admin-check"><input type="checkbox" checked={value.is_specialized} onChange={event => update({
          is_specialized: event.target.checked
        })} disabled={disabled} />Specialized program</label>
      {value.is_specialized && <div className="student-admin-field section-specialization-field"><label htmlFor={`${id}-specialization`}>Specialization</label>
        <DropdownSelect id={`${id}-specialization`} label="Specialization" options={SECTION_PROGRAMS} value={value.program_id} onChange={program_id => update({
          program_id
        })} disabled={disabled} /></div>}
    </section>
  </div>;
}
