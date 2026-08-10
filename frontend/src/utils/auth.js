// Normalize role string from backend or user object to a standard canonical role key
export const normalizeRole = (role, userObj) => {
  let targetUser = userObj;
  let targetRole = role;

  if (typeof role === "object" && role !== null) {
    targetUser = role;
    targetRole = role.role;
  }

  if (targetUser && (targetUser.is_adviser || targetUser.isAdviser)) {
    return "adviser";
  }

  if (!targetRole) return "guest";
  const r = targetRole.toString().trim().toLowerCase().replace(/_/g, "-");

  if (
    r === "admin" ||
    r === "system-admin" ||
    r === "systemadmin" ||
    r === "system administrator"
  ) {
    return "system-admin";
  }
  if (r === "principal") {
    return "principal";
  }
  if (
    r === "department-head" ||
    r === "department head" ||
    r === "departmenthead"
  ) {
    return "department-head";
  }
  if (r === "adviser") {
    return "adviser";
  }
  if (
    r === "subject-teacher" ||
    r === "subject teacher" ||
    r === "subjectteacher" ||
    r === "teacher"
  ) {
    return "teacher";
  }
  return r;
};

// Map normalized role to default dashboard path
export const getRoleDefaultPath = (role) => {
  const normRole = normalizeRole(role);
  switch (normRole) {
    case "system-admin":
      return "/system-admin/dashboard";
    case "principal":
      return "/principal/dashboard";
    case "department-head":
      return "/department-head/dashboard";
    case "adviser":
      return "/adviser/dashboard";
    case "teacher":
      return "/teacher/dashboard";
    default:
      return "/";
  }
};

// Formatted display title for roles
export const getRoleDisplayTitle = (role) => {
  const normRole = normalizeRole(role);
  switch (normRole) {
    case "system-admin":
      return "System Administrator";
    case "principal":
      return "Principal";
    case "department-head":
      return "Department Head";
    case "adviser":
      return "Adviser";
    case "teacher":
      return "Subject Teacher";
    default:
      return role || "User";
  }
};

// Check if a path is allowed for a user's role
export const isPathAllowedForRole = (path, role) => {
  const normRole = normalizeRole(role);
  if (!normRole || normRole === "guest") return false;

  const rolePrefixes = {
    "system-admin": "/system-admin",
    "principal": "/principal",
    "department-head": "/department-head",
    "adviser": "/adviser",
    "teacher": "/teacher",
  };

  const prefix = rolePrefixes[normRole];
  if (!prefix) return false;

  return path.startsWith(prefix);
};

// Get stored user from localStorage
export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error reading stored user:", e);
    return null;
  }
};

// Save user to localStorage
export const setStoredUser = (userObj) => {
  try {
    localStorage.setItem("user", JSON.stringify(userObj));
  } catch (e) {
    console.error("Error saving user to localStorage:", e);
  }
};

// Clear stored user
export const removeStoredUser = () => {
  try {
    localStorage.removeItem("user");
  } catch (e) {
    console.error("Error clearing user from localStorage:", e);
  }
};
