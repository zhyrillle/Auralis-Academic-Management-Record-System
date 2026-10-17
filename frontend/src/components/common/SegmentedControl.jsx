import "../../styles/segmentedControl.css";
export default function SegmentedControl({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = ""
}) {
  return <div className={`segmented-control ${className}`} role="group" aria-label={label}>
    {options.map(({
      value: optionValue,
      label: optionLabel,
      icon: Icon
    }) => <button key={optionValue} type="button" aria-pressed={value === optionValue} disabled={disabled} onClick={() => onChange(optionValue)}>
        {Icon && <Icon size={15} aria-hidden="true" />}{optionLabel}
      </button>)}
  </div>;
}
