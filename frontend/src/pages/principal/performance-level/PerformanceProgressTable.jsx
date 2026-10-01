import ProgressBar from "../../../components/charts/ProgressBar";

export function PerformanceStatusBadge({ value }) {
  const tone =
    value === "On track" || value === "Submitted"
      ? "on-track"
      : value === "Needs attention" || value === "Delayed"
        ? "needs-attention"
        : "monitor";
  return <span className={`pp-status pp-status--${tone}`}>{value}</span>;
}

export function PerformanceInlineProgress({ value, label, tone = "blue" }) {
  return (
    <div className="pp-inline-progress">
      <ProgressBar value={value} tone={tone} ariaLabel={`${label ?? value}%`} />
      <span>{label ?? `${value}%`}</span>
    </div>
  );
}

export default function PerformanceProgressTable({
  title,
  subtitle,
  columns,
  data,
  controls = null,
  maxVisibleRows,
  viewportRows,
  emptyMessage = "No matching records.",
}) {
  const hasLimitedViewport = Number.isInteger(maxVisibleRows);
  const preservedRows = Number.isInteger(viewportRows)
    ? Math.min(Math.max(viewportRows, 1), maxVisibleRows)
    : maxVisibleRows;

  return (
    <section className="pa-panel pp-table-panel">
      <div className="pa-panel__header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {controls && <div className="pp-panel-controls">{controls}</div>}
      </div>
      <div className="pa-table-scroll-shell">
        <div
          className={`pp-table-wrap${hasLimitedViewport ? " pp-table-wrap--limited" : ""}`}
          tabIndex="0"
          aria-label={`Scrollable ${title}`}
          style={
            hasLimitedViewport
              ? {
                  "--pp-visible-rows": preservedRows,
                  "--pp-table-fallback-height": `${40 + preservedRows * 50}px`,
                }
              : undefined
          }
        >
          <table className={`pp-table${data.length ? "" : " pp-table--empty"}`}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length ? (
                data.map((row) => (
                  <tr key={row.id}>
                    {columns.map((column) => (
                      <td key={column.key}>
                        {column.render ? column.render(row) : row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="pp-table__empty" colSpan={columns.length}>
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
