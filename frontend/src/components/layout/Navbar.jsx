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
        <div className="demo-role-control">
          <Sparkles size={16} className="demo-role-icon" aria-hidden="true" />
          <label htmlFor="demo-role-select" className="demo-role-label">Demo Role:</label>
          <select
            id="demo-role-select"
            value={user.role}
            onChange={(e) => onRoleChange(e.target.value)}
            className="role-switcher-dropdown"
            aria-label="Demo role"
          >
            <option value="system-admin">System Administrator</option>
            <option value="principal">Principal</option>
            <option value="department-head">Department Head</option>
            <option value="adviser">Adviser</option>
            <option value="teacher">Subject Teacher</option>
          </select>
        </div>

        <button type="button" className="toggle-sidebar-btn notification-button" aria-label="Notifications">
          <Bell size={20} />
          <span className="notification-indicator" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
