import '../../styles/filterToolbar.css';

export default function FilterToolbar({ children, end, label = 'Page filters', className = '' }) {
  return <section className={`filter-toolbar ${className}`} aria-label={label}>
    <div className="filter-toolbar__controls">{children}</div>
    {end && <div className="filter-toolbar__end">{end}</div>}
  </section>;
}
