const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const normalizeNetworkError = (error, context = "dashboard data") => {
  if (error instanceof TypeError || /failed to fetch/i.test(error?.message || "")) {
    return new Error(
      `Unable to load ${context}. Check the backend connection and try again.`,
    );
  }
  return error;
};

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || data.message || "The request could not be completed.",
    );
  }

  return data;
};

export const getAccountSummary = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/audit-logs/summary`);
    const data = await parseResponse(response);

    return {
      totalAccounts: Number(data.totalAccounts ?? data.total_accounts ?? 0),
      activeAccounts: Number(data.activeAccounts ?? data.active_accounts ?? 0),
      inactiveAccounts: Number(data.inactiveAccounts ?? data.inactive_accounts ?? 0),
      roles: {
        subject_teacher: Number(data.roles?.subject_teacher ?? 0),
        department_head: Number(data.roles?.department_head ?? 0),
        principal: Number(data.roles?.principal ?? 0),
        system_admin: Number(data.roles?.system_admin ?? 0),
      },
    };
  } catch (error) {
    throw normalizeNetworkError(error, "account summary");
  }
};

export const getAuditEvents = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/audit-logs`);
    const data = await parseResponse(response);

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((event) => ({
        id: String(event.id || event.audit_event_id || ""),
        occurredAt: event.occurredAt || event.occurred_at || new Date().toISOString(),
        actorId: event.actorId ? String(event.actorId) : (event.user_id ? String(event.user_id) : null),
        actorName: event.actorName || event.actor_name || "Auralis System",
        actorRole: event.actorRole || event.actor_role || "System",
        actingAs: event.actingAs || event.acting_as || event.actorRole || "System",
        eventType: event.eventType || event.event_type || "SYSTEM_EVENT",
        eventLabel: event.eventLabel || event.event_label || event.eventType || "System Event",
        module: event.module || event.module_name || "System",
        entityType: event.entityType || event.entity_type || "Record",
        entityId: event.entityId ? String(event.entityId) : (event.entity_id ? String(event.entity_id) : null),
        target: event.target || null,
        summary: event.summary || "No summary available.",
        impact: event.impact || "Medium",
        schoolYear: event.schoolYear || event.school_year || null,
        term: event.term || null,
        subject: event.subject || null,
        section: event.section || null,
        beforeData: typeof event.beforeData === "object" && event.beforeData !== null ? event.beforeData : {},
        afterData: typeof event.afterData === "object" && event.afterData !== null ? event.afterData : {},
        metadata: typeof event.metadata === "object" && event.metadata !== null ? event.metadata : {},
      }))
      .sort(
        (first, second) =>
          new Date(second.occurredAt).getTime() -
          new Date(first.occurredAt).getTime(),
      );
  } catch (error) {
    throw normalizeNetworkError(error, "audit activity");
  }
};
