export default function AnalyticsTermTabs({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel = "Academic term",
  className = "",
}) {
  return (
    <div
      className={`pa-term-tabs${className ? ` ${className}` : ""}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? "is-active" : ""}
          onClick={() => onChange(option.id)}
          disabled={disabled}
          role="tab"
          aria-selected={value === option.id}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
