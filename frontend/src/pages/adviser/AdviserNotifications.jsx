import React, { useState } from "react";
import "../../styles/adviserNotifications.css";

const notifications = {
    today: [
        {
            id: 1,
            title: "Grade Submission Reminder",
            message:
                "Quarter 2 grades for Grade 9 – Rizal remain incomplete. Pending teachers: Mathematics, Science, English",
            timestamp: "2 mins",
            unread: true,
        },
        {
            id: 2,
            title: "At-Risk Student Detected",
            message:
                "Sabrina Aryan has been identified as Moderate Risk due to declining grades and attendance.",
            timestamp: "15 mins",
            unread: true,
        },
        {
            id: 3,
            title: "SF9 Report Generated",
            message:
                "SF9 records for Grade 8 – Mabini were successfully generated and validated.",
            timestamp: "1 hour",
            unread: false,
        },
    ],

    yesterday: [
        {
            id: 4,
            title: "Grade Submission Completed",
            message:
                "All subject teachers for Grade 10 – Bonifacio have submitted their Quarter 2 grades.",
            timestamp: "Yesterday",
            unread: false,
        },
        {
            id: 5,
            title: "Intervention Record Updated",
            message:
                "An intervention record for a Grade 9 student has been successfully updated.",
            timestamp: "Yesterday",
            unread: false,
        },
        {
            id: 6,
            title: "SF10 Report Generated",
            message:
                "SF10 records for Grade 9 – Rizal were successfully generated.",
            timestamp: "Yesterday",
            unread: false,
        },
    ],
};

function NotificationCard({ notification }) {
    return (
        <div
            className={`notification-card ${notification.unread ? "notification-unread" : ""
                }`}
        >
            <div className="notification-content">
                <h3 className="notification-item-title">
                    {notification.title}
                </h3>

                <p className="notification-item-message">
                    {notification.message}
                </p>
            </div>

            <span className="notification-timestamp">
                {notification.timestamp}
            </span>
        </div>
    );
}

export default function AdviserNotifications() {
    const [activeFilter, setActiveFilter] = useState("all");

    const filterNotifications = (items) => {
        if (activeFilter === "unread") {
            return items.filter((notification) => notification.unread);
        }

        return items;
    };

    const todayNotifications = filterNotifications(notifications.today);
    const yesterdayNotifications = filterNotifications(notifications.yesterday);

    const hasTodayNotifications = todayNotifications.length > 0;
    const hasYesterdayNotifications = yesterdayNotifications.length > 0;

    return (
        <div className="notifications-page-container">
            <h1 className="notifications-title">Your Notifications</h1>

            <div className="notifications-filter-group">
                <button
                    type="button"
                    className={`filter-btn ${activeFilter === "all" ? "active" : "inactive"
                        }`}
                    onClick={() => setActiveFilter("all")}
                >
                    ALL
                </button>

                <button
                    type="button"
                    className={`filter-btn ${activeFilter === "unread" ? "active" : "inactive"
                        }`}
                    onClick={() => setActiveFilter("unread")}
                >
                    UNREAD
                </button>
            </div>

            <div className="notifications-list">
                {hasTodayNotifications && (
                    <>
                        <div className="notification-time-divider">TODAY</div>

                        {todayNotifications.map((notification) => (
                            <NotificationCard
                                key={notification.id}
                                notification={notification}
                            />
                        ))}
                    </>
                )}

                {hasYesterdayNotifications && (
                    <>
                        <div className="notification-time-divider">YESTERDAY</div>

                        {yesterdayNotifications.map((notification) => (
                            <NotificationCard
                                key={notification.id}
                                notification={notification}
                            />
                        ))}
                    </>
                )}

                {!hasTodayNotifications && !hasYesterdayNotifications && (
                    <div className="notifications-empty-state">
                        <p>No unread notifications.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
