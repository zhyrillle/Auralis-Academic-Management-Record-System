import { Users } from 'lucide-react';
import '../../styles/sectionCard.css';

export default function SectionCard({ name, grade, gradeId, program, count, children, actions, className = '', ariaLabel }) {
  return <article className={`section-card ${className}`} aria-label={ariaLabel || `${name}, ${grade}`}>
    <div className="section-card__heading"><h3>{name}</h3><span className="section-card__grade" data-grade-level={gradeId}>{grade}</span></div>
    <p className="section-card__program">{program}</p>
    <div className="section-card__students"><Users size={17} /><span>{count} {count === 1 ? 'Student' : 'Students'}</span></div>
    {children}
    {actions && <div className="section-card__actions">{actions}</div>}
  </article>;
}
