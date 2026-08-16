import React, { useEffect, useMemo, useState } from "react";
import "../../styles/ManageUsers.css";

const API_URL = "http://localhost:5000/api";

function Icon({ type, size = 22 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (type) {
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19c0-3.5 2.7-5 6-5s6 1.5 6 5" />
          <path d="M16 5.5a3 3 0 0 1 0 5.8" />
          <path d="M18 14c2.1.5 3 2 3 4" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16 9" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20h4L19 9l-4-4L4 16v4z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M10 11v6M14 11v6" />
          <path d="M6 7l1 14h10l1-14" />
          <path d="M9 7V4h6v3" />
        </svg>
      );
    case "plusPerson":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19c0-3.5 2.7-5 6-5s6 1.5 6 5" />
          <path d="M18 8v6M15 11h6" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    default:
      return null;
  }
}

const DISPLAY_TO_DB_ROLE = {
  Principal: "principal",
  "Department Head": "department head",
  "Subject Teacher": "subject teacher",
  Adviser: "subject teacher",
};

function getDisplayRole(user) {
  if (!user) return "";
  
  const rawDisplayRole = (user.display_role || "").toLowerCase().trim();
  const rawRole = (user.role || "").toLowerCase().trim();
  
  if (
    user.is_adviser === true || 
    Boolean(user.adviser_section_id) || 
    Boolean(user.adviser_assignment_id) ||
    rawRole === "adviser" ||
    rawDisplayRole === "adviser"
  ) {
    return "Adviser";
  }
  if (
    rawRole === "department head" || 
    rawRole === "department_head" || 
    rawRole === "dept_head" ||
    rawDisplayRole === "department head" ||
    rawDisplayRole === "department_head"
  ) {
    return "Department Head";
  }
  if (rawRole === "principal" || rawDisplayRole === "principal") {
    return "Principal";
  }
  if (
    rawRole === "subject teacher" || 
    rawRole === "subject_teacher" || 
    rawRole === "teacher" ||
    rawDisplayRole === "subject teacher" ||
    rawDisplayRole === "subject_teacher"
  ) {
    return "Subject Teacher";
  }

  return user.role || "";
}

function getUsername(user) {
  return `${user?.first_name || ""} ${user?.last_name || ""}`.replace(/\s+/g, " ").trim();
}

function resolveProfilePictureUrl(url) {
  if (!url) return null;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${API_URL.replace("/api", "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

function RoleBadge({ role }) {
  const roleClass = (role || "").toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");
  return <span className={`role-badge ${roleClass}`}>{role}</span>;
}

function StatusBadge({ status }) {
  const isActive = String(status).toLowerCase() === "active";
  return (
    <span className={`status-badge ${isActive ? "active" : "inactive"}`}>
      <span className="status-dot"></span>
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userError, setUserError] = useState("");

  const [gradeLevels, setGradeLevels] = useState([]);
  const [sections, setSections] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [subjectOfferings, setSubjectOfferings] = useState([]);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [statusFilter, setStatusFilter] = useState("All Status");

  const [deleteUser, setDeleteUser] = useState(null);
  const [formMode, setFormMode] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pfpError, setPfpError] = useState(false);

  const [savingUser, setSavingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [formError, setFormError] = useState("");

  const emptyForm = {
    user_id: null,
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    role: "",
    department_id: "",
    adviser_grade_level_id: "",
    adviser_section_id: "",
    teaching_assignments: [],
    status: "active",
  };

  const [formData, setFormData] = useState(emptyForm);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      setUserError("");
      const response = await fetch(`${API_URL}/users`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load users.");
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      setUserError(error.message || "Failed to load users.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchFormOptions = async () => {
    try {
      const response = await fetch(`${API_URL}/users/management-options`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load form options.");

      setGradeLevels(data.gradeLevels || []);
      setSections(data.sections || []);
      setDepartments(data.departments || []);
      setSubjectOfferings(data.subjectOfferings || []);
    } catch (error) {
      setFormError(error.message || "Failed to load options.");
    }
  };

  useEffect(() => {
    fetchFormOptions().then(() => {
      fetchUsers();
    });
  }, []);

  // Department Display Logic with accurate user.department_id priority
  const getUserDepartment = (user) => {
    if (!user) return "-";
    const role = getDisplayRole(user);
    if (role === "Principal" || String(user.role).toLowerCase() === "principal") {
      return "School Administration";
    }

    // Lookup using department_id if present
    if (user.department_id && departments.length > 0) {
      const matchedDept = departments.find(
        (d) => String(d.department_id) === String(user.department_id)
      );
      if (matchedDept) return matchedDept.department_name;
    }

    // Check direct user properties returned from SQL JOIN
    if (user.department_name) return user.department_name;
    if (user.dept_name) return user.dept_name;
    if (user.department) return user.department;

    return "-";
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const rawRole = String(user.role || "").toLowerCase();
      if (rawRole === "admin") return false;

      const searchText = search.toLowerCase();
      const fullName = getUsername(user).toLowerCase();
      const email = (user.email || "").toLowerCase();
      const displayRole = getDisplayRole(user);

      const searchMatch = fullName.includes(searchText) || email.includes(searchText);
      const roleMatch = roleFilter === "All Roles" || displayRole.toLowerCase() === roleFilter.toLowerCase();
      const statusMatch = statusFilter === "All Status" || String(user.account_status || "").toLowerCase() === statusFilter.toLowerCase();

      return searchMatch && roleMatch && statusMatch;
    });
  }, [users, search, roleFilter, statusFilter]);

  const handleAddUser = () => {
    setSelectedUser(null);
    setFormMode("add");
    setFormError("");
    setFormData({ ...emptyForm });
  };

  const handleViewUser = async (user) => {
    setSelectedUser(user);
    setPfpError(false);
    try {
      const response = await fetch(`${API_URL}/users/${user.user_id}`);
      if (response.ok) {
        const fullUser = await response.json();
        setSelectedUser(fullUser);
      }
    } catch (error) {
      console.error("Failed to load user detail overview:", error);
    }
  };

  const handleEditUser = async (user) => {
    try {
      setFormError("");
      setFormMode("edit");
      setSelectedUser(null);

      // Fetch user details from API
      const response = await fetch(`${API_URL}/users/${user.user_id}`);
      const fullUser = response.ok ? await response.json() : user;

      const currentDisplayRole = getDisplayRole(fullUser);

      // Format teaching assignments
      let formattedAssignments = [];
      if (Array.isArray(fullUser.teaching_assignments)) {
        formattedAssignments = fullUser.teaching_assignments.map((ta) => {
          let gId = ta.grade_level_id ? String(ta.grade_level_id) : "";
          let sId = ta.section_id ? String(ta.section_id) : "";

          if ((!gId || !sId) && ta.subject_offering_id) {
            const matchedOffering = subjectOfferings.find(
              (so) => String(so.subject_offering_id) === String(ta.subject_offering_id)
            );
            if (matchedOffering) {
              sId = sId || String(matchedOffering.section_id);
            }
          }
          if (!gId && sId) {
            const matchedSec = sections.find((sec) => String(sec.section_id) === String(sId));
            if (matchedSec) {
              gId = String(matchedSec.grade_level_id);
            }
          }

          return {
            grade_level_id: gId,
            section_id: sId,
            subject_offering_id: ta.subject_offering_id ? String(ta.subject_offering_id) : "",
          };
        });
      }

      // Resolve grade level for advisory section
      let resolvedGradeLevelId = fullUser.adviser_grade_level_id ? String(fullUser.adviser_grade_level_id) : "";
      if (!resolvedGradeLevelId && fullUser.adviser_section_id) {
        const matchedSec = sections.find(
          (s) => String(s.section_id) === String(fullUser.adviser_section_id)
        );
        if (matchedSec) resolvedGradeLevelId = String(matchedSec.grade_level_id);
      }

      // Resolve department_id
      let resolvedDeptId = fullUser.department_id ? String(fullUser.department_id) : "";
      if (!resolvedDeptId && fullUser.department_name && departments.length > 0) {
        const matched = departments.find((d) => d.department_name === fullUser.department_name);
        if (matched) resolvedDeptId = String(matched.department_id);
      }

      setFormData({
        user_id: fullUser.user_id,
        first_name: fullUser.first_name || "",
        last_name: fullUser.last_name || "",
        email: fullUser.email || "",
        password: "",
        role: currentDisplayRole,
        department_id: resolvedDeptId,
        adviser_grade_level_id: resolvedGradeLevelId,
        adviser_section_id: fullUser.adviser_section_id ? String(fullUser.adviser_section_id) : "",
        teaching_assignments: formattedAssignments,
        status: fullUser.account_status || "active",
      });
    } catch (error) {
      setFormError("Failed to load user information.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteUser) return;
    try {
      setDeletingUser(true);
      const response = await fetch(`${API_URL}/users/${deleteUser.user_id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete user.");

      setDeleteUser(null);
      await fetchUsers();
    } catch (error) {
      alert(error.message || "Failed to delete user.");
    } finally {
      setDeletingUser(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "role" && value === "Principal") {
        next.department_id = "";
        next.adviser_grade_level_id = "";
        next.adviser_section_id = "";
        next.teaching_assignments = [];
      } else if (name === "role" && value === "Department Head") {
        next.adviser_grade_level_id = "";
        next.adviser_section_id = "";
        next.teaching_assignments = [];
      } else if (name === "role" && value === "Subject Teacher") {
        next.adviser_grade_level_id = "";
        next.adviser_section_id = "";
      }
      if (name === "adviser_grade_level_id") {
        next.adviser_section_id = "";
      }
      return next;
    });
  };

  const handleAddTeachingAssignment = () => {
    setFormData((prev) => ({
      ...prev,
      teaching_assignments: [
        ...prev.teaching_assignments,
        { grade_level_id: "", section_id: "", subject_offering_id: "" },
      ],
    }));
  };

  const handleRemoveTeachingAssignment = (index) => {
    setFormData((prev) => ({
      ...prev,
      teaching_assignments: prev.teaching_assignments.filter((_, i) => i !== index),
    }));
  };

  const handleTeachingAssignmentChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.teaching_assignments];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "grade_level_id") {
        updated[index].section_id = "";
        updated[index].subject_offering_id = "";
      }
      if (field === "section_id") {
        updated[index].subject_offering_id = "";
      }
      return { ...prev, teaching_assignments: updated };
    });
  };

  const handleSaveUser = async () => {
    setFormError("");

    if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim() || !formData.role) {
      setFormError("Please fill in all required fields.");
      return;
    }

    if (formMode === "add" && !formData.password.trim()) {
      setFormError("Password is required when creating a user.");
      return;
    }

    if (
      (formData.role === "Department Head" || formData.role === "Subject Teacher" || formData.role === "Adviser") &&
      !formData.department_id
    ) {
      setFormError("Please select a department / assigned area.");
      return;
    }

    if (formData.role === "Adviser" && !formData.adviser_section_id) {
      setFormError("Please select an advisory section for the adviser.");
      return;
    }

    const nonRowEmptyAssignments = formData.teaching_assignments.filter(
      (assign) =>
        String(assign.grade_level_id || "").trim() !== "" ||
        String(assign.section_id || "").trim() !== "" ||
        String(assign.subject_offering_id || "").trim() !== ""
    );

    const hasIncompleteRow = nonRowEmptyAssignments.some(
      (assign) =>
        !String(assign.grade_level_id || "").trim() ||
        !String(assign.section_id || "").trim() ||
        !String(assign.subject_offering_id || "").trim()
    );

    if (hasIncompleteRow) {
      setFormError("Please select a valid grade level, section, and subject assignment for all added rows.");
      return;
    }

    const targetUserId = formData.user_id;
    const dbRole = DISPLAY_TO_DB_ROLE[formData.role] || formData.role.toLowerCase();

    const payload = {
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      email: formData.email.trim().toLowerCase(),
      role: dbRole,
      account_status: formData.status,
      department_id: formData.role === "Principal" ? null : (formData.department_id ? Number(formData.department_id) : null),
      adviser_section_id: formData.role === "Adviser" ? formData.adviser_section_id || null : null,
      teaching_assignments: nonRowEmptyAssignments,
      is_adviser: formData.role === "Adviser" || Boolean(formData.adviser_section_id),
    };

    if (formMode === "add" || formData.password.trim()) {
      payload.password = formData.password;
    }

    try {
      setSavingUser(true);
      const url = formMode === "add" ? `${API_URL}/users` : `${API_URL}/users/${targetUserId}`;
      const method = formMode === "add" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save user.");

      setFormMode(null);
      setFormData({ ...emptyForm });
      setSelectedUser(null);
      await fetchUsers();
    } catch (error) {
      setFormError(error.message || "Failed to save user.");
    } finally {
      setSavingUser(false);
    }
  };

  return (
    <div className="user-management-page">
      <div className="content-wrapper">
        <div className="page-header">
          <div>
            <h1>User Management</h1>
            <p>Manage user assignments</p>
          </div>
          <button className="add-user-btn" onClick={handleAddUser}>
            <Icon type="plusPerson" size={24} /> Add User
          </button>
        </div>

        {loadingUsers && <p>Loading users...</p>}
        {userError && <p className="error-text">{userError}</p>}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon total"><Icon type="users" size={25} /></div>
            <div className="stat-info"><span>Total Users</span><strong>{filteredUsers.length}</strong></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon active-icon"><Icon type="check" size={25} /></div>
            <div className="stat-info">
              <span>Active</span>
              <strong className="green-text">
                {filteredUsers.filter((u) => String(u.account_status).toLowerCase() === "active").length}
              </strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon adviser-icon"><Icon type="shield" size={24} /></div>
            <div className="stat-info">
              <span>Advisers</span>
              <strong>{filteredUsers.filter((u) => getDisplayRole(u) === "Adviser").length}</strong>
            </div>
          </div>
        </div>

        <div className="filter-container">
          <div className="search-box">
            <Icon type="search" size={24} />
            <input type="text" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option>All Roles</option>
            <option>Subject Teacher</option>
            <option>Principal</option>
            <option>Adviser</option>
            <option>Department Head</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>User Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.user_id}>
                  <td>
                    <div className="user-name">
                      <span>{getUsername(user)}</span>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td><RoleBadge role={getDisplayRole(user)} /></td>
                  <td>{getUserDepartment(user)}</td>
                  <td><StatusBadge status={user.account_status} /></td>
                  <td>
                    <div className="actions">
                      <button title="View" onClick={() => handleViewUser(user)}>
                        <Icon type="eye" size={21} />
                      </button>
                      <button title="Edit" onClick={() => handleEditUser(user)}>
                        <Icon type="edit" size={21} />
                      </button>
                      <button title="Delete" onClick={() => setDeleteUser(user)}>
                        <Icon type="trash" size={21} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* VIEW USER MODAL */}
        {selectedUser && (
          <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
            <div className="user-profile-modal" onClick={(e) => e.stopPropagation()}>
              <div className="profile-modal-header">
                <h2>User Profile</h2>
                <p>Account details and role assignment</p>
              </div>

              <div className="profile-summary">
                <div className="profile-avatar-wrapper">
                  {selectedUser.pfp_url && !pfpError ? (
                    <img
                      src={resolveProfilePictureUrl(selectedUser.pfp_url)}
                      alt={getUsername(selectedUser)}
                      className="profile-avatar-img"
                      onError={() => setPfpError(true)}
                    />
                  ) : (
                    <div className="profile-avatarz">
                      {getUsername(selectedUser)
                        .split(" ")
                        .map((name) => name[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "U"}
                    </div>
                  )}
                </div>

                <div className="profile-main-info">
                  <h3>{getUsername(selectedUser)}</h3>
                  <p className="profile-username">{selectedUser.email}</p>
                  <RoleBadge role={getDisplayRole(selectedUser)} />
                </div>

                <div className="profile-status">
                  <StatusBadge status={selectedUser.account_status} />
                </div>
              </div>

              <div className="profile-divider"></div>

              <div className="profile-details">
                <div className="profile-detail">
                  <span>Email</span>
                  <strong>{selectedUser.email}</strong>
                </div>

                <div className="profile-detail">
                  <span>Department</span>
                  <strong>{getUserDepartment(selectedUser)}</strong>
                </div>

                {(getDisplayRole(selectedUser) === "Adviser" || Boolean(selectedUser.adviser_section_id)) && (
                  <div className="profile-detail">
                    <span>Advisory Section</span>
                    <strong>
                      {selectedUser.adviser_grade_level_name || selectedUser.gradeLevel
                        ? `${selectedUser.adviser_grade_level_name || selectedUser.gradeLevel} - ${selectedUser.adviser_section_name || selectedUser.section || "-"}`
                        : selectedUser.adviser_section_name || selectedUser.section || "-"}
                    </strong>
                  </div>
                )}
              </div>

              {/* Teaching assignments / classes view */}
              {(getDisplayRole(selectedUser) === "Subject Teacher" ||
                getDisplayRole(selectedUser) === "Adviser" ||
                (Array.isArray(selectedUser.teaching_assignments) && selectedUser.teaching_assignments.length > 0)) && (
                <div className="profile-assignments-section">
                  <h4 className="profile-assignments-title">Teaching Subject Assignments</h4>
                  {Array.isArray(selectedUser.teaching_assignments) && selectedUser.teaching_assignments.length > 0 ? (
                    <div className="profile-assignments-list">
                      {selectedUser.teaching_assignments.map((ta, idx) => (
                        <div key={idx} className="profile-assignment-item">
                          <div className="profile-assignment-sub">
                            <strong>{ta.subject_name || "Subject"}</strong>
                            {ta.subject_code && <span className="profile-code-badge">{ta.subject_code}</span>}
                          </div>
                          <div className="profile-assignment-sec">
                            {ta.grade_level_name ? `${ta.grade_level_name} - ` : ""}
                            {ta.section_name || "Section"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="profile-assignments-empty">
                      No teaching assignments assigned for current school year.
                    </div>
                  )}
                </div>
              )}

              <div className="profile-modal-actions">
                <button type="button" className="profile-close-btn" onClick={() => setSelectedUser(null)}>
                  Close
                </button>

                <button
                  type="button"
                  className="profile-edit-btn"
                  onClick={() => handleEditUser(selectedUser)}
                >
                  Edit User
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DELETE USER MODAL */}
        {deleteUser && (
          <div className="modal-overlay" onClick={() => setDeleteUser(null)}>
            <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
              <div className="delete-modal-header">
                <h2>Delete User Account</h2>
                <p>This action cannot be undone.</p>
              </div>

              <div className="delete-user-info">
                <strong>{getUsername(deleteUser)}</strong>
                <span>{deleteUser.email}</span>
              </div>

              <div className="delete-modal-actions">
                <button type="button" className="delete-close-btn" onClick={() => setDeleteUser(null)}>
                  Close
                </button>

                <button
                  type="button"
                  className="delete-confirm-btn"
                  onClick={handleConfirmDelete}
                  disabled={deletingUser}
                >
                  {deletingUser ? "Deleting..." : "Delete Account"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ADD / EDIT USER MODAL */}
        {formMode && (
          <div className="modal-overlay" onClick={() => setFormMode(null)}>
            <div className="add-user-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{formMode === "edit" ? "Edit User" : "Add New User"}</h2>
                <p>{formMode === "edit" ? "Update user account information and role assignments" : "Create a new user account with role assignments"}</p>
              </div>
              {formError && <div className="form-error">{formError}</div>}

              <div className="form-grid">
                <div className="form-group">
                  <label>First Name</label>
                  <input type="text" name="first_name" value={formData.first_name} onChange={handleFormChange} placeholder="Enter first name" />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input type="text" name="last_name" value={formData.last_name} onChange={handleFormChange} placeholder="Enter last name" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" name="email" value={formData.email} onChange={handleFormChange} placeholder="Enter email address" />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleFormChange}
                    placeholder={formMode === "edit" ? "Leave blank to keep current" : "Enter password"}
                  />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select name="role" value={formData.role} onChange={handleFormChange}>
                    <option value="" disabled>Select Role</option>
                    <option value="Subject Teacher">Subject Teacher</option>
                    <option value="Principal">Principal</option>
                    <option value="Adviser">Adviser</option>
                    <option value="Department Head">Department Head</option>
                  </select>
                </div>

                {/* DEPARTMENT DROPDOWN */}
                {(formData.role === "Department Head" ||
                  formData.role === "Subject Teacher" ||
                  formData.role === "Adviser") && (
                  <div className="form-group">
                    <label>Department / Assigned Area</label>
                    <select
                      name="department_id"
                      value={formData.department_id}
                      onChange={handleFormChange}
                    >
                      <option value="">Select Department</option>
                      {departments.map((dept) => (
                        <option key={dept.department_id} value={dept.department_id}>
                          {dept.department_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Adviser Advisory Section */}
              {formData.role === "Adviser" && (
                <div className="assignment-box">
                  <div className="assignment-header">
                    <h3>Adviser Advisory Section</h3>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Advisory Grade Level</label>
                      <select
                        name="adviser_grade_level_id"
                        value={formData.adviser_grade_level_id}
                        onChange={handleFormChange}
                      >
                        <option value="">Select Grade Level</option>
                        {gradeLevels.map((gl) => (
                          <option key={gl.grade_level_id} value={gl.grade_level_id}>
                            {gl.grade_level_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Advisory Section</label>
                      <select
                        name="adviser_section_id"
                        value={formData.adviser_section_id}
                        onChange={handleFormChange}
                        disabled={!formData.adviser_grade_level_id}
                      >
                        <option value="">Select Section</option>
                        {sections
                          .filter((sec) => String(sec.grade_level_id) === String(formData.adviser_grade_level_id))
                          .map((sec) => (
                            <option key={sec.section_id} value={sec.section_id}>
                              {sec.section_name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Teaching Assignments */}
              {(formData.role === "Subject Teacher" || formData.role === "Adviser") && (
                <div className="assignment-box">
                  <div className="assignment-header">
                    <div>
                      <h3>Teaching Subject Assignments</h3>
                      <p className="assignment-subtitle">Assign subject classes to this faculty member</p>
                    </div>
                    <button type="button" className="add-assignment-btn" onClick={handleAddTeachingAssignment}>
                      <Icon type="plus" size={16} /> Add Subject Class
                    </button>
                  </div>

                  {formData.teaching_assignments.length === 0 ? (
                    <div className="assignment-empty-state">
                      No subject classes assigned yet. Click <strong>+ Add Subject Class</strong> above to add assignments.
                    </div>
                  ) : (
                    formData.teaching_assignments.map((assignment, index) => {
                      const availSections = sections.filter(
                        (sec) => String(sec.grade_level_id) === String(assignment.grade_level_id)
                      );
                      const availOfferings = subjectOfferings.filter(
                        (so) => String(so.section_id) === String(assignment.section_id)
                      );

                      return (
                        <div key={index} className="assignment-row">
                          <div className="form-group">
                            <label>Grade Level</label>
                            <select
                              value={assignment.grade_level_id}
                              onChange={(e) => handleTeachingAssignmentChange(index, "grade_level_id", e.target.value)}
                            >
                              <option value="">Select Grade</option>
                              {gradeLevels.map((gl) => (
                                <option key={gl.grade_level_id} value={gl.grade_level_id}>
                                  {gl.grade_level_name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group">
                            <label>Section</label>
                            <select
                              value={assignment.section_id}
                              onChange={(e) => handleTeachingAssignmentChange(index, "section_id", e.target.value)}
                              disabled={!assignment.grade_level_id}
                            >
                              <option value="">Select Section</option>
                              {availSections.map((sec) => (
                                <option key={sec.section_id} value={sec.section_id}>
                                  {sec.section_name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group">
                            <label>Subject</label>
                            <select
                              value={assignment.subject_offering_id}
                              onChange={(e) => handleTeachingAssignmentChange(index, "subject_offering_id", e.target.value)}
                              disabled={!assignment.section_id}
                            >
                              <option value="">Select Subject</option>
                              {availOfferings.map((so) => (
                                <option key={so.subject_offering_id} value={so.subject_offering_id}>
                                  {so.subject_name} {so.subject_code ? `(${so.subject_code})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            className="remove-btn"
                            title="Remove class assignment"
                            onClick={() => handleRemoveTeachingAssignment(index)}
                          >
                            <Icon type="trash" size={17} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="modal-close-btn" onClick={() => setFormMode(null)}>Close</button>
                <button type="button" className="modal-save-btn" onClick={handleSaveUser} disabled={savingUser}>
                  {savingUser ? "Saving..." : formMode === "edit" ? "Save Changes" : "Create User"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}