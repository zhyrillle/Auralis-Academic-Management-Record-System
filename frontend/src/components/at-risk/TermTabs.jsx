/**
 * @typedef {Object} TermTabsProps
 * @property {string} active - "overall" | "1" | "2" | "3"
 * @property {(term: string) => void} onChange
 * @property {boolean} [disabled]
 */

export default function TermTabs({ active, onChange, disabled }) {
  const tabs = [
    { value: "overall", label: "Overall" },
    { value: "1", label: "Term 1" },
    { value: "2", label: "Term 2" },
    { value: "3", label: "Term 3" },
  ];

  return (
    <div className="ar-tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = active === tab.value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={isActive}
            className={`ar-tab ${isActive ? "ar-tab-active" : ""}`}
            onClick={() => onChange(tab.value)}
            disabled={disabled}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
