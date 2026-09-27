const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");
const API_ORIGIN = new URL(API_BASE_URL, window.location.origin).origin;

export const temporaryDurationOptions = [
  { value: "1440", label: "24 hours" },
  { value: "4320", label: "3 days" },
  { value: "10080", label: "7 days" },
  { value: "custom", label: "Custom" },
];

const MANILA_TIMEZONE = "Asia/Manila";

function authHeaders(userId, hasBody = false) {
  return {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    "X-Auralis-User-Id": String(userId || ""),
  };
}

async function request(path, { userId, method = "GET", body } = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: authHeaders(userId, body !== undefined),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error instanceof TypeError || /failed to fetch/i.test(error?.message || "")) {
      throw new Error(
        "Unable to load academic period data. Check the backend connection and try again.",
        { cause: error },
      );
    }
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "The Academic Period request could not be completed.");
    error.code = payload.code;
    throw error;
  }
  return payload;
}

function dateParts(value) {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  return {
    date: date.toISOString().slice(0, 10),
    time: date.toISOString().slice(11, 16),
  };
}

function formatDate(value) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: MANILA_TIMEZONE,
  }).format(new Date(value));
}

function formatPeriodRange(start, end) {
  if (!start || !end) return "Schedule not set";
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}

function formatSchoolYear(year) {
  const normalizeYear = (value) => {
    const rawValue = String(value ?? "");
    if (/^\d{4}$/.test(rawValue)) return rawValue;
    return dateParts(value).date.slice(0, 4);
  };
  const start = normalizeYear(year.starts_on);
  const end = normalizeYear(year.ends_on);
  return start && end ? `SY ${start}–${end}` : "School year";
}

function formatRemaining(deadline) {
  const difference = new Date(deadline).getTime() - Date.now();
  if (!Number.isFinite(difference) || difference <= 0) return "Deadline reached";
  const days = Math.floor(difference / 86400000);
  const hours = Math.floor((difference % 86400000) / 3600000);
  return `${days}d ${hours}h remaining`;
}

function formatTermLabel(termName) {
  const normalized = String(termName || "").trim().toLowerCase();
  const labels = {
    "1": "Term 1",
    "1st": "Term 1",
    "term 1": "Term 1",
    "2": "Term 2",
    "2nd": "Term 2",
    "term 2": "Term 2",
    "3": "Term 3",
    "3rd": "Term 3",
    "term 3": "Term 3",
  };
  return labels[normalized] || termName || "Unnamed term";
}

function mapTerm(term) {
  const start = dateParts(term.starts_at);
  const end = dateParts(term.ends_at);
  const deadline = dateParts(term.grade_submission_deadline_at);
  const reopeningOpen = dateParts(term.reopening_requests_open_at);
  const reopeningClose = dateParts(term.reopening_requests_close_at);
  const status = term.computed_status || String(term.status || "upcoming").toLowerCase();
  return {
    id: String(term.term_id),
    schoolYearId: String(term.school_year_id),
    isConfigured: true,
    label: formatTermLabel(term.term_name),
    status,
    statusLabel: status.charAt(0).toUpperCase() + status.slice(1),
    progress: Number(term.progress || 0),
    periodLabel: formatPeriodRange(term.starts_at, term.ends_at),
    startDate: start.date,
    startDateLabel: formatDate(term.starts_at),
    endDate: end.date,
    endDateLabel: formatDate(term.ends_at),
    deadlineDate: deadline.date,
    deadlineDateLabel: formatDate(term.grade_submission_deadline_at),
    deadlineTime: deadline.time,
    deadlineTimeLabel: formatTime(term.grade_submission_deadline_at),
    reopeningOpenDate: reopeningOpen.date,
    reopeningOpenTime: reopeningOpen.time,
    reopeningCloseDate: reopeningClose.date,
    reopeningCloseTime: reopeningClose.time,
    finalizedBy: "System deadline",
    timeRemaining: status === "open" ? formatRemaining(term.grade_submission_deadline_at) : "",
    hasGradeSheets: Number(term.total_grade_sheets || 0) > 0,
    canEditStructure: status === "upcoming" && Number(term.total_grade_sheets || 0) === 0,
    canEditDeadline: status !== "finalized",
    readiness: {
      draft: Number(term.draft_count || 0),
      submitted: Number(term.submitted_count || 0),
      locked: Number(term.locked_count || 0),
    },
  };
}

const REQUIRED_TERM_LABELS = ["Term 1", "Term 2", "Term 3"];

function withRequiredTermSlots(terms, schoolYearId) {
  return REQUIRED_TERM_LABELS.map((label, index) => {
    const configured = terms.find((term) => term.label === label);
    if (configured) return configured;

    return {
      id: `unconfigured-${schoolYearId}-term-${index + 1}`,
      schoolYearId: String(schoolYearId),
      label,
      isConfigured: false,
      status: "upcoming",
      statusLabel: "Not configured",
      progress: 0,
      periodLabel: "Schedule not set",
      startDate: "",
      startDateLabel: "Not scheduled",
      endDate: "",
      endDateLabel: "Not scheduled",
      deadlineDate: "",
      deadlineDateLabel: "Not scheduled",
      deadlineTime: "23:59",
      deadlineTimeLabel: "Not scheduled",
      reopeningOpenDate: "",
      reopeningOpenTime: "00:00",
      reopeningCloseDate: "",
      reopeningCloseTime: "23:59",
      hasGradeSheets: false,
      canEditStructure: true,
      canEditDeadline: true,
      readiness: {},
    };
  });
}

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function resolveAttachmentUrl(value) {
  if (!value) return null;

  const normalized = String(value).trim().replace(/\\/g, "/");
  if (!normalized) return null;
  if (/^(https?:|blob:|data:)/i.test(normalized)) return normalized;

  return `${API_ORIGIN}/${normalized.replace(/^\/+/, "")}`;
}

function mapRequest(row) {
  const attachmentName = row.file_name || null;
  const attachmentUrl = resolveAttachmentUrl(
    row.attachment_url || row.file_path || null,
  );
  const attachmentType = row.file_type || null;
  const hasAttachmentSize = ![null, undefined, ""].includes(row.file_size);
  const attachmentSize = hasAttachmentSize ? Number(row.file_size) : null;
  const hasAttachmentMetadata = Boolean(
    attachmentName ||
      attachmentUrl ||
      attachmentType ||
      (hasAttachmentSize && Number.isFinite(attachmentSize)),
  );

  return {
    id: String(row.request_id),
    gradeSheetId: String(row.grade_sheet_id),
    termId: String(row.term_id || row.grade_sheet_term_id || ""),
    teacherId: String(row.teacher_id),
    teacherName: row.teacher_name,
    teacherInitials: initials(row.teacher_name),
    subjectId: String(row.subject_id),
    subject: row.subject_name,
    department: row.department_name,
    gradeLevel: row.grade_level_name,
    sectionId: String(row.section_id),
    section: row.section_name,
    reason: row.reason,
    attachment: hasAttachmentMetadata ? {
      name: attachmentName,
      url: attachmentUrl,
      type: attachmentType,
      size: Number.isFinite(attachmentSize) ? attachmentSize : null,
    } : null,
    requestedAt: new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: MANILA_TIMEZONE,
    }).format(new Date(row.requested_at)),
    status: String(row.status || "pending").toLowerCase(),
  };
}

function mapActive(row) {
  const starts = new Date(row.starts_at).getTime();
  const expires = new Date(row.expires_at).getTime();
  const minutes = Math.max(0, Math.round((expires - starts) / 60000));
  return {
    id: String(row.temporary_reopening_id),
    requestId: String(row.request_id),
    termId: String(row.term_id || row.grade_sheet_term_id || ""),
    teacherId: String(row.teacher_id),
    teacherName: row.teacher_name,
    subjectId: String(row.subject_id),
    subject: row.subject_name,
    gradeLevel: row.grade_level_name,
    sectionId: String(row.section_id),
    section: row.section_name,
    reason: row.reason,
    reopenUntil: new Date(row.expires_at).toISOString(),
    status: "temporarily-unlocked",
    approvedBy: row.approved_by || "System Administrator",
    durationLabel: minutes >= 1440 ? `${Math.round(minutes / 1440)} day${minutes >= 2880 ? "s" : ""}` : `${minutes} minutes`,
  };
}

export function mapGradingPeriodContext(payload) {
  const schoolYears = payload.schoolYears.map((year) => ({
    id: String(year.school_year_id),
    label: formatSchoolYear(year),
    status: String(year.status).toLowerCase(),
  }));
  const terms = withRequiredTermSlots(
    payload.terms.map(mapTerm),
    payload.selectedSchoolYearId,
  );
  const upcomingPeriods = payload.upcomingSchoolYear
    ? withRequiredTermSlots(
        (payload.upcomingTerms || []).map(mapTerm),
        payload.upcomingSchoolYear.school_year_id,
      )
    : [];
  const mappedSuggestions = (payload.suggestedUpcomingTerms || []).map(
    (term, index) =>
      mapTerm({
        ...term,
        term_id: `calendar-suggestion-${index + 1}`,
        computed_status: "upcoming",
      }),
  );
  const suggestedUpcomingPeriods = upcomingPeriods.map((period) => {
    const suggestion = mappedSuggestions.find(
      (candidate) => candidate.label === period.label,
    );
    if (!suggestion) return { ...period };

    return {
      ...period,
      periodLabel: suggestion.periodLabel,
      startDate: suggestion.startDate,
      startDateLabel: suggestion.startDateLabel,
      endDate: suggestion.endDate,
      endDateLabel: suggestion.endDateLabel,
      deadlineDate: suggestion.deadlineDate,
      deadlineDateLabel: suggestion.deadlineDateLabel,
      deadlineTime: suggestion.deadlineTime,
      deadlineTimeLabel: suggestion.deadlineTimeLabel,
      reopeningOpenDate: suggestion.reopeningOpenDate,
      reopeningOpenTime: suggestion.reopeningOpenTime,
      reopeningCloseDate: suggestion.reopeningCloseDate,
      reopeningCloseTime: suggestion.reopeningCloseTime,
    };
  });
  const upcomingYear = payload.upcomingSchoolYear;
  return {
    schoolYears,
    selectedSchoolYearId: String(payload.selectedSchoolYearId || ""),
    terms,
    departmentsByTerm: payload.departmentsByTerm || {},
    reopeningRequests: payload.reopeningRequests.map((row) => ({ ...mapRequest(row), termId: String(row.term_id) })),
    activeReopenings: payload.activeReopenings.map((row) => ({ ...mapActive(row), termId: String(row.term_id) })),
    upcomingSchoolYear: upcomingYear ? {
      id: String(upcomingYear.school_year_id),
      label: formatSchoolYear(upcomingYear),
      calendarRule: payload.upcomingCalendarRule || null,
    } : null,
    upcomingPeriods,
    suggestedUpcomingPeriods,
  };
}

export async function getGradingPeriodContext(userId, schoolYearId) {
  const query = schoolYearId ? `?school_year_id=${encodeURIComponent(schoolYearId)}` : "";
  const payload = await request(`/grading-periods/context${query}`, { userId });
  return mapGradingPeriodContext(payload);
}

export function updateTermTimeline(userId, termId, payload) {
  return request(`/grading-periods/terms/${termId}/timeline`, {
    userId, method: "PATCH", body: payload,
  });
}

export function createTermTimeline(userId, payload) {
  return request("/grading-periods/terms", {
    userId, method: "POST", body: payload,
  });
}

export function approveReopeningRequest(userId, requestId, payload) {
  return request(`/grading-periods/reopening-requests/${requestId}/approve`, {
    userId, method: "PATCH", body: payload,
  });
}

export function denyReopeningRequest(userId, requestId, payload) {
  return request(`/grading-periods/reopening-requests/${requestId}/deny`, {
    userId, method: "PATCH", body: payload,
  });
}

export async function getReopeningActivity(userId, reopeningId) {
  const payload = await request(`/grading-periods/temporary-reopenings/${reopeningId}/activity`, { userId });
  return payload.events.map((event) => ({
    ...event,
    time: event.time
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: MANILA_TIMEZONE,
        }).format(new Date(event.time))
      : "Pending",
    state: event.state === "scheduled" ? "upcoming" : "complete",
  }));
}

export async function getReopeningGradeSheetOptions(userId) {
  const payload = await request('/grading-periods/grade-sheets/reopening-options', {
    userId,
  });
  return payload.gradeSheets || [];
}

export function createGradeSheetReopeningRequest(userId, gradeSheetId, reason) {
  return request(
    `/grading-periods/grade-sheets/${encodeURIComponent(gradeSheetId)}/reopening-requests`,
    {
      userId,
      method: 'POST',
      body: { reason },
    },
  );
}

export async function getActiveSchoolYear(userId) {
  try {
    const payload = await request('/grading-periods/context', { userId });
    const context = mapGradingPeriodContext(payload);
    return {
      activeTerm: context.activeSchoolYear?.active_term || 'T1',
      ...context.activeSchoolYear,
    };
  } catch (e) {
    return { activeTerm: 'T1' };
  }
}

const gradingPeriodService = {
  getActiveSchoolYear,
  getGradingPeriodContext,
  updateTermTimeline,
  createTermTimeline,
  approveReopeningRequest,
  denyReopeningRequest,
  getReopeningActivity,
  getReopeningGradeSheetOptions,
  createGradeSheetReopeningRequest,
};

export default gradingPeriodService;
