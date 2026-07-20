import { useLocation } from "react-router-dom";
import { Menu, ChevronRight, Bell, Sparkles } from "lucide-react";

export default function Navbar({
  user,
  onRoleChange,
  onToggleSidebar,
  onToggleMobileSidebar,
}) {
  const location = useLocation();

  // Dynamic breadcrumbs based on route
  const getBreadcrumbs = () => {
    const paths = location.pathname.split("/").filter((x) => x);
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
  const currentTitle = breadcrumbs.length > 0 
    ? breadcrumbs[breadcrumbs.length - 1].label 
    : "Dashboard";

  return (
    <header className="navbar-container">
      {/* Left side: Toggles & Title */}
      <div className="navbar-left">
        {/* Mobile menu toggle */}
        <button
          className="toggle-sidebar-btn"
          onClick={onToggleMobileSidebar}
          style={{ display: "none" }} /* Styled via media queries or inline conditional classes */
        >
          <Menu size={20} className="lg:hidden" />
        </button>

        {/* Desktop/Default toggle */}
        <button className="toggle-sidebar-btn" onClick={onToggleSidebar}>
          <Menu size={20} />
        </button>

        <div className="navbar-title-container">
          <h2 className="navbar-title">{currentTitle}</h2>
          {breadcrumbs.length > 0 && (
            <div className="navbar-breadcrumbs">
              <span>Home</span>
              {breadcrumbs.map((bc, index) => (
                <span key={index} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <ChevronRight size={12} />
                  <span>{bc.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right side: Quick Role Swapper & Notifications */}
      <div className="navbar-right">
        {/* Capstone Role Switcher for live inspection */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkles size={16} style={{ color: "#d97706" }} />
          <span style={{ fontSize: "12px", fontWeight: "600", color: "#8c9ba5" }}>Demo Role:</span>
          <select
            value={user.role}
            onChange={(e) => onRoleChange(e.target.value)}
            className="role-switcher-dropdown"
          >
            <option value="system-admin">System Administrator</option>
            <option value="principal">Principal</option>
            <option value="department-head">Department Head</option>
            <option value="adviser">Adviser</option>
            <option value="teacher">Subject Teacher</option>
          </select>
        </div>

        <button className="toggle-sidebar-btn" style={{ position: "relative" }}>
          <Bell size={20} />
          <span
            style={{
              position: "absolute",
              top: "4px",
              right: "4px",
              width: "8px",
              height: "8px",
              backgroundColor: "var(--logout-color)",
              borderRadius: "50%",
            }}
          />
        </button>
      </div>
    </header>
  );
}
