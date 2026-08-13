import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import "../../styles/dropdownSelect.css";

export default function DropdownSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
}) {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption =
    options.find((option) => String(option.value) === String(value)) || options[0];

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (nextValue) => {
    onChange(nextValue);
    setIsOpen(false);
  };

  if (!selectedOption) return null;

  return (
    <div
      className={`dropdown-select${className ? ` ${className}` : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={`dropdown-select__trigger${isOpen ? " is-open" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${label}: ${selectedOption.label}`}
      >
        <span>{selectedOption.label}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="dropdown-select__menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={String(option.value || "all")}
                type="button"
                className={isSelected ? "is-selected" : ""}
                onClick={() => handleSelect(option.value)}
                role="option"
                aria-selected={isSelected}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={15} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
