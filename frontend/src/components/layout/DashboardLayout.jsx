import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { isPathAllowedForRole } from "../../utils/auth";
import { WifiOff, BookOpen } from "lucide-react";
import AccessDeniedPage from "./AccessDeniedPage";
import "../../styles/sidebar.css";

function isOfflineSupportedRoute(pathname) {
  if (!pathname) return false;
  return (
    pathname.startsWith("/class-record") ||
    pathname === "/adviser/sections" ||
    pathname === "/teacher/sections" ||
    pathname.startsWith("/adviser/sections/") ||
    pathname.startsWith("/teacher/sections/") ||
    pathname === "/adviser/attendance" ||
    pathname === "/adviser/phil-iri" ||
    pathname === "/profile"
  );
}

export default function DashboardLayout({ user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 1. Guard: if user is not logged in, redirect to login screen
  if (!user) {
    return <Navigate to="/" replace />;
  }

  const hasRouteAccess = isPathAllowedForRole(location.pathname, user.role);

  const handleMobileSidebarToggle = () => {
    setCollapsed(false);
    setMobileOpen((isOpen) => !isOpen);
  };

  const sectionsPath = user?.role === 'teacher' ? '/teacher/sections' : '/adviser/sections';

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
        isOffline={!isOnline}
      />

      {/* Main Page Area */}
      <div className="main-content-wrapper">
        {/* Top Navbar */}
        <Navbar
          user={user}
          onToggleSidebar={() => setCollapsed(!collapsed)}
          onToggleMobileSidebar={handleMobileSidebarToggle}
        />

        {/* Global Offline Banner */}
        {!isOnline && (
          <div
            style={{
              backgroundColor: "#fffbeb",
              borderBottom: "1px solid #fde68a",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              fontSize: "13px",
              color: "#92400e",
              fontWeight: 500,
              zIndex: 10,
            }}
          >
            <WifiOff size={15} />
            <span>
              Offline Mode active — <strong>Class Record</strong>, <strong>Attendance</strong>, and <strong>PHIL-IRI</strong> are fully accessible. Any edits will save locally and sync when reconnected.
            </span>
          </div>
        )}

        {/* Content outlet */}
        <main className="page-content-area">
          {!hasRouteAccess ? (
            <AccessDeniedPage role={user.role} />
          ) : !isOnline && !isOfflineSupportedRoute(location.pathname) ? (
            <div
              style={{
                margin: "40px auto",
                maxWidth: "560px",
                padding: "36px 28px",
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                border: "1px solid #fed7aa",
                boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  margin: "0 auto 16px",
                  borderRadius: "50%",
                  backgroundColor: "#fff7ed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ea580c",
                }}
              >
                <WifiOff size={28} />
              </div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
                This Module Requires an Internet Connection
              </h3>
              <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.6, marginBottom: "24px" }}>
                While offline, you can continue viewing and grading your <strong>Class Record</strong>, taking <strong>Attendance</strong>, and entering <strong>PHIL-IRI</strong> assessments.
              </p>
              <button
                type="button"
                onClick={() => navigate(sectionsPath)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 22px",
                  borderRadius: "8px",
                  backgroundColor: "#0284c7",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
                }}
              >
                <BookOpen size={16} />
                <span>Go to Sections</span>
              </button>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
