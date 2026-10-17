import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
export default function StudentSelectionTray({
  students,
  onRemove,
  onClear,
  onAssign
}) {
  const [expanded, setExpanded] = useState(false);
  if (!students.length) return null;
  return <aside className="student-selection-tray" aria-label="Selected students">
    {expanded && <div className="student-selection-tray__list">{students.map(student => <span key={student.id}>{student.name}<button type="button" aria-label={`Deselect ${student.name}`} onClick={() => onRemove(student.id)}><X size={12} /></button></span>)}</div>}
    <div className="student-selection-tray__bar"><div><strong aria-live="polite">{students.length} {students.length === 1 ? "student" : "students"} selected</strong>
      <button type="button" className="student-selection-tray__review" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Hide names" : "Review selection"}{expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
      <button type="button" className="student-admin-button" onClick={onClear}>Clear</button>
      <button type="button" className="student-admin-button student-admin-button--gold" onClick={onAssign}><Plus size={15} />Assign selected</button>
    </div>
  </aside>;
}
