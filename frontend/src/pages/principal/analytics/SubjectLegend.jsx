export default function SubjectLegend({
  subjects,
  selectedIds,
  onToggle,
  onAll,
  onNone,
  className = "",
}) {
  return (
    <div className={`pa-legend-row${className ? ` ${className}` : ""}`}>
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
              {subject.marker ? <svg className="pa-legend-swatch" viewBox="0 0 28 14" aria-hidden="true">
                <line x1="0" x2="28" y1="7" y2="7" stroke={subject.color} strokeWidth="2" strokeDasharray={subject.dash || undefined} />
                {subject.marker === "square" ? <rect x="10" y="3" width="8" height="8" fill={subject.color} /> : subject.marker === "diamond" ? <path d="M 14 2 L 19 7 L 14 12 L 9 7 Z" fill={subject.color} /> : <circle cx="14" cy="7" r="4" fill={subject.color} />}
              </svg> : <span style={{ "--legend-color": subject.color }} aria-hidden="true" />}
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
