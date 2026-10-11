/**
 * Notification Service
 *
 * Provides API communication for fetching, reading, and managing user
 * notifications (Department Head, Adviser, etc.).
 */

import { getStoredUser } from "../utils/auth";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed.");
  }
  return data;
};

/**
 * Fetches notifications for the Department Head.
 * @param {string|number} [userId]
 */
export async function fetchDeptHeadNotifications(userId = null) {
  try {
    const resolvedUserId = userId ?? getStoredUser()?.user_id ?? getStoredUser()?.id ?? null;
    const url = resolvedUserId
      ? `${API_BASE_URL}/notifications/department-head?user_id=${encodeURIComponent(resolvedUserId)}`
      : `${API_BASE_URL}/notifications/department-head`;
    const headers = resolvedUserId ? { "x-auralis-user-id": String(resolvedUserId) } : {};
    const res = await fetch(url, { headers });
    return await parseResponse(res);
  } catch (error) {
    console.warn("Could not fetch department head notifications:", error);
    return null;
  }
}

/**
 * Marks a notification as read.
 * @param {string|number} notificationId
 */
export async function markNotificationAsRead(notificationId) {
  try {
    const res = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });
    return await parseResponse(res);
  } catch (error) {
    console.warn("Failed to mark notification as read:", error);
    return { success: false };
  }
}

/**
 * Marks all notifications as read for a user.
 * @param {string|number} [userId]
 */
export async function markAllNotificationsAsRead(userId = null) {
  try {
    const resolvedUserId = userId ?? getStoredUser()?.user_id ?? getStoredUser()?.id ?? null;
    const headers = { "Content-Type": "application/json" };
    if (resolvedUserId) headers["x-auralis-user-id"] = String(resolvedUserId);

    const res = await fetch(`${API_BASE_URL}/notifications/mark-all-read`, {
      method: "POST",
      headers,
      body: JSON.stringify({ user_id: resolvedUserId }),
    });
    return await parseResponse(res);
  } catch (error) {
    console.warn("Failed to mark all notifications as read:", error);
    return { success: false };
  }
}
