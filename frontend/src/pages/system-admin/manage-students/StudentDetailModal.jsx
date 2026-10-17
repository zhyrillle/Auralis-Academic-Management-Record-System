import { UserRound, Pencil } from "lucide-react";
import OverlayPanel from "../../../components/common/OverlayPanel";
import MaskedLrn from "../../../components/common/MaskedLrn";
import { formatSectionGrade } from "../../../utils/studentSections";
export default function StudentDetailModal({
  isOpen,
  onClose,
  student,
  onEdit
}) {
  const fullName = student?.name || [student?.first_name, student?.middle_name, student?.last_name, student?.extension_name].filter(Boolean).join(" ");
  const birth = student?.birthdate ? new Date(student.birthdate) : null;
  const birthdate = birth && Number.isFinite(birth.getTime()) ? birth.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }) : "Not provided";
  const address = [student?.street, student?.barangay, student?.city, student?.province, student?.country, student?.postal_code].filter(Boolean).join(", ") || "No address on record";
  const groups = [{
    title: "Academic information",
    fields: [["LRN", <MaskedLrn key="lrn" lrn={student?.LRN || student?.lrn} maskedLrn={student?.masked_lrn} showToggle allowCopy />], ["Grade level", formatSectionGrade(student?.gradeLevel || student?.grade_level_name, student?.grade_level_id)], ["Section", student?.section || student?.section_name || "Unassigned"], ["Curriculum program", student?.program_code || "EBEC"], ["Status", student?.status || "Active"]]
  }, {
    title: "Personal information",
    fields: [["Full name", fullName], ["Sex", student?.sex === "M" ? "Male" : student?.sex === "F" ? "Female" : student?.sex], ["Birthdate", birthdate]]
  }, {
    title: "Residential address",
    fields: [["Complete address", address]]
  }];
  return <OverlayPanel isOpen={isOpen} onClose={onClose} title="Student profile" eyebrow="Learner details" description="A read-only view of the learner’s recorded information." className="student-profile-drawer" footer={<><button type="button" className="student-admin-button" onClick={onClose}>Close</button>{onEdit && <button type="button" className="student-admin-button student-admin-button--primary" onClick={onEdit}><Pencil size={15} />Edit profile</button>}</>}>
    <div className="student-profile-identity"><span><UserRound size={25} /></span><div><h3>{fullName}</h3><p>{student?.program_code || "EBEC"} · {student?.section || student?.section_name || "No section assigned"}</p></div></div>
    {groups.map(group => <section className="student-profile-group" key={group.title}><h3>{group.title}</h3><dl>{group.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>)}</dl></section>)}
  </OverlayPanel>;
}
