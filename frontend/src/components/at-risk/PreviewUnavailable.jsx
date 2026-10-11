export default function PreviewUnavailable({ students = [] }) {
  if (!students.length) return null;
  return (
    <details className="ar-preview-unavailable">
      <summary>Prediction unavailable for {students.length} English learners</summary>
      <p>These learners are excluded from risk counts, not classified as low risk.</p>
      <ul>{students.map(student => <li key={student.id}>
        <strong>{student.name}</strong> · {student.section}: {student.reason}
      </li>)}</ul>
    </details>
  );
}
