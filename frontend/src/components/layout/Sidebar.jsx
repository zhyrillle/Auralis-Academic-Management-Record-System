import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { sidebarConfig } from "../../config/sidebarConfig";
import { normalizeRole, getRoleDisplayTitle, removeStoredUser, getRoleDefaultPath } from "../../utils/auth";
import { ChevronDown, LogOut, CircleUser } from "lucide-react";
import logoName from "../../assets/auralis-logo-name.png";
import logoIcon from "../../assets/auralis-logo.png";
import { useDepartmentContext } from "../../services/deptHeadMonitoringApi";

const isRouteActive = (pathname, path) => Boolean(path)
  && (pathname === path || pathname.startsWith(`${path}/`));

function positionSidebarFlyout(trigger, panel) {
  if (!trigger || !panel) return;
  const anchor = trigger.getBoundingClientRect();
  const sidebarRight = trigger.closest(".sidebar-container")?.getBoundingClientRect().right ?? anchor.right;
  const top = Math.max(12, Math.min(anchor.top + anchor.height / 2 - panel.offsetHeight / 2, window.innerHeight - panel.offsetHeight - 12));
  panel.style.left = `${Math.max(12, Math.min(sidebarRight + 10, window.innerWidth - panel.offsetWidth - 12))}px`;
  panel.style.top = `${top}px`;
  panel.style.setProperty("--sidebar-flyout-origin-y", `${anchor.top + anchor.height / 2 - top}px`);
}

// The same collapsed navigation works for every role's submenu groups.
function CollapsedSidebarGroup({ item, pathname, active, onNavigate }) {
  const id = useId();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const Icon = item.icon;

  useEffect(() => {
    if (!isOpen) return undefined;
    const position = () => positionSidebarFlyout(triggerRef.current, panelRef.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [isOpen]);

  return <div className="menu-group sidebar-collapsed-group">
    <button type="button" ref={triggerRef} id={`${id}-trigger`}
      className={`sidebar-item ${active ? "active" : ""}`}
      aria-label={item.title} title={item.title} aria-expanded={isOpen}
      aria-controls={`${id}-submenu`} popoverTarget={`${id}-submenu`}
      onClick={() => positionSidebarFlyout(triggerRef.current, panelRef.current)}>
      <span className="sidebar-item-icon">{Icon && <Icon size={20} />}</span>
    </button>
    <div ref={panelRef} id={`${id}-submenu`} popover="auto"
      className="sidebar-flyout" role="group" aria-label={`${item.title} navigation`}
      onToggle={event => {
        const open = event.nativeEvent.newState === "open";
        setIsOpen(open);
        if (open) {
          positionSidebarFlyout(triggerRef.current, panelRef.current);
          panelRef.current?.querySelector("a")?.focus();
        }
      }}>
      <div className="sidebar-flyout__items">{item.submenu.map(subItem => {
        const selected = isRouteActive(pathname, subItem.path);
        return <Link key={subItem.path} to={subItem.path}
          className={`submenu-item ${selected ? "active" : ""}`}
          aria-current={selected ? "page" : undefined}
          onClick={() => {
            panelRef.current?.hidePopover();
            onNavigate?.();
          }}>{subItem.title}</Link>;
      })}</div>
    </div>
  </div>;
}

export default function Sidebar({ user, onLogout, collapsed = false, mobileOpen = false, onCloseMobile }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Resolve mapping names dynamically based on normalized user role
  const roleKey = normalizeRole(user);
  const departmentContext = useDepartmentContext();
  const menuItems = useMemo(
    () => (sidebarConfig[roleKey] || sidebarConfig[user?.role] || sidebarConfig.principal || [])
      .filter(item => !item.requiresPhilIri || departmentContext.data?.canViewPhilIri),
    [roleKey, user?.role, departmentContext.data?.canViewPhilIri],
  );
  const defaultDashboardPath = getRoleDefaultPath(user?.role);
  const isProfileActive = location.pathname === "/profile";

  // Track user-controlled submenu states and derive route-based expansion.
  const [openMenus, setOpenMenus] = useState({});
  const routeOpenMenus = useMemo(
    () =>
      Object.fromEntries(
        menuItems.map((item, index) => [
          index,
          Boolean(
            item.submenu?.some((sub) => isRouteActive(location.pathname, sub.path)),
          ),
        ]),
      ),
    [location.pathname, menuItems],
  );

  const toggleSubmenu = (index, e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpenMenus((prev) => ({
      ...prev,
      [index]: !(prev[index] ?? routeOpenMenus[index]),
    }));
  };

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try { await removeStoredUser(); }
    catch {
      setLogoutError("Your unsent work could not be saved on this device. Please save it before logging out.");
      setLoggingOut(false);
      return;
    }
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
  const profilePicture = user?.pfp_url || null;
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
              ? item.submenu.some((sub) => isRouteActive(location.pathname, sub.path))
              : false;
            const isDirectActive = isRouteActive(location.pathname, item.path);
            const isActive = isDirectActive || isSubActive;
            const isOpen = openMenus[index] ?? routeOpenMenus[index] ?? false;

            const IconComponent = item.icon;

            if (hasSubmenu && collapsed) {
              return <CollapsedSidebarGroup key={index} item={item}
                pathname={location.pathname} active={isActive} onNavigate={onCloseMobile} />;
            }

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
                      const isSubItemActive = isRouteActive(location.pathname, subItem.path);
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
          <Link
            to="/profile"
            onClick={onCloseMobile}
            className={`profile-card profile-card-link ${isProfileActive ? "active" : ""}`}
            title={`${profileName} - ${displayRole}`}
            aria-current={isProfileActive ? "page" : undefined}
          >
            <div className="profile-avatar">
              {profilePicture ? (
                <img src={profilePicture} alt="" />
              ) : (
                initials || <CircleUser size={20} />
              )}
            </div>
            <div className="profile-info">
              <span className="profile-name">{profileName}</span>
              <span className="profile-role">{displayRole}</span>
            </div>
          </Link>

          {/* Logout Button */}
          {logoutError && <p role="alert" style={{ color: '#fca5a5', fontSize: 12, padding: '0 12px' }}>{logoutError}</p>}
          <button onClick={handleLogout} className="logout-btn" title="Logout" disabled={loggingOut}>
            <LogOut size={20} className="logout-icon" />
            <span className="logout-btn-text">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
