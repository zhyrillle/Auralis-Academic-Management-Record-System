import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import AccountSummary from "./dashboard/AccountSummary";
import AuditEventDrawer from "./dashboard/AuditEventDrawer";
import AuditEventFilters from "./dashboard/AuditEventFilters";
import AuditEventTable from "./dashboard/AuditEventTable";
import {
  getAccountSummary,
  getAuditEvents,
} from "../../services/adminDashboardService";
import { getStoredUser } from "../../utils/auth";
import "../../styles/adminDashboard.css";

const emptySummary = {
  totalAccounts: 0,
  activeAccounts: 0,
  inactiveAccounts: 0,
  roles: {
    subject_teacher: 0,
    department_head: 0,
    principal: 0,
    system_admin: 0,
  },
};

export default function AdminDashboard() {
  const currentUser = useMemo(() => getStoredUser(), []);
  const [summary, setSummary] = useState(emptySummary);
  const [auditEvents, setAuditEvents] = useState([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [isAuditLoading, setIsAuditLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [search, setSearch] = useState("");
  const [schoolYearFilter, setSchoolYearFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [impactFilter, setImpactFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const loadSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    setSummaryError("");

    try {
      setSummary(await getAccountSummary());
      setLastUpdatedAt(new Date());
    } catch (error) {
      setSummaryError(error.message || "Account summary could not be loaded.");
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  const loadAuditEvents = useCallback(async () => {
    setIsAuditLoading(true);
    setAuditError("");

    try {
      setAuditEvents(await getAuditEvents());
      setLastUpdatedAt(new Date());
    } catch (error) {
      setAuditError(error.message || "Audit activity could not be loaded.");
    } finally {
      setIsAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    getAccountSummary()
      .then((nextSummary) => {
        if (!isCurrent) return;
        setSummary(nextSummary);
        setLastUpdatedAt(new Date());
      })
      .catch((error) => {
        if (isCurrent) {
          setSummaryError(error.message || "Account summary could not be loaded.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsSummaryLoading(false);
      });

    getAuditEvents()
      .then((events) => {
        if (!isCurrent) return;
        setAuditEvents(events);
        setLastUpdatedAt(new Date());
      })
      .catch((error) => {
        if (isCurrent) {
          setAuditError(error.message || "Audit activity could not be loaded.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsAuditLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedEvent) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setSelectedEvent(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEvent]);

  const modules = useMemo(
    () =>
      Array.from(new Set(auditEvents.map((event) => event.module)))
        .filter(Boolean)
        .sort(),
    [auditEvents],
  );

  const schoolYears = useMemo(
    () =>
      Array.from(
        new Set(auditEvents.map((event) => event.schoolYear).filter(Boolean)),
      ).sort((first, second) => second.localeCompare(first)),
    [auditEvents],
  );

  const eventTypes = useMemo(() => {
    const labelsByType = new Map(
      auditEvents.map((event) => [event.eventType, event.eventLabel]),
    );

    return Array.from(labelsByType, ([value, label]) => ({ value, label })).sort(
      (first, second) => first.label.localeCompare(second.label),
    );
  }, [auditEvents]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return auditEvents.filter((event) => {
      const matchesSearch =
        !query ||
        [event.actorName, event.summary, event.target, event.eventLabel]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));
      const matchesModule = !moduleFilter || event.module === moduleFilter;
      const matchesSchoolYear =
        !schoolYearFilter ||
        (schoolYearFilter === "system-wide"
          ? !event.schoolYear
          : event.schoolYear === schoolYearFilter);
      const matchesEventType =
        !eventTypeFilter || event.eventType === eventTypeFilter;
      const matchesImpact = !impactFilter || event.impact === impactFilter;
      const occurredAt = new Date(event.occurredAt).getTime();
      const startsAt = dateFromFilter
        ? new Date(`${dateFromFilter}T00:00:00+08:00`).getTime()
        : null;
      const endsAt = dateToFilter
        ? new Date(`${dateToFilter}T23:59:59+08:00`).getTime()
        : null;
      const matchesDateFrom = startsAt === null || occurredAt >= startsAt;
      const matchesDateTo = endsAt === null || occurredAt <= endsAt;

      return (
        matchesSearch &&
        matchesSchoolYear &&
        matchesModule &&
        matchesEventType &&
        matchesImpact &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }, [
    auditEvents,
    dateFromFilter,
    dateToFilter,
    eventTypeFilter,
    impactFilter,
    moduleFilter,
    schoolYearFilter,
    search,
  ]);

  const handleRefresh = async () => {
    await Promise.all([loadSummary(), loadAuditEvents()]);
  };

  const clearFilters = () => {
    setSearch("");
    setSchoolYearFilter("");
    setModuleFilter("");
    setEventTypeFilter("");
    setImpactFilter("");
    setDateFromFilter("");
    setDateToFilter("");
  };

  const handleSearchChange = (value) => {
    setSearch(value);
  };

  const handleModuleChange = (value) => {
    setModuleFilter(value);
  };

  const handleSchoolYearChange = (value) => {
    setSchoolYearFilter(value);
  };

  const handleEventTypeChange = (value) => {
    setEventTypeFilter(value);
  };

  const handleImpactChange = (value) => {
    setImpactFilter(value);
  };

  const handleDateFromChange = (value) => {
    setDateFromFilter(value);
  };

  const handleDateToChange = (value) => {
    setDateToFilter(value);
  };

  const firstName = currentUser?.first_name || "Admin";
  const isRefreshing = isSummaryLoading || isAuditLoading;
  const lastUpdatedLabel = lastUpdatedAt
    ? `Updated ${new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        hour: "numeric",
        minute: "2-digit",
      }).format(lastUpdatedAt)}`
    : "Not updated yet";

  return (
    <div className="admin-dashboard-page">
      {/* ========================================
          DASHBOARD HEADER
      ======================================== */}
      <header className="admin-dashboard-intro">
        <div>
          <h1>Welcome back, {firstName}!</h1>
          <p>Monitor user accounts and recent activity across Auralis.</p>
        </div>
        <div className="admin-dashboard-refresh">
          <span>{lastUpdatedLabel}</span>
          <button type="button" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw
              size={16}
              className={isRefreshing ? "is-spinning" : ""}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
      </header>

      {/* ========================================
          ACCOUNT SUMMARY
      ======================================== */}
      <AccountSummary
        summary={summary}
        isLoading={isSummaryLoading}
        error={summaryError}
        onRetry={loadSummary}
      />

      {/* ========================================
          AUDIT EVENT MONITOR
      ======================================== */}
      <section className="audit-trail" aria-labelledby="audit-trail-title">
        <div className="admin-section-heading audit-trail__heading">
          <div>
            <h2 id="audit-trail-title">Audit Events</h2>
            <p>Review recent account and grading activity across the system.</p>
          </div>
          <span className="audit-trail__count">
            {filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}
          </span>
        </div>

        <AuditEventFilters
          search={search}
          schoolYear={schoolYearFilter}
          module={moduleFilter}
          eventType={eventTypeFilter}
          impact={impactFilter}
          dateFrom={dateFromFilter}
          dateTo={dateToFilter}
          schoolYears={schoolYears}
          modules={modules}
          eventTypes={eventTypes}
          showMore={showMoreFilters}
          onSearchChange={handleSearchChange}
          onSchoolYearChange={handleSchoolYearChange}
          onModuleChange={handleModuleChange}
          onEventTypeChange={handleEventTypeChange}
          onImpactChange={handleImpactChange}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onToggleMore={() => setShowMoreFilters((isOpen) => !isOpen)}
          onClear={clearFilters}
        />

        <AuditEventTable
          events={filteredEvents}
          isLoading={isAuditLoading}
          error={auditError}
          onRetry={loadAuditEvents}
          onSelect={setSelectedEvent}
        />
      </section>

      <AuditEventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
