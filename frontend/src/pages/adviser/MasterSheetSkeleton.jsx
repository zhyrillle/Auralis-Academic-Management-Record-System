export default function MasterSheetSkeleton() {
  return (
    <div className="ms-skeleton" role="status" aria-live="polite">
      <span className="ms-sr-only">Loading Master Sheet data.</span>
      <div aria-hidden="true">
        <div className="ms-page-header ms-skeleton-page-header">
          <div className="ms-skeleton-heading">
            <span className="ms-skeleton-block ms-skeleton-block--eyebrow" />
            <span className="ms-skeleton-block ms-skeleton-block--title" />
            <span className="ms-skeleton-block ms-skeleton-block--subtitle" />
          </div>
          <div className="ms-selectors ms-skeleton-selectors">
            {[0, 1].map((index) => (
              <div className="ms-selector-field" key={index}>
                <span className="ms-skeleton-block ms-skeleton-block--selector-label" />
                <span className="ms-skeleton-block ms-skeleton-block--selector" />
              </div>
            ))}
          </div>
        </div>
        <div className="ms-controls-row ms-skeleton-controls">
          <div className="ms-summary">
            <span className="ms-skeleton-block ms-skeleton-block--metric-placeholder" />
            <span className="ms-skeleton-block ms-skeleton-block--metric-placeholder" />
          </div>
          <div className="ms-control-actions ms-skeleton-control-actions">
            <span className="ms-skeleton-block ms-skeleton-block--search" />
            <span className="ms-skeleton-block ms-skeleton-block--button" />
          </div>
        </div>
        <div className="ms-skeleton-table-wrapper">
          <table className="ms-skeleton-grade-table">
            <thead>
              <tr>{[0, 1, 2, 3, 4].map((column) => <th key={column} />)}</tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, row) => (
                <tr key={row}>
                  {[0, 1, 2, 3, 4].map((column) => (
                    <td key={column}><span className="ms-skeleton-block" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="ms-submission-footer ms-skeleton-footer">
          <span className="ms-skeleton-block ms-skeleton-block--deadline" />
          <span className="ms-skeleton-block ms-skeleton-block--submit" />
        </footer>
      </div>
    </div>
  );
}
