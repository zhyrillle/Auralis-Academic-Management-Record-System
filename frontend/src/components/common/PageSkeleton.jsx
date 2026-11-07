import '../../styles/skeleton.css';

/** A visual placeholder; dimensions belong to the page that uses it. */
export function SkeletonBlock({ className = '', width, height, round = false, style }) {
  return <span aria-hidden="true" className={`app-skeleton-block${round ? ' app-skeleton-block--round' : ''} ${className}`}
    style={{ width, height, ...style }} />;
}

export function SkeletonValue({ label = 'Loading value', width = 80, height = 14 }) {
  return <span className="app-skeleton-value" role="status" aria-label={label} aria-busy="true">
    <SkeletonBlock width={width} height={height} />
  </span>;
}

/** Keep page titles, navigation, back buttons and page controls outside this region. */
export function SkeletonRegion({ label = 'Loading records', className = '', children }) {
  return <div className={`app-skeleton-region ${className}`} role="status" aria-label={label} aria-busy="true">
    <span className="app-skeleton-sr-only">{label}</span>
    <div aria-hidden="true">{children}</div>
  </div>;
}

export function SkeletonTableRows({ rows = 6, columns = 5 }) {
  return Array.from({ length: rows }, (_, row) => <tr key={row} aria-hidden="true" className="app-skeleton-table-row">
    {Array.from({ length: columns }, (_, column) => <td key={column}><SkeletonBlock /></td>)}
  </tr>);
}

export function SkeletonTable({ rows = 6, columns = 5 }) {
  return <div className="app-skeleton-table-scroll"><table className="app-skeleton-table" aria-hidden="true"><tbody>
    <SkeletonTableRows rows={rows} columns={columns} />
  </tbody></table></div>;
}

export function SkeletonList({ rows = 4 }) {
  return <div className="app-skeleton-list" aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => <div className="app-skeleton-list__row" key={index}>
      <SkeletonBlock width="45%" /><SkeletonBlock width="90%" /><SkeletonBlock width="65%" />
    </div>)}
  </div>;
}

export function SkeletonCards({ count = 4, columns = count > 5 ? 3 : count, className = '' }) {
  return <div className={`app-skeleton-cards ${className}`} style={{ '--skeleton-columns': columns }} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <div className="app-skeleton-card" key={index}>
      <SkeletonBlock width="55%" /><SkeletonBlock width="35%" height={32} /><SkeletonBlock width="75%" />
    </div>)}
  </div>;
}

export function SkeletonChart({ round = false }) {
  return <div className="app-skeleton-chart" aria-hidden="true">
    <SkeletonBlock width="45%" />
    <SkeletonBlock className={round ? 'app-skeleton-chart__ring' : 'app-skeleton-chart__plot'} round={round} />
  </div>;
}

/** A whole content panel, including its heading, rather than only its values. */
export function SkeletonPanel({ label = 'Loading content', children, className = '' }) {
  return <SkeletonRegion label={label} className={`app-skeleton-panel ${className}`}>
    <SkeletonBlock width="42%" height={18} />
    {children || <SkeletonList rows={4} />}
  </SkeletonRegion>;
}

export function SkeletonContent({ loading, skeleton, children, className = '' }) {
  return <div className={className} aria-busy={Boolean(loading)}>{loading ? skeleton : children}</div>;
}

/** Common arrangements for pages without a more specific skeleton composition. */
export default function PageSkeleton({ label, layout = 'table', rows = 6, columns = 5, cards = 0, className = '', children }) {
  return <SkeletonRegion label={label} className={className}>
    {children || <>
      {cards > 0 && <SkeletonCards count={cards} />}
      {layout === 'cards' ? <SkeletonCards count={rows} />
        : layout === 'charts' ? <div className="app-skeleton-charts"><SkeletonChart /><SkeletonChart round /></div>
        : layout === 'profile' ? <>
          <div className="app-skeleton-profile"><SkeletonBlock round width={112} height={112} /><div><SkeletonBlock width={220} height={26} /><SkeletonBlock width={180} /></div></div>
          <SkeletonCards count={6} columns={2} />
        </> : <div className="app-skeleton-table-scroll"><table className="app-skeleton-table" aria-hidden="true"><tbody>
          <SkeletonTableRows rows={rows} columns={columns} />
        </tbody></table></div>}
    </>}
  </SkeletonRegion>;
}
