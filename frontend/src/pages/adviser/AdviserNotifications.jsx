import PageSkeleton from '../../components/common/PageSkeleton.jsx';
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/adviserNotifications.css";
import {
  fetchAdviserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../../services/notificationApi";
import { getAdviserSections } from "../../services/sectionService";
import { getStoredUser } from "../../utils/auth";

const GENERIC_STUDENT_PATTERN = /^(?:a|an|\d+)\s+(?:at-risk\s+)?(?:learner|student)s?$/i;

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function extractGradeNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? match[0] : "";
}

function normalizeTermCode(value) {
  if (!value) return null;
  const raw = String(value).trim().toUpperCase();
  if (/^T[1-3]$/.test(raw)) return raw;
  if (/^[1-3]$/.test(raw)) return `T${raw}`;
  const numMatch =
    raw.match(/(?:TERM|QUARTER|Q|T)\s*([1-3])\b/) ||
    raw.match(/\b([1-3])(?:ST|ND|RD)\s*(?:TERM|QUARTER)\b/);
  if (numMatch) return `T${numMatch[1]}`;
  if (/\bFIRST\s*(?:TERM|QUARTER)\b/.test(raw)) return "T1";
  if (/\bSECOND\s*(?:TERM|QUARTER)\b/.test(raw)) return "T2";
  if (/\bTHIRD\s*(?:TERM|QUARTER)\b/.test(raw)) return "T3";
  return null;
}

function isAtRiskStudentNotification(notification) {
  const title = String(notification?.title || "").toLowerCase();
  const type = String(notification?.type || "").toUpperCase();
  return (
    title.includes("at-risk student detected") ||
    (type === "AT_RISK" && title.includes("at-risk"))
  );
}

function parseAtRiskMessage(message = "", title = "") {
  const cleanMessage = String(message || "").trim();
  const combined = `${title || ""} ${cleanMessage}`.trim();

  let studentName = null;
  let sectionLabel = null;
  let gradeLevel = null;
  let sectionName = null;
  let subjectName = null;

  const studentSectionMatch = cleanMessage.match(
    /^(.+?)\s+in\s+(Grade\s*\d+\s*[–—-]\s*[^,.;()]+?)(?=\s+(?:has|was|is|have|were)\b|[.,;]|$)/i
  );
  if (studentSectionMatch) {
    const candidateStudent = studentSectionMatch[1].trim();
    if (candidateStudent && !GENERIC_STUDENT_PATTERN.test(candidateStudent)) {
      studentName = candidateStudent;
    }
    sectionLabel = studentSectionMatch[2].trim();
  } else {
    const sectionOnlyMatch = cleanMessage.match(
      /\bin\s+(Grade\s*\d+\s*[–—-]\s*[^,.;()]+?)(?=\s+(?:has|was|is|have|were)\b|[.,;]|$)/i
    );
    if (sectionOnlyMatch) {
      sectionLabel = sectionOnlyMatch[1].trim();
    }
  }

  if (sectionLabel) {
    const parts = sectionLabel.split(/\s*[–—-]\s*/);
    if (parts.length >= 2) {
      gradeLevel = parts[0].trim();
      sectionName = parts.slice(1).join(" - ").trim();
    } else {
      sectionName = sectionLabel;
    }
  }

  const subjectMatch =
    cleanMessage.match(
      /\bfailing grade\s*(?:\([^)]*\))?\s*in\s+([^.(;]+?)(?:\s*\([^)]*\))?(?:[.,;]|$)/i
    ) ||
    cleanMessage.match(
      /\b(?:high|moderate)\s+risk\s+in\s+([^.(;]+?)(?:\s+(?:based|for|during)\b|\s*\(|[.,;]|$)/i
    );
  if (subjectMatch) {
    subjectName = subjectMatch[1]
      .replace(/\s+(?:for|during|in)\s+(?:term|quarter|t)\s*[1-3]\b.*$/i, "")
      .trim();
  }

  const term = normalizeTermCode(combined);

  return {
    studentName,
    sectionLabel,
    gradeLevel,
    sectionName,
    subjectName,
    term,
  };
}

function findMatchingAssignedClass(context, assignedClasses = [], role = "adviser") {
  if (!Array.isArray(assignedClasses) || assignedClasses.length === 0) return null;
  const isTeacher = role === "teacher";

  const getClassAssignmentType = (cls) =>
    cls?.assignmentType || (cls?.isAdviser ? "advisory" : "teaching");
  const getClassAssignmentId = (cls) =>
    cls?.assignmentId || cls?.adviser_assignment_id || cls?.teacher_assignment_id || null;

  if (context.assignmentId && context.assignmentType) {
    const exactAssignment = assignedClasses.find(
      (cls) =>
        Number(getClassAssignmentId(cls)) === Number(context.assignmentId) &&
        getClassAssignmentType(cls) === context.assignmentType
    );
    if (exactAssignment) return exactAssignment;
  }

  if (context.subjectOfferingId) {
    const exactOffering = assignedClasses.find(
      (cls) =>
        Number(cls?.subject_offering_id || cls?.offering_id) === Number(context.subjectOfferingId)
    );
    if (exactOffering) return exactOffering;
  }

  const matchesSection = (cls) => {
    if (context.sectionId != null && (cls?.section_id != null || cls?.sectionId != null)) {
      return Number(cls.section_id ?? cls.sectionId) === Number(context.sectionId);
    }
    if (!context.sectionName) return false;
    const clsSection = normalizeText(cls?.sectionName || cls?.section_name || cls?.section);
    if (!clsSection || clsSection !== normalizeText(context.sectionName)) return false;
    const expectedGrade = extractGradeNumber(context.gradeLevel);
    const clsGrade = extractGradeNumber(cls?.grade_level_name || cls?.gradeLevel);
    return !expectedGrade || !clsGrade || expectedGrade === clsGrade;
  };

  const sectionMatches = assignedClasses.filter(matchesSection);
  if (sectionMatches.length === 0) return null;

  if (context.subjectName) {
    const targetSubject = normalizeText(context.subjectName);
    const teachingSubjectMatch = sectionMatches.find(
      (cls) =>
        getClassAssignmentType(cls) === "teaching" &&
        normalizeText(cls?.subject || cls?.subject_name) === targetSubject
    );
    if (teachingSubjectMatch) return teachingSubjectMatch;
  }

  if (isTeacher || context.assignmentType === "teaching") {
    const teachingMatch = sectionMatches.find((cls) => getClassAssignmentType(cls) === "teaching");
    if (teachingMatch) return teachingMatch;
  }

  const advisoryMatch = sectionMatches.find((cls) => getClassAssignmentType(cls) === "advisory");
  if (advisoryMatch) return advisoryMatch;

  return sectionMatches[0];
}

export function resolveNotificationNavigation(
  notification,
  role = "adviser",
  assignedClasses = []
) {
  const isTeacher = role === "teacher";
  const base = isTeacher ? "/teacher" : "/adviser";

  // Dedicated handling for "At-Risk Student Detected" -> corresponding Section Details
  if (isAtRiskStudentNotification(notification)) {
    let linkParams = null;
    if (notification.action_link && notification.action_link.includes("/sections/details")) {
      const queryIdx = notification.action_link.indexOf("?");
      if (queryIdx !== -1) {
        linkParams = new URLSearchParams(notification.action_link.slice(queryIdx + 1));
      }
    }

    const parsed = parseAtRiskMessage(notification.message, notification.title);

    const sectionId =
      linkParams?.get("sectionId") ||
      notification.section_id ||
      notification.sectionId ||
      null;
    const assignmentId =
      linkParams?.get("assignmentId") ||
      notification.assignment_id ||
      notification.assignmentId ||
      null;
    const assignmentType =
      linkParams?.get("assignmentType") ||
      notification.assignment_type ||
      notification.assignmentType ||
      null;
    const subjectOfferingId =
      notification.subject_offering_id ||
      notification.subjectOfferingId ||
      (String(notification.related_entity_type || "").toUpperCase() === "SUBJECT_OFFERING"
        ? notification.related_entity_id
        : null);
    const studentId =
      linkParams?.get("studentId") ||
      notification.student_id ||
      notification.studentId ||
      (String(notification.related_entity_type || "").toUpperCase() === "STUDENT"
        ? notification.related_entity_id
        : null);
    const studentName =
      linkParams?.get("studentName") ||
      linkParams?.get("student") ||
      notification.student_name ||
      notification.studentName ||
      parsed.studentName ||
      null;
    const sectionName =
      notification.section_name ||
      notification.sectionName ||
      parsed.sectionName ||
      null;
    const gradeLevel =
      notification.grade_level_name ||
      notification.gradeLevel ||
      parsed.gradeLevel ||
      null;
    const subjectName =
      notification.subject_name ||
      notification.subjectName ||
      parsed.subjectName ||
      null;
    const term =
      normalizeTermCode(linkParams?.get("term")) ||
      normalizeTermCode(notification.term) ||
      parsed.term ||
      null;

    const matchedClass = findMatchingAssignedClass(
      {
        sectionId,
        assignmentId,
        assignmentType,
        subjectOfferingId,
        subjectName,
        sectionName,
        gradeLevel,
      },
      assignedClasses,
      role
    );

    const finalSectionId =
      sectionId || matchedClass?.section_id || matchedClass?.sectionId || null;
    const finalAssignmentType =
      assignmentType ||
      matchedClass?.assignmentType ||
      (matchedClass ? (matchedClass.isAdviser ? "advisory" : "teaching") : isTeacher ? "teaching" : "advisory");
    const finalAssignmentId =
      assignmentId ||
      matchedClass?.assignmentId ||
      matchedClass?.adviser_assignment_id ||
      matchedClass?.teacher_assignment_id ||
      finalSectionId ||
      null;
    const finalTerm = term || normalizeTermCode(matchedClass?.active_term) || null;

    if (finalSectionId || finalAssignmentId) {
      const params = new URLSearchParams();
      if (finalSectionId) params.set("sectionId", String(finalSectionId));
      if (finalAssignmentId) params.set("assignmentId", String(finalAssignmentId));
      if (finalAssignmentType) params.set("assignmentType", String(finalAssignmentType));
      if (finalTerm) params.set("term", finalTerm);
      if (studentId) params.set("studentId", String(studentId));
      if (studentName) params.set("studentName", String(studentName));

      const targetSection = {
        ...(matchedClass || {}),
        section_id: finalSectionId ? Number(finalSectionId) || finalSectionId : matchedClass?.section_id,
        sectionId: finalSectionId ? Number(finalSectionId) || finalSectionId : matchedClass?.section_id,
        assignmentId: finalAssignmentId ? Number(finalAssignmentId) || finalAssignmentId : matchedClass?.assignmentId,
        assignmentType: finalAssignmentType,
        isAdviser: finalAssignmentType === "advisory",
        ...(sectionName && !matchedClass?.sectionName ? { sectionName } : {}),
      };

      return {
        path: `${base}/sections/details?${params.toString()}`,
        state: {
          section: targetSection,
          activeClass: targetSection,
          ...(finalTerm ? { term: finalTerm } : {}),
          ...(studentId ? { studentId: Number(studentId) || studentId } : {}),
          ...(studentName ? { studentName } : {}),
          fromNotification: true,
        },
      };
    }

    return { path: `${base}/sections`, state: undefined };
  }

  // 1. Explicit action_link if present
  if (notification.action_link) {
    if (isTeacher) {
      return {
        path: notification.action_link.replace(/^\/adviser\//, "/teacher/"),
        state: undefined,
      };
    }
    return { path: notification.action_link, state: undefined };
  }

  // 2. Intelligent resolution by type, entity, and text
  const type = String(notification.type || "").toUpperCase();
  const text = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();

  // Phil-IRI reading assessment
  if (type === "PHIL_IRI" || text.includes("phil-iri") || text.includes("reading")) {
    return { path: `${base}/phil-iri`, state: undefined };
  }

  // Attendance & Absenteeism
  if (
    type === "ATTENDANCE" ||
    text.includes("attendance") ||
    text.includes("absent") ||
    text.includes("absences")
  ) {
    return {
      path: isTeacher ? "/teacher/sections" : "/adviser/attendance",
      state: undefined,
    };
  }

  // Feedback from principal or dept head
  if (type === "FEEDBACK" || text.includes("feedback")) {
    return { path: `${base}/feedback`, state: undefined };
  }

  // Grade reopening requests & temporary access
  if (
    type === "REQUEST" ||
    text.includes("reopen") ||
    text.includes("reopening") ||
    text.includes("temporary access")
  ) {
    return { path: `${base}/request`, state: undefined };
  }

  // At-risk student predictions and grade alerts
  if (
    type === "AT_RISK" ||
    text.includes("at-risk") ||
    text.includes("risk") ||
    text.includes("failing")
  ) {
    return { path: `${base}/performance`, state: undefined };
  }

  // Grade submissions, master sheets, SF9, SF10, deadlines
  if (
    type === "SUBMISSION" ||
    type === "SUMMARY" ||
    type === "DEADLINE" ||
    text.includes("grade") ||
    text.includes("sf9") ||
    text.includes("sf10") ||
    text.includes("master sheet") ||
    text.includes("submission")
  ) {
    return {
      path: isTeacher ? "/teacher/sections" : "/adviser/master-sheet",
      state: undefined,
    };
  }

  // General fallback
  return { path: `${base}/sections`, state: undefined };
}

export function resolveNotificationPath(
  notification,
  role = "adviser",
  assignedClasses = []
) {
  return resolveNotificationNavigation(notification, role, assignedClasses).path;
}

const READ_STORAGE_KEY_PREFIX = "auralis_read_notifications_";

function getStoredReadIds(userId) {
  try {
    const raw = localStorage.getItem(`${READ_STORAGE_KEY_PREFIX}${userId || "guest"}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveStoredReadIds(userId, idsSet) {
  try {
    localStorage.setItem(
      `${READ_STORAGE_KEY_PREFIX}${userId || "guest"}`,
      JSON.stringify(Array.from(idsSet).map(String))
    );
  } catch (err) {
    console.warn("Failed to save read notifications to localStorage:", err);
  }
}

function NotificationCard({ notification, onClick }) {
  return (
    <div
      className={`notification-card ${
        notification.unread ? "notification-unread" : ""
      }`}
      onClick={() => onClick(notification)}
      style={{ cursor: "pointer" }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(notification);
        }
      }}
    >
      <div className="notification-content">
        <h3 className="notification-item-title">{notification.title}</h3>
        <p className="notification-item-message">{notification.message}</p>
      </div>

      <span className="notification-timestamp">{notification.timestamp}</span>
    </div>
  );
}

export default function AdviserNotifications({ userRole = "adviser" }) {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("all");
  const [items, setItems] = useState({ today: [], yesterday: [] });
  const [assignedClasses, setAssignedClasses] = useState(() => {
    try {
      const user = getStoredUser();
      const userId = user?.user_id || user?.id;
      if (!userId) return [];
      const raw = localStorage.getItem(`auralis_assigned_classes_${userId}`);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const user = getStoredUser();
      const userId = user?.user_id || user?.id || null;
      const readSet = getStoredReadIds(userId);

      const res = await fetchAdviserNotifications(userId);
      if (res && res.notifications) {
        const processList = (list = []) =>
          list.map((item) => {
            const isReadInStorage = readSet.has(String(item.id));
            return {
              ...item,
              unread: isReadInStorage ? false : (item.unread !== undefined ? item.unread : true),
            };
          });

        setItems({
          today: processList(res.notifications.today || []),
          yesterday: processList(res.notifications.yesterday || []),
        });
      } else {
        throw new Error("Notifications could not be loaded.");
      }
    } catch (err) {
      setLoadError(err.message || "Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    let cancelled = false;
    const user = getStoredUser();
    const userId = user?.user_id || user?.id || null;
    if (!userId) return undefined;

    getAdviserSections(userId)
      .then((sections) => {
        if (!cancelled && Array.isArray(sections)) {
          setAssignedClasses(sections);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleRead = async (id, makeUnread) => {
    const user = getStoredUser();
    const userId = user?.user_id || user?.id || null;
    const readSet = getStoredReadIds(userId);

    if (makeUnread) {
      readSet.delete(String(id));
    } else {
      readSet.add(String(id));
    }
    saveStoredReadIds(userId, readSet);

    setItems((prev) => ({
      today: (prev.today || []).map((n) =>
        String(n.id) === String(id) ? { ...n, unread: makeUnread } : n
      ),
      yesterday: (prev.yesterday || []).map((n) =>
        String(n.id) === String(id) ? { ...n, unread: makeUnread } : n
      ),
    }));

    if (!makeUnread && (typeof id === "number" || /^\d+$/.test(String(id)))) {
      await markNotificationAsRead(id);
    }
  };

  const handleCardClick = async (notification) => {
    const user = getStoredUser();
    const userId = user?.user_id || user?.id || null;

    // 1. Mark as read immediately in storage & state
    const readSet = getStoredReadIds(userId);
    readSet.add(String(notification.id));
    saveStoredReadIds(userId, readSet);

    setItems((prev) => ({
      today: (prev.today || []).map((n) =>
        String(n.id) === String(notification.id) ? { ...n, unread: false } : n
      ),
      yesterday: (prev.yesterday || []).map((n) =>
        String(n.id) === String(notification.id) ? { ...n, unread: false } : n
      ),
    }));

    // 2. Persist to DB if numeric ID
    if (typeof notification.id === "number" || /^\d+$/.test(String(notification.id))) {
      markNotificationAsRead(notification.id).catch(() => {});
    }

    // 3. Resolve destination URL and state (fetch assigned classes on cold cache if needed for legacy at-risk alerts)
    let classesForLookup = assignedClasses;
    const needsClassLookup =
      isAtRiskStudentNotification(notification) &&
      classesForLookup.length === 0 &&
      userId &&
      !notification.section_id &&
      !notification.sectionId &&
      !notification.assignment_id &&
      !notification.assignmentId &&
      !(notification.action_link && notification.action_link.includes("/sections/details"));

    if (needsClassLookup) {
      try {
        const fetched = await getAdviserSections(userId);
        if (Array.isArray(fetched) && fetched.length > 0) {
          classesForLookup = fetched;
          setAssignedClasses(fetched);
        }
      } catch {
        // Proceed with fallback navigation
      }
    }

    const { path, state } = resolveNotificationNavigation(
      notification,
      userRole,
      classesForLookup
    );
    if (path) {
      navigate(path, state ? { state } : undefined);
    }
  };

  const handleMarkAllRead = async () => {
    const user = getStoredUser();
    const userId = user?.user_id || user?.id || null;

    const readSet = getStoredReadIds(userId);
    const allIds = [
      ...(items.today || []).map((n) => String(n.id)),
      ...(items.yesterday || []).map((n) => String(n.id)),
    ];
    allIds.forEach((id) => readSet.add(id));
    saveStoredReadIds(userId, readSet);

    setItems((prev) => ({
      today: (prev.today || []).map((n) => ({ ...n, unread: false })),
      yesterday: (prev.yesterday || []).map((n) => ({ ...n, unread: false })),
    }));

    const markRes = await markAllNotificationsAsRead(userId);
    return markRes;
  };

  const filterList = (list) => {
    if (activeFilter === "unread") {
      return list.filter((n) => n.unread);
    }
    return list;
  };

  const todayList = filterList(items.today || []);
  const yesterdayList = filterList(items.yesterday || []);

  const hasToday = todayList.length > 0;
  const hasYesterday = yesterdayList.length > 0;
  const totalUnread =
    (items.today || []).filter((n) => n.unread).length +
    (items.yesterday || []).filter((n) => n.unread).length;

  return (
    <div className="notifications-page-container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h1 className="notifications-title" style={{ margin: 0 }}>
          Your Notifications
        </h1>
        {totalUnread > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            style={{
              background: "transparent",
              border: "none",
              color: "#3b82f6",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              padding: "6px 12px",
              borderRadius: "6px",
            }}
          >
            Mark all as read
          </button>
        )}
      </div>

      {loadError && <div className="notifications-load-error" role="alert">
        <p>{loadError}</p><button type="button" onClick={loadNotifications}>Retry</button>
      </div>}
      <div className="notifications-filter-group">
        <button
          type="button"
          className={`filter-btn ${
            activeFilter === "all" ? "active" : "inactive"
          }`}
          onClick={() => setActiveFilter("all")}
        >
          ALL
        </button>

        <button
          type="button"
          className={`filter-btn ${
            activeFilter === "unread" ? "active" : "inactive"
          }`}
          onClick={() => setActiveFilter("unread")}
        >
          UNREAD
        </button>
      </div>

      <div className="notifications-list">
        {hasToday && (
          <>
            <div className="notification-time-divider">TODAY</div>
            {todayList.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onClick={handleCardClick}
              />
            ))}
          </>
        )}

        {hasYesterday && (
          <>
            <div className="notification-time-divider">YESTERDAY</div>
            {yesterdayList.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onClick={handleCardClick}
              />
            ))}
          </>
        )}

        {!loadError && !hasToday && !hasYesterday && (
          <div className="notifications-empty-state">
            {loading ? <PageSkeleton label="Loading notifications" layout="cards" rows={3} /> : <p>{activeFilter === "unread"
                ? "No unread notifications."
                : "No notifications available."}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
