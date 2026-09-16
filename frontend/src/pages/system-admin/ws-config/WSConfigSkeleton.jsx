export function WSConfigPlaceholder({ className = "" }) {
  return <span className={`ws-config-skeleton ${className}`} aria-hidden="true" />;
}

export function WSConfigSkeletonRows() {
  return Array.from({ length: 8 }, (_, row) => (
    <tr className="ws-config-skeleton-row" key={row} aria-hidden="true">
      {Array.from({ length: 5 }, (_, column) => (
        <td key={column}><WSConfigPlaceholder className={column === 0 ? "ws-config-skeleton-subject" : "ws-config-skeleton-value"} /></td>
      ))}
    </tr>
  ));
}

export function WSConfigBusy() {
  return (
    <div className="ws-config-busy" role="status" aria-label="Loading configuration">
      <span className="ws-config-busy-spinner" aria-hidden="true" />
      <span className="ws-config-sr-only">Loading configuration.</span>
    </div>
  );
}
