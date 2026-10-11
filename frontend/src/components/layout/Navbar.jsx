import { useLocation, useNavigate } from "react-router-dom";
import { Menu, ChevronRight, Bell } from "lucide-react";
import { normalizeRole } from "../../utils/auth";

export default function Navbar({
  user,
  onToggleSidebar,
  onToggleMobileSidebar,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const showNotifications = !["system-admin", "principal"].includes(normalizeRole(user));

  const isDeptHeadClassRecord =
    location.pathname.startsWith("/department-head/class-records") ||
    location.pathname === "/department-head/class-records";

  // Dynamic breadcrumbs based on route
  const getBreadcrumbs = () => {
    const pathname = location.pathname;

    if (isDeptHeadClassRecord) {
      return [
        { label: "Class records", link: "/department-head/class-records" },
        { label: "Records", link: "/department-head/class-records" },
      ];
    }

    // Check for Section Details or Class Record routes (Adviser / Teacher)
    const isSectionDetails =
      pathname === "/adviser/sections/details" ||
      pathname === "/teacher/sections/details" ||
      pathname.endsWith("/sections/details");

    const isClassRecord =
      pathname.startsWith("/class-record") ||
      (pathname.includes("/class-record") && !pathname.includes("/department-head"));

    if (isSectionDetails || isClassRecord) {
      return [
        { label: "Adviser", link: "/adviser/dashboard" },
        { label: "Sections", link: "/adviser/sections" },
      ];
    }

    const paths = pathname.split("/").filter((x) => x);

    return paths.map((path, idx) => {
      // Human readable titles
      const cleanPath = path
        .replace(/-/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());

      return {
        label: cleanPath,
        link: "/" + paths.slice(0, idx + 1).join("/"),
      };
    });
  };

  const breadcrumbs = getBreadcrumbs();

  const currentTitle = isDeptHeadClassRecord
    ? "Class records"
    : breadcrumbs.length > 0
    ? breadcrumbs[breadcrumbs.length - 1].label
    : "Dashboard";

  return (
    <header className="navbar-container">
      {/* Left side: Toggles & Title */}
      <div className="navbar-left">
        {/* Mobile menu toggle */}
        <button
          type="button"
          className="toggle-sidebar-btn mobile-menu-button"
          onClick={onToggleMobileSidebar}
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        {/* Desktop/Default toggle */}
        <button
          type="button"
          className="toggle-sidebar-btn desktop-sidebar-button"
          onClick={onToggleSidebar}
          aria-label="Collapse navigation sidebar"
        >
          <Menu size={20} />
        </button>

        <div className="navbar-title-container">
          <h2 className="navbar-title">{currentTitle}</h2>

          {breadcrumbs.length > 0 && (
            <div className="navbar-breadcrumbs">
              {!isDeptHeadClassRecord && (
                <span
                  onClick={() => navigate("/")}
                  style={{ cursor: "pointer" }}
                  title="Go to Home"
                >
                  Home
                </span>
              )}

              {breadcrumbs.map((bc, index) => (
                <span
                  key={index}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {(!isDeptHeadClassRecord || index > 0) && <ChevronRight size={12} />}
                  {index < breadcrumbs.length - 1 ? (
                    <span
                      onClick={() => navigate(bc.link)}
                      style={{ cursor: "pointer" }}
                      title={`Go to ${bc.label}`}
                    >
                      {bc.label}
                    </span>
                  ) : (
                    <span>{bc.label}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right side: Notifications */}
      {showNotifications && <div className="navbar-right">
        <button
          type="button"
          className="toggle-sidebar-btn notification-button"
          aria-label="Notifications"
          onClick={() => {
            if (location.pathname.startsWith("/department-head")) {
              navigate("/department-head/notifications");
            } else if (location.pathname.startsWith("/teacher")) {
              navigate("/teacher/notifications");
            } else {
              navigate("/adviser/notifications");
            }
          }}
        >
          <Bell size={20} />
          <span
            className="notification-indicator"
            aria-hidden="true"
          />
        </button>
      </div>}
    </header>
  );
}
