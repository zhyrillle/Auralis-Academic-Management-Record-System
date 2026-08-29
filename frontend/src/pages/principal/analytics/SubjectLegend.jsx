export default function SubjectLegend({ subjects, selectedIds, onToggle, onAll, onNone }) {
  return (
    <div className="pa-legend-row">
      <div className="pa-legend" aria-label="Visible subjects">
        {subjects.map((subject) => {
          const selected = selectedIds.includes(subject.id);
          return (
            <button
              key={subject.id}
              type="button"
              className={selected ? "is-selected" : ""}
              onClick={() => onToggle(subject.id)}
              aria-pressed={selected}
            >
              <span style={{ "--legend-color": subject.color }} aria-hidden="true" />
              {subject.code}
            </button>
          );
        })}
      </div>
      <div className="pa-legend-actions">
        <button type="button" onClick={onAll}>All</button>
        <button type="button" onClick={onNone}>None</button>
      </div>
    </div>
  );
}
