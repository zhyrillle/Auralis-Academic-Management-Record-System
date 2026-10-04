import React, { useState, useEffect, useCallback } from "react";
import "../../styles/adviserNotifications.css";
import {
  fetchDeptHeadNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../../services/notificationApi";
import { getStoredUser } from "../../utils/auth";

const defaultFallbackNotifications = {
  today: [
    {
      id: "dept-1",
      title: "Grade Submission Received — Mathematics",
      message:
        "Mr. Juan Dela Cruz submitted Quarter 2 final grades for Grade 9 – Rizal (Mathematics).",
      timestamp: "5 mins",
      unread: true,
      type: "grade_submission",
    },
    {
      id: "dept-2",
      title: "At-Risk Alert — Science Department",
      message:
        "4 students in Grade 9 – Einstein have been flagged with high risk in Science based on quarterly assessments.",
      timestamp: "30 mins",
      unread: true,
      type: "at_risk_alert",
    },
    {
      id: "dept-3",
      title: "Grade Submission Deadline Reminder",
      message:
        "Quarter 2 grade submission window closes in 3 days. 2 subject teachers in your department have pending records.",
      timestamp: "2 hours",
      unread: true,
      type: "deadline_reminder",
    },
  ],
  yesterday: [
    {
      id: "dept-4",
      title: "Grade Reopening Request Endorsed",
      message:
        "Grade reopening request for Grade 8 – Mabini (English) has been approved and unlocked for 48 hours.",
      timestamp: "Yesterday",
      unread: false,
      type: "reopen_request",
    },
    {
      id: "dept-5",
      title: "Department Performance Summary Ready",
      message:
        "Consolidated pass rates and subject master sheets for Quarter 1 have been finalized and archived.",
      timestamp: "Yesterday",
      unread: false,
      type: "summary",
    },
  ],
};

function NotificationCard({ notification, onToggleRead }) {
  return (
    <div
      className={`notification-card ${
        notification.unread ? "notification-unread" : ""
      }`}
      onClick={() => onToggleRead(notification.id, notification.unread)}
      style={{ cursor: "pointer" }}
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
  const [activeFilter, setActiveFilter] = useState("all");
  const [items, setItems] = useState(defaultFallbackNotifications);
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
      }
    } catch (err) {
      console.warn("Could not fetch department notifications:", err);
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

    if (isCurrentlyUnread && typeof id === "number") {
      await markNotificationAsRead(id);
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h1 className="notifications-title" style={{ margin: 0 }}>Your Notifications</h1>
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
                onToggleRead={handleToggleRead}
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
                onToggleRead={handleToggleRead}
              />
            ))}
          </>
        )}

        {!hasToday && !hasYesterday && (
          <div className="notifications-empty-state">
            <p>{loading ? "Loading notifications..." : "No unread notifications."}</p>
          </div>
        )}
      </div>
    </div>
  );
}

