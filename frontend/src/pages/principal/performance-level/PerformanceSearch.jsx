import { Search, X } from "lucide-react";

export default function PerformanceSearch({
  value,
  onChange,
  placeholder,
  label = placeholder,
  disabled = false,
}) {
  return (
    <label className="pp-search">
      <span className="pa-sr-only">{label}</span>
      <Search className="pp-search__icon" size={16} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {value && !disabled && (
        <button
          type="button"
          className="pp-search__clear"
          onClick={() => onChange("")}
          aria-label={`Clear ${label.toLowerCase()}`}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </label>
  );
}
