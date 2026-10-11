import { useEffect, useId, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import DropdownSelect from '../common/DropdownSelect';
import { learnerFilterOptions, getLearnerFilterPanelLayout } from '../../utils/riskPresentation';

export default function LearnerFilterPanel({ preview, learners, section, adviser, onGradeChange, onSectionChange, onAdviserChange, onClear }) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState(null);
  const root = useRef(null);
  const panelId = useId();
  const options = learnerFilterOptions(learners, preview.gradeLevel);
  const activeCount = [preview.gradeLevel, section, adviser].filter(value => value !== 'all').length;
  const updateLayout = () => {
    if (root.current) setLayout(getLearnerFilterPanelLayout(root.current.getBoundingClientRect(), document.documentElement.clientWidth));
  };
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const onKey = event => {
      if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); }
    };
    const onResize = () => {
      if (root.current) setLayout(getLearnerFilterPanelLayout(root.current.getBoundingClientRect(), document.documentElement.clientWidth));
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);
  return <div className="ar-learner-filters" ref={root}>
    <button type="button" className={`ar-filter-icon-button${activeCount ? ' has-filters' : ''}`}
      aria-label={`Filter learners${activeCount ? ` (${activeCount} active)` : ''}`} title="Filter learners"
      aria-expanded={open} aria-controls={panelId} disabled={preview.loading || !preview.options}
      onClick={() => { if (!open) updateLayout(); setOpen(value => !value); }}>
      <SlidersHorizontal size={19} aria-hidden="true" />
      {activeCount > 0 && <span className="ar-filter-count">{activeCount}</span>}
    </button>
    {open && <div className="ar-filter-panel" id={panelId} role="group" aria-label="Learner filters"
      data-placement={layout?.placement} style={layout?.style}>
      <div className="ar-filter-panel-heading"><strong>Filter learners</strong>
        <button type="button" onClick={onClear} disabled={!activeCount}>Clear filters</button></div>
      <div className="ar-filter-fields">
        <div className="ar-filter-field"><span>Grade level</span>
          <DropdownSelect label="Grade Level" value={preview.gradeLevel} options={preview.options?.gradeLevels || []}
            onChange={onGradeChange} disabled={preview.loading} /></div>
        <div className="ar-filter-field"><span>Section</span>
          <DropdownSelect label="Section" value={section} options={options.sections}
            onChange={onSectionChange} disabled={preview.loading} /></div>
        <div className="ar-filter-field"><span>Adviser</span>
          <DropdownSelect label="Adviser" value={adviser} options={options.advisers}
            onChange={onAdviserChange} disabled={preview.loading} /></div>
      </div>
    </div>}
  </div>;
}
