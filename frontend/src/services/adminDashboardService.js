import { placeholderAuditEvents } from "./adminDashboardPlaceholderData";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

let usersRequest = null;

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || data.message || "The request could not be completed.",
    );
  }

  return data;
};

const getUsers = () => {
  if (!usersRequest) {
    usersRequest = fetch(`${API_BASE_URL}/users`)
      .then(parseResponse)
      .finally(() => {
        usersRequest = null;
      });
  }

  return usersRequest;
};

const normalizeRole = (role) => {
  const value = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const aliases = {
    admin: "system_admin",
    administrator: "system_admin",
    system_administrator: "system_admin",
    teacher: "subject_teacher",
  };

  return aliases[value] || value;
};

export const getAccountSummary = async () => {
  const users = await getUsers();
  const roleCounts = {
    subject_teacher: 0,
    department_head: 0,
    principal: 0,
    system_admin: 0,
  };

  users.forEach((user) => {
    const role = normalizeRole(user.role);
    if (Object.prototype.hasOwnProperty.call(roleCounts, role)) {
      roleCounts[role] += 1;
    }
  });

  const activeAccounts = users.filter(
    (user) => String(user.account_status || "active").toLowerCase() === "active",
  ).length;

  return {
    totalAccounts: users.length,
    activeAccounts,
    inactiveAccounts: users.length - activeAccounts,
    roles: roleCounts,
  };
};

export const getAuditEvents = async () => {
  // UI placeholder only. The backend developer can replace this return value
  // with the normalized response from GET /api/audit-logs without changing the
  // Dashboard page or its private components.
  return placeholderAuditEvents
    .map((event) => ({
      ...event,
      beforeData: { ...event.beforeData },
      afterData: { ...event.afterData },
      metadata: { ...event.metadata },
    }))
    .sort(
      (first, second) =>
        new Date(second.occurredAt).getTime() -
        new Date(first.occurredAt).getTime(),
    );
};
