import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/adviserNotifications.css";
import {
  fetchAdviserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../../services/notificationApi";
import { getStoredUser } from "../../utils/auth";

export function resolveNotificationPath(notification, role = "adviser") {
  const isTeacher = role === "teacher";
  const base = isTeacher ? "/teacher" : "/adviser";

  // 1. Explicit action_link if present
  if (notification.action_link) {
    if (isTeacher) {
      return notification.action_link.replace(/^\/adviser\//, "/teacher/");
    }
    return notification.action_link;
  }

  // 2. Intelligent resolution by type, entity, and text
  const type = String(notification.type || "").toUpperCase();
  const text = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();

  // Phil-IRI reading assessment
  if (type === "PHIL_IRI" || text.includes("phil-iri") || text.includes("reading")) {
    return `${base}/phil-iri`;
  }

  // Attendance & Absenteeism
  if (
    type === "ATTENDANCE" ||
    text.includes("attendance") ||
    text.includes("absent") ||
    text.includes("absences")
  ) {
    return isTeacher ? "/teacher/sections" : "/adviser/attendance";
  }

  // Feedback from principal or dept head
  if (type === "FEEDBACK" || text.includes("feedback")) {
    return `${base}/feedback`;
  }

  // Grade reopening requests & temporary access
  if (
    type === "REQUEST" ||
    text.includes("reopen") ||
    text.includes("reopening") ||
    text.includes("temporary access")
  ) {
    return `${base}/request`;
  }

  // At-risk student predictions and grade alerts
  if (
    type === "AT_RISK" ||
    text.includes("at-risk") ||
    text.includes("risk") ||
    text.includes("failing")
  ) {
    return `${base}/performance`;
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
    return isTeacher ? "/teacher/sections" : "/adviser/master-sheet";
  }

  // General fallback
  return `${base}/sections`;
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
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
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
        setItems({ today: [], yesterday: [] });
      }
    } catch (err) {
      console.warn("Could not fetch adviser notifications:", err);
      setItems({ today: [], yesterday: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

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

  const handleCardClick = (notification) => {
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

    // 3. Resolve destination URL and navigate
    const targetPath = resolveNotificationPath(notification, userRole);
    if (targetPath) {
      navigate(targetPath);
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

        {!hasToday && !hasYesterday && (
          <div className="notifications-empty-state">
            <p>
              {loading
                ? "Loading notifications..."
                : activeFilter === "unread"
                ? "No unread notifications."
                : "No notifications available."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
