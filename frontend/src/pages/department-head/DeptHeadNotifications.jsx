import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/adviserNotifications.css";
import {
  fetchDeptHeadNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../../services/notificationApi";
import { getStoredUser } from "../../utils/auth";

export function resolveDeptHeadNotificationPath(notification) {
  if (notification.action_link) return notification.action_link;
  const type = String(notification.type || "").toUpperCase();
  const text = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();

  if (type === "PHIL_IRI" || text.includes("phil-iri") || text.includes("reading")) {
    return "/department-head/phil-iri";
  }
  if (
    type === "SUBMISSION" ||
    type === "REQUEST" ||
    type === "DEADLINE" ||
    text.includes("submission") ||
    text.includes("reopen") ||
    text.includes("class record")
  ) {
    return "/department-head/class-records";
  }
  if (
    type === "AT_RISK" ||
    type === "SUMMARY" ||
    text.includes("summary") ||
    text.includes("risk") ||
    text.includes("analytics")
  ) {
    return "/department-head/dashboard";
  }
  return "/department-head/dashboard";
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

export default function DeptHeadNotifications() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("all");
  const [items, setItems] = useState({ today: [], yesterday: [] });
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const user = getStoredUser();
      const userId = user?.user_id || user?.id || null;
      const res = await fetchDeptHeadNotifications(userId);
      if (res && res.notifications) {
        setItems({
          today: res.notifications.today || [],
          yesterday: res.notifications.yesterday || [],
        });
      } else {
        setItems({ today: [], yesterday: [] });
      }
    } catch (err) {
      console.warn("Could not fetch department notifications:", err);
      setItems({ today: [], yesterday: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleToggleRead = async (id, isCurrentlyUnread) => {
    // Optimistic UI update
    setItems((prev) => ({
      today: prev.today.map((n) =>
        n.id === id ? { ...n, unread: !n.unread } : n
      ),
      yesterday: prev.yesterday.map((n) =>
        n.id === id ? { ...n, unread: !n.unread } : n
      ),
    }));

    if (isCurrentlyUnread && (typeof id === "number" || /^\d+$/.test(String(id)))) {
      await markNotificationAsRead(id);
    }
  };

  const handleCardClick = (notification) => {
    if (notification.unread) {
      handleToggleRead(notification.id, true);
    }
    const targetPath = resolveDeptHeadNotificationPath(notification);
    if (targetPath) {
      navigate(targetPath);
    }
  };

  const handleMarkAllRead = async () => {
    setItems((prev) => ({
      today: prev.today.map((n) => ({ ...n, unread: false })),
      yesterday: prev.yesterday.map((n) => ({ ...n, unread: false })),
    }));
    const user = getStoredUser();
    const userId = user?.user_id || user?.id || null;
    await markAllNotificationsAsRead(userId);
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
