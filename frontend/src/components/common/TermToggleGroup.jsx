import "../../styles/themes.css";

/**
 * TermToggleGroup component
 * A rounded button group for term selection (T1, T2, T3).
 *
 * @param {Object} props
 * @param {string} [props.selectedTerm="T1"] - Currently selected term ("T1", "T2", "T3")
 * @param {function(string):void} [props.onSelectTerm] - Callback when a term is selected
 */
export default function TermToggleGroup({
  selectedTerm,
  activeTerm = "T1",
  onSelectTerm,
  onTermChange,
  termStatusMap,
}) {
  const terms = ["T1", "T2", "T3"];
  const currentTerm = selectedTerm || activeTerm;

  const handleSelect = (term) => {
    if (onTermChange) {
      onTermChange(term);
    } else if (onSelectTerm) {
      onSelectTerm(term);
    }
  };

  return (
    <div
      className="term-toggle-group flex items-center gap-1.5"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {terms.map((term) => {
        const isActive = currentTerm === term;

        return (
          <button
            key={term}
            type="button"
            onClick={() => handleSelect(term)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${isActive
              ? "bg-amber-500 text-white shadow-sm"
              : "border border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            style={{
              padding: "7px 10px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              ...(isActive
                ? {
                  backgroundColor: "#C9A227", // Golden fill
                  color: "#ffffff",
                  border: "1px solid #C9A227",
                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                }
                : {
                  backgroundColor: "#ffffff",
                  color: "var(--subtext-color)",
                  border: "1px solid #929292", // Light gray border
                }),
            }}
          >
            {term}
          </button>
        );
      })}
    </div>
  );
}
