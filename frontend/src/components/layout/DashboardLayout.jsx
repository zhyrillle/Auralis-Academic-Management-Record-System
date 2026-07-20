import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import "../../styles/sidebar.css";

export default function DashboardLayout({ user, onRoleChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const handleRoleChange = (newRole) => {
    if (onRoleChange) {
      onRoleChange(newRole);
    }
    
    // Redirect to the appropriate role-based dashboard route
    const roleLower = newRole.toLowerCase();
    if (roleLower === "system-admin" || roleLower === "admin") {
      navigate("/system-admin/dashboard");
    } else if (roleLower === "principal") {
      navigate("/principal/dashboard");
    } else if (roleLower === "department-head" || roleLower === "departmenthead") {
      navigate("/department-head/dashboard");
    } else if (roleLower === "adviser") {
      navigate("/adviser/dashboard");
    } else if (roleLower === "teacher" || roleLower === "subjectteacher") {
      navigate("/teacher/dashboard");
    }
  };

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
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Main Page Area */}
      <div className="main-content-wrapper">
        {/* Top Navbar */}
        <Navbar
          user={user}
          onRoleChange={handleRoleChange}
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
