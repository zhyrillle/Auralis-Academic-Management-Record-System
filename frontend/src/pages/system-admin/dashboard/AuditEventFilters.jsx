import { useEffect, useRef } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import DropdownSelect from "../../../components/common/DropdownSelect";

export default function AuditEventFilters({
  search,
  schoolYear,
  module,
  eventType,
  impact,
  dateFrom,
  dateTo,
  schoolYears,
  modules,
  eventTypes,
  showMore,
  onSearchChange,
  onSchoolYearChange,
  onModuleChange,
  onEventTypeChange,
  onImpactChange,
  onDateFromChange,
  onDateToChange,
  onToggleMore,
  onClear,
}) {
  const popoverRef = useRef(null);
  const hasFilters = Boolean(
    search || schoolYear || module || eventType || impact || dateFrom || dateTo,
  );
  const hasAdvancedFilters = Boolean(eventType || impact || dateFrom || dateTo);
  const schoolYearOptions = [
    { value: "", label: "All school years" },
    ...schoolYears.map((year, index) => ({
      value: year,
      label: `${year}${index === 0 ? " — Current" : ""}`,
    })),
    { value: "system-wide", label: "System-wide events" },
  ];
  const moduleOptions = [
    { value: "", label: "All modules" },
    ...modules.map((moduleName) => ({ value: moduleName, label: moduleName })),
  ];
  const eventTypeOptions = [
    { value: "", label: "All event types" },
    ...eventTypes,
  ];
  const impactOptions = [
    { value: "", label: "All impacts" },
    { value: "Low", label: "Low" },
    { value: "Medium", label: "Medium" },
    { value: "High", label: "High" },
  ];

  useEffect(() => {
    if (!showMore) return undefined;

    const handlePointerDown = (event) => {
      if (!popoverRef.current?.contains(event.target)) onToggleMore();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onToggleMore();
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onToggleMore, showMore]);

  return (
    <div className="audit-filter-shell" aria-label="Audit event filters">
      <div className="audit-filters">
        <label className="audit-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search audit activity</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search user or activity"
          />
        </label>

        <DropdownSelect
          label="Filter by school year"
          value={schoolYear}
          onChange={onSchoolYearChange}
          options={schoolYearOptions}
        />

        <DropdownSelect
          label="Filter by module"
          value={module}
          onChange={onModuleChange}
          options={moduleOptions}
        />

        <div className="audit-filter-popover-anchor" ref={popoverRef}>
          <button
            type="button"
            className={`audit-filters__more${showMore ? " is-active" : ""}${hasAdvancedFilters ? " has-filters" : ""}`}
            onClick={onToggleMore}
            aria-expanded={showMore}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            More Filters
          </button>

          {showMore && (
            <div
              className="audit-filter-popover"
              role="dialog"
              aria-label="Additional audit filters"
            >
              <div className="audit-filter-popover__header">
                <div>
                  <strong>More Filters</strong>
                  <span>Narrow the audit event results.</span>
                </div>
                <button type="button" onClick={onToggleMore} aria-label="Close filters">
                  <X size={17} aria-hidden="true" />
                </button>
              </div>

              <div className="audit-filter-popover__body">
                <div className="audit-filter-field">
                  <span>Event type</span>
                  <DropdownSelect
                    label="Filter by event type"
                    value={eventType}
                    onChange={onEventTypeChange}
                    options={eventTypeOptions}
                  />
                </div>

                <div className="audit-filter-field">
                  <span>Impact</span>
                  <DropdownSelect
                    label="Filter by impact"
                    value={impact}
                    onChange={onImpactChange}
                    options={impactOptions}
                  />
                </div>

                <label className="audit-filter-field audit-date-filter">
                  <span>From date</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => onDateFromChange(event.target.value)}
                  />
                </label>

                <label className="audit-filter-field audit-date-filter">
                  <span>To date</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => onDateToChange(event.target.value)}
                  />
                </label>
              </div>

              <div className="audit-filter-popover__footer">
                <button type="button" onClick={onToggleMore}>Done</button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`audit-filters__clear${hasFilters ? "" : " is-hidden"}`}
          onClick={onClear}
          disabled={!hasFilters}
          aria-hidden={!hasFilters}
          tabIndex={hasFilters ? 0 : -1}
        >
          <X size={15} aria-hidden="true" />
          Clear
        </button>
      </div>
    </div>
  );
}
