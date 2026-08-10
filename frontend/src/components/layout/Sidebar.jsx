import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { sidebarConfig } from "../../config/sidebarConfig";
import { normalizeRole, getRoleDisplayTitle, removeStoredUser, getRoleDefaultPath } from "../../utils/auth";
import { ChevronDown, LogOut, CircleUser } from "lucide-react";
import logoName from "../../assets/auralis-logo-name.png";
import logoIcon from "../../assets/auralis-logo.png";

export default function Sidebar({ user, onLogout, collapsed = false, mobileOpen = false, onCloseMobile }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Resolve mapping names dynamically based on normalized user role
  const roleKey = normalizeRole(user?.role);
  const menuItems = sidebarConfig[roleKey] || sidebarConfig[user?.role] || sidebarConfig["principal"] || [];
  const defaultDashboardPath = getRoleDefaultPath(user?.role);

  // Track open states of submenus
  const [openMenus, setOpenMenus] = useState({});

  // Auto-expand submenu if one of its items is active on mount or location change
  useEffect(() => {
    const updatedOpen = { ...openMenus };
    let changed = false;

    menuItems.forEach((item, index) => {
      if (item.submenu) {
        const isChildActive = item.submenu.some(
          (sub) => location.pathname === sub.path
        );
        if (isChildActive && !openMenus[index]) {
          updatedOpen[index] = true;
          changed = true;
        }
      }
    });

    if (changed) {
      setOpenMenus(updatedOpen);
    }
  }, [location.pathname, menuItems]);

  const toggleSubmenu = (index, e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpenMenus((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleLogout = () => {
    removeStoredUser();
    if (onLogout) {
      onLogout();
    }
    navigate("/");
  };

  const getUserName = () => {
    if (!user) return "User";
    if (user.first_name || user.last_name) {
      return `${user.first_name || ""} ${user.last_name || ""}`.trim();
    }
    return user.name || "User";
  };

  const profileName = getUserName();
  const displayRole = getRoleDisplayTitle(user?.role);
  const initials = profileName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "U";

  return (
    <>
      <aside className={`sidebar-container ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        {/* Header / Logo */}
        <div className="sidebar-header">
          <Link to={defaultDashboardPath} className="sidebar-logo-container">
            {collapsed ? (
              <img src={logoIcon} className="sidebar-logo-icon-img" alt="Auralis Icon" />
            ) : (
              <img src={logoName} className="sidebar-logo-name-img" alt="Auralis Logo" />
            )}
          </Link>
        </div>

        {/* Menu Items */}
        <nav className="sidebar-menu">
          {menuItems.map((item, index) => {
            const hasSubmenu = !!item.submenu;
            const isSubActive = hasSubmenu
              ? item.submenu.some((sub) => location.pathname === sub.path)
              : false;
            const isDirectActive = location.pathname === item.path;
            const isActive = isDirectActive || isSubActive;
            const isOpen = !!openMenus[index];

            const IconComponent = item.icon;

            if (hasSubmenu) {
              return (
                <div
                  key={index}
                  className={`menu-group ${isSubActive ? "has-submenu-active" : ""} ${
                    isOpen ? "is-open" : ""
                  }`}
                >
                  <a
                    href="#"
                    onClick={(e) => toggleSubmenu(index, e)}
                    className={`sidebar-item parent-header ${isActive ? "active" : ""}`}
                    data-tooltip={collapsed ? item.title : undefined}
                  >
                    <div className="sidebar-item-content">
                      {IconComponent && (
                        <span className="sidebar-item-icon">
                          <IconComponent size={20} />
                        </span>
                      )}
                      {!collapsed && <span className="sidebar-item-label">{item.title}</span>}
                    </div>
                    {!collapsed && (
                      <ChevronDown
                        size={16}
                        className="submenu-arrow"
                        style={{ color: (isActive || isOpen) ? "var(--active-text)" : "white" }}
                      />
                    )}
                  </a>

                  {/* Submenu links */}
                  <div className="sidebar-submenu">
                    {item.submenu.map((subItem, subIndex) => {
                      const isSubItemActive = location.pathname === subItem.path;
                      return (
                        <Link
                          key={subIndex}
                          to={subItem.path}
                          onClick={onCloseMobile}
                          className={`submenu-item ${isSubItemActive ? "active" : ""}`}
                        >
                          {subItem.title}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={index}
                to={item.path}
                onClick={onCloseMobile}
                className={`sidebar-item ${isDirectActive ? "active" : ""}`}
                data-tooltip={collapsed ? item.title : undefined}
              >
                <div className="sidebar-item-content">
                  {IconComponent && (
                    <span className="sidebar-item-icon">
                      <IconComponent size={20} />
                  </span>
                  )}
                  {!collapsed && <span className="sidebar-item-label">{item.title}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer Actions (Profile & Logout) */}
        <div className="sidebar-footer">
          {/* Profile Card */}
          <div className="profile-card" title={`${profileName} - ${displayRole}`}>
            <div className="profile-avatar">
              {initials || <CircleUser size={20} />}
            </div>
            <div className="profile-info">
              <span className="profile-name">{profileName}</span>
              <span className="profile-role">{displayRole}</span>
            </div>
          </div>

          {/* Logout Button */}
          <button onClick={handleLogout} className="logout-btn" title="Logout">
            <LogOut size={20} className="logout-icon" />
            <span className="logout-btn-text">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
