import { useState } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { isPathAllowedForRole, getRoleDefaultPath } from "../../utils/auth";
import "../../styles/sidebar.css";

export default function DashboardLayout({ user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // 1. Guard: if user is not logged in, redirect to login screen
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // 2. Guard: if user is logged in but navigating to a route outside their role permissions, redirect to default dashboard
  if (!isPathAllowedForRole(location.pathname, user.role)) {
    const defaultPath = getRoleDefaultPath(user.role);
    if (location.pathname !== defaultPath) {
      return <Navigate to={defaultPath} replace />;
    }
  }

  return (
    <div className="dashboard-layout">
      {/* Mobile drawer backdrop overlay */}
      <div
        className={`mobile-overlay ${mobileOpen ? "visible" : ""}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Reusable Sidebar Component */}
      <Sidebar
        user={user}
        onLogout={onLogout}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Main Page Area */}
      <div className="main-content-wrapper">
        {/* Top Navbar */}
        <Navbar
          onToggleSidebar={() => setCollapsed(!collapsed)}
          onToggleMobileSidebar={() => setMobileOpen(!mobileOpen)}
        />

        {/* Content outlet */}
        <main className="page-content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
