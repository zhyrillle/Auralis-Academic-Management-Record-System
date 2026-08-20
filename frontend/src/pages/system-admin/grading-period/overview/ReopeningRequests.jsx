import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Search,
  SearchX,
} from "lucide-react";
import Badge from "../../../../components/common/Badge";
import DropdownSelect from "../../../../components/common/DropdownSelect";
import EmptyState from "../../../../components/common/EmptyState";

function ReopeningRequestCard({ request, onReview }) {
  return (
    <article className="reopening-request">
      <div className="reopening-request__avatar" aria-hidden="true">
        {request.teacherInitials}
      </div>
      <div className="reopening-request__body">
        <div className="reopening-request__top">
          <div>
            <h3>{request.teacherName}</h3>
            <p>
              {request.subject} &bull; {request.gradeLevel} {request.section}
            </p>
          </div>
          <span className="reopening-request__time">{request.requestedAt}</span>
        </div>
        <p className="reopening-request__reason">
          <span>Reason</span>
          {request.reason}
        </p>
        <button
          type="button"
          className="grade-lock-button grade-lock-button--secondary"
          onClick={() => onReview(request.id)}
        >
          Review Request
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export default function ReopeningRequests({
  term,
  requests,
  sectionRef,
  onReview,
  embedded = false,
}) {
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const departmentOptions = useMemo(
    () => [
      { value: "all", label: "All departments" },
      ...Array.from(new Set(requests.map((request) => request.department)))
        .filter(Boolean)
        .sort((first, second) => first.localeCompare(second))
        .map((department) => ({ value: department, label: department })),
    ],
    [requests],
  );
  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesDepartment =
        departmentFilter === "all" ||
        request.department === departmentFilter;
      const searchableText = [
        request.teacherName,
        request.subject,
        request.gradeLevel,
        request.section,
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesDepartment &&
        (!normalizedQuery || searchableText.includes(normalizedQuery))
      );
    });
  }, [departmentFilter, query, requests]);
  const emptyStateCopy =
    term.status === "upcoming"
      ? {
          title: "Requests are not available yet",
          description:
            "Reopening requests become available after this term has been finalized.",
        }
      : term.status === "open"
        ? {
            title: "No reopening requests during the active term",
            description:
              "Post-deadline correction requests will appear here after the term is finalized.",
          }
        : {
            title: "No pending requests",
            description: `There are no reopening requests awaiting review for ${term.label}.`,
          };

  return (
    <section
      className={`grade-lock-panel reopening-requests${embedded ? " reopening-requests--embedded" : ""}`}
      aria-labelledby={embedded ? undefined : "reopening-requests-title"}
      aria-label={embedded ? "Pending reopening requests" : undefined}
      ref={sectionRef}
      tabIndex={embedded ? undefined : "-1"}
    >
      {!embedded && (
        <div className="grade-lock-panel__heading">
          <div>
            <h2 id="reopening-requests-title">Reopening Requests</h2>
            <p>Review scoped corrections for {term.label}.</p>
          </div>
          <Badge variant="attention">{requests.length} pending</Badge>
        </div>
      )}

      {requests.length > 0 ? (
        <>
          <div className="reopening-request-filters">
            <label className="reopening-request-search">
              <span className="grade-lock-sr-only">
                Search reopening requests
              </span>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={query}
                placeholder="Search teacher, subject, or section"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <DropdownSelect
              className="reopening-request-department-filter"
              label="Department"
              value={departmentFilter}
              options={departmentOptions}
              onChange={setDepartmentFilter}
            />
          </div>

          {filteredRequests.length > 0 ? (
            <div className="reopening-request-list">
              {filteredRequests.map((request) => (
                <ReopeningRequestCard
                  key={request.id}
                  request={request}
                  onReview={onReview}
                />
              ))}
            </div>
          ) : (
            <div className="reopening-request-filter-empty">
              <SearchX size={24} aria-hidden="true" />
              <strong>No requests match these filters</strong>
              <p>Try another teacher, subject, section, or department.</p>
              <button
                type="button"
                className="grade-lock-button grade-lock-button--secondary"
                onClick={() => {
                  setQuery("");
                  setDepartmentFilter("all");
                }}
              >
                Clear Filters
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          className="grade-lock-empty-state"
          icon={CheckCircle2}
          title={emptyStateCopy.title}
          description={emptyStateCopy.description}
        />
      )}
    </section>
  );
}
