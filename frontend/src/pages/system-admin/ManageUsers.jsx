import React, { useState } from "react";
import "../../styles/ManageUsers.css";

const initialUsers = [
  {
    name: "Ms. Clara Reyes",
    username: "@creyes",
    email: "c.reyes@edusync.edu.ph",
    role: "Subject Teacher",
    department: "English",
    gradeLevel: "Grade 8",
    section: "Section A",
    status: "Active",
  },
  {
    name: "Mr. Leo Reyes",
    username: "@lreyes",
    email: "l.reyes@edusync.edu.ph",
    role: "Principal",
    department: "School Administration",
    gradeLevel: "-",
    section: "-",
    status: "Inactive",
  },
  {
    name: "Mrs. Ana Garcia",
    username: "@agarcia",
    email: "a.garcia@edusync.edu.ph",
    role: "Adviser",
    department: "Filipino",
    gradeLevel: "Grade 9",
    section: "Section B",
    status: "Active",
  },
  {
    name: "Mrs. Nora Castil",
    username: "@ncastil",
    email: "n.castil@edusync.edu.ph",
    role: "Department Head",
    department: "Math",
    gradeLevel: "-",
    section: "-",
    status: "Inactive",
  },
  {
    name: "Ms. Patricia Ong",
    username: "@pong",
    email: "p.ong@edusync.edu.ph",
    role: "Subject Teacher",
    department: "English",
    gradeLevel: "Grade 7",
    section: "Section C",
    status: "Active",
  },
  {
    name: "Ms. Patricia Ong",
    username: "@pong",
    email: "p.ong@edusync.edu.ph",
    role: "Subject Teacher",
    department: "English",
    gradeLevel: "Grade 10",
    section: "Section D",
    status: "Active",
  },
];

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

    case "filter":
      return (
        <svg {...common}>
          <path d="M4 5h16l-6 7v6l-4 2v-8L4 5z" />
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

    default:
      return null;
  }
}

function RoleBadge({ role }) {
  const roleClass = role.toLowerCase().replaceAll(" ", "-");

  return (
    <span className={`role-badge ${roleClass}`}>
      {role}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span
      className={`status-badge ${
        status === "Active" ? "active" : "inactive"
      }`}
    >
      <span className="status-dot"></span>
      {status}
    </span>
  );
}

export default function UserManagement() {

  const [users, setUsers] = useState(initialUsers);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [statusFilter, setStatusFilter] = useState("All Status");

  const [deleteUser, setDeleteUser] = useState(null);

  const [formMode, setFormMode] = useState(null);

  const [selectedUser, setSelectedUser] = useState(null);

  const [editingIndex, setEditingIndex] = useState(null);

  const emptyForm = {
    name: "",
    username: "",
    email: "",
    password: "",
    role: "",
    department: "",
    gradeLevel: "",
    section: "",
    status: "Active",
  };

  const [formData, setFormData] = useState(emptyForm);

  const filteredUsers = users.filter((user) => {
    const searchMatch =
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.username.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());

    const roleMatch =
      roleFilter === "All Roles" || user.role === roleFilter;

    const statusMatch =
      statusFilter === "All Status" || user.status === statusFilter;

    return searchMatch && roleMatch && statusMatch;
  });

  const handleAddUser = () => {
    setFormMode("add");
    setEditingIndex(null);

    setFormData({
      name: "",
      username: "",
      email: "",
      password: "",
      role: "",
      department: "",
      gradeLevel: "",
      section: "",
      status: "Active",
    });
  };

  const handleEditUser = (user, index) => {
    setFormMode("edit");
    setEditingIndex(index);

    setFormData({
      name: user.name,
      username: user.username.replace("@", ""),
      email: user.email,
      password: "",
      role: user.role,
      department: user.department,
      gradeLevel: user.gradeLevel || "",
      section: user.section || "",
      status: user.status,
    });

    setSelectedUser(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSaveUser = () => {
    if (
      !formData.name ||
      !formData.username ||
      !formData.email ||
      !formData.role ||
      !formData.department
    ) {
      alert("Please fill in all required fields.");
      return;
    }

    if (formMode === "add") {
      const newUser = {
        name: formData.name,
        username: formData.username.startsWith("@")
          ? formData.username
          : `@${formData.username}`,
        email: formData.email,
        role: formData.role,
        department: formData.department,
        gradeLevel: formData.gradeLevel || "-",
        section: formData.section || "-",
        status: formData.status,
      };

      setUsers((previousUsers) => [
        ...previousUsers,
        newUser,
      ]);
    }

    if (formMode === "edit" && editingIndex !== null) {
      setUsers((previousUsers) =>
        previousUsers.map((user, index) => {
          if (index !== editingIndex) {
            return user;
          }

          return {
            ...user,
            name: formData.name,
            username: formData.username.startsWith("@")
              ? formData.username
              : `@${formData.username}`,
            email: formData.email,
            role: formData.role,
            department: formData.department,
            gradeLevel: formData.gradeLevel || "-",
            section: formData.section || "-",
            status: formData.status,
          };
        })
      );
    }

    setFormMode(null);
    setEditingIndex(null);
    setFormData(emptyForm);
  };

  const handleCloseForm = () => {
    setFormMode(null);
    setEditingIndex(null);
    setFormData(emptyForm);
  };

  const handleViewUser = (user) => {
    setSelectedUser(user);
  };

  const handleDeleteUser = (index) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this user?"
    );

    if (!confirmed) {
      return;
    }

    setUsers((previousUsers) =>
      previousUsers.filter((_, userIndex) => userIndex !== index)
    );
  };

  return (
    <div className="user-management-page">
      <div className="content-wrapper">

        <div className="page-header">
          <div>
            <h1>User Management</h1>
            <p>Manage user assignments</p>
          </div>

          <button
            className="add-user-btn"
            onClick={handleAddUser}
          >
            <Icon type="plusPerson" size={24} />
            Add User
          </button>
        </div>

        <div className="stats-grid">

          {/* TOTAL USERS */}

          <div className="stat-card">
            <div className="stat-icon total">
              <Icon type="users" size={25} />
            </div>

            <div className="stat-info">
              <span>Total Users</span>
              <strong>{users.length}</strong>
            </div>
          </div>


          {/* ACTIVE */}

          <div className="stat-card">
            <div className="stat-icon active-icon">
              <Icon type="check" size={25} />
            </div>

            <div className="stat-info">
              <span>Active</span>

              <strong className="green-text">
                {
                  users.filter(
                    (user) => user.status === "Active"
                  ).length
                }
              </strong>
            </div>
          </div>


          {/* INACTIVE */}

          <div className="stat-card">
            <div className="stat-icon inactive-icon">
              <Icon type="check" size={25} />
            </div>

            <div className="stat-info">
              <span>Inactive</span>

              <strong>
                {
                  users.filter(
                    (user) => user.status === "Inactive"
                  ).length
                }
              </strong>
            </div>
          </div>


          {/* ADVISERS */}

          <div className="stat-card">
            <div className="stat-icon adviser-icon">
              <Icon type="shield" size={24} />
            </div>

            <div className="stat-info">
              <span>Advisers</span>

              <strong>
                {
                  users.filter(
                    (user) => user.role === "Adviser"
                  ).length
                }
              </strong>
            </div>
          </div>

        </div>


        {/* SEARCH / FILTER */}

        <div className="filter-container">

          <div className="search-box">
            <Icon type="search" size={24} />

            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>


          <div className="filter-icon">
            <Icon type="filter" size={25} />
          </div>


          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option>All Roles</option>
            <option>Subject Teacher</option>
            <option>Principal</option>
            <option>Adviser</option>
            <option>Department Head</option>
          </select>


          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
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

              {filteredUsers.map((user) => {

                const originalIndex = users.indexOf(user);

                return (
                  <tr key={originalIndex}>

                    {/* USER NAME */}

                    <td>
                      <div className="user-name">
                        <span>{user.name}</span>
                        <small>{user.username}</small>
                      </div>
                    </td>


                    {/* EMAIL */}

                    <td>{user.email}</td>


                    {/* ROLE */}

                    <td>
                      <RoleBadge role={user.role} />
                    </td>


                    {/* DEPARTMENT */}

                    <td>{user.department}</td>


                    {/* STATUS */}

                    <td>
                      <StatusBadge status={user.status} />
                    </td>


                    {/* ACTIONS */}

                    <td>
                      <div className="actions">

                        {/* VIEW */}

                        <button
                          title="View"
                          onClick={() => handleViewUser(user)}
                        >
                          <Icon
                            type="eye"
                            size={21}
                          />
                        </button>


                        {/* EDIT */}

                        <button
                          title="Edit"
                          onClick={() =>
                            handleEditUser(
                              user,
                              originalIndex
                            )
                          }
                        >
                          <Icon
                            type="edit"
                            size={21}
                          />
                        </button>


                        {/* DELETE */}

                        <button
                            title="Delete"
                            onClick={() => setDeleteUser(user)}
                            >
                            <Icon type="trash" size={21} />
                            </button>

                      </div>
                    </td>

                  </tr>
                );
              })}

            </tbody>

          </table>

        </div>


        {/* ADD / EDIT USER MODAL */}

        {formMode && (
          <div
            className="modal-overlay"
            onClick={handleCloseForm}
          >

            <div
              className="add-user-modal"
              onClick={(e) => e.stopPropagation()}
            >

              <div className="modal-header">

                <h2>
                  {formMode === "edit"
                    ? "Edit User"
                    : "Add New User"}
                </h2>

                <p>
                  {formMode === "edit"
                    ? "Update account details and role assignment."
                    : "Create a new account and assign a role."}
                </p>

              </div>

              <div className="form-grid">

                {/* FULL NAME */}

                <div className="form-group">

                  <label>Full Name</label>

                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleFormChange}
                    placeholder="Enter full name"
                  />

                </div>


                {/* USERNAME */}

                <div className="form-group">

                  <label>Username</label>

                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleFormChange}
                    placeholder="Enter username"
                  />

                </div>


                {/* EMAIL */}

                <div className="form-group">

                  <label>Email Address</label>

                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    placeholder="Enter email address"
                  />

                </div>


                {/* PASSWORD */}

                <div className="form-group">

                  <label>Password</label>

                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleFormChange}
                    placeholder={
                      formMode === "edit"
                        ? "Leave blank to keep current password"
                        : "Enter password"
                    }
                  />

                </div>


                {/* ROLE */}

                <div className="form-group">

                  <label>Role</label>

                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleFormChange}
                  >

                    <option value="" disabled>
                      Select
                    </option>

                    <option>
                      Subject Teacher
                    </option>

                    <option>
                      Principal
                    </option>

                    <option>
                      Adviser
                    </option>

                    <option>
                      Department Head
                    </option>

                  </select>

                </div>


                {/* DEPARTMENT */}

                <div className="form-group">

                  <label>
                    Department / Assigned Area
                  </label>

                  <select
                    name="department"
                    value={formData.department}
                    onChange={handleFormChange}
                  >

                    <option value="" disabled>
                      Select
                    </option>

                    <option>English</option>
                    <option>Filipino</option>
                    <option>Math</option>
                    <option>Science</option>
                    <option>School Administration</option>

                  </select>

                </div>

              </div>


              {/* TEACHER ASSIGNMENT */}

              <div className="teacher-assignment">

                <h3>TEACHER ASSIGNMENT</h3>

                <div className="form-grid">

                  {/* GRADE LEVEL */}

                  <div className="form-group">

                    <label>
                      Assigned Grade Level
                    </label>

                    <select
                      name="gradeLevel"
                      value={formData.gradeLevel}
                      onChange={handleFormChange}
                    >

                      <option value="">
                        Select
                      </option>

                      <option>Grade 7</option>
                      <option>Grade 8</option>
                      <option>Grade 9</option>
                      <option>Grade 10</option>

                    </select>

                  </div>


                  {/* SECTION */}

                  <div className="form-group">

                    <label>
                      Assigned Section
                    </label>

                    <select
                      name="section"
                      value={formData.section}
                      onChange={handleFormChange}
                    >

                      <option value="">
                        Select
                      </option>

                      <option>Section A</option>
                      <option>Section B</option>
                      <option>Section C</option>
                      <option>Section D</option>

                    </select>

                  </div>

                </div>

              </div>


              <div className="account-status">

                <label>Account Status</label>

                <div className="status-options">

                  {/* ACTIVE */}

                  <button
                    type="button"
                    className={`account-status-btn ${
                      formData.status === "Active"
                        ? "active"
                        : "inactive-option"
                    }`}
                    onClick={() =>
                      setFormData((previous) => ({
                        ...previous,
                        status: "Active",
                      }))
                    }
                  >

                    <span className="status-dot"></span>
                    Active

                  </button>


                  {/* INACTIVE */}

                  <button
                    type="button"
                    className={`account-status-btn ${
                      formData.status === "Inactive"
                        ? "inactive"
                        : "inactive-option"
                    }`}
                    onClick={() =>
                      setFormData((previous) => ({
                        ...previous,
                        status: "Inactive",
                      }))
                    }
                  >

                    <span className="status-dot"></span>
                    Inactive

                  </button>

                </div>

              </div>


              {/* MODAL BUTTONS */}

              <div className="modal-actions">

                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={handleCloseForm}
                >
                  Close
                </button>


                <button
                  type="button"
                  className="modal-save-btn"
                  onClick={handleSaveUser}
                >
                  Save Changes
                </button>

              </div>

            </div>

          </div>
        )}


        {/* USER PROFILE / VIEW MODAL */}

        {selectedUser && (
          <div
            className="modal-overlay"
            onClick={() => setSelectedUser(null)}
          >

            <div
              className="user-profile-modal"
              onClick={(e) => e.stopPropagation()}
            >

              <div className="profile-modal-header">

                <h2>User Profile</h2>

                <p>
                  Account details and role assignment
                </p>

              </div>


              <div className="profile-summary">

                {/* AVATAR */}
                <div
                className="profile-avatarz"
                style={{
                    width: "100px",
                    height: "100px",
                    minWidth: "100px",
                    minHeight: "100px",
                    borderRadius: "50%",
                    backgroundColor: "#202d43",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    fontSize: "28px",
                    fontWeight: "600",
                    lineHeight: "1",
                    flexShrink: 0
                }}
                >
                {selectedUser.name
                    .replace(/^(Mr\.|Mrs\.|Ms\.)\s*/, "")
                    .split(" ")
                    .map((name) => name[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>

                {/* USER INFORMATION */}

                <div className="profile-main-info">

                  <h3>
                    {selectedUser.name.replace(
                      /^(Mr\.|Mrs\.|Ms\.)\s*/,
                      ""
                    )}
                  </h3>

                  <p className="profile-username">
                    {selectedUser.username}
                  </p>

                  <RoleBadge
                    role={selectedUser.role}
                  />

                </div>


                {/* STATUS */}

                <div className="profile-status">

                  <StatusBadge
                    status={selectedUser.status}
                  />

                </div>

              </div>


              {/* DIVIDER */}

              <div className="profile-divider"></div>

              <div className="profile-details">
                <div className="profile-detail">

                  <span>Email</span>

                  <strong>
                    {selectedUser.email}
                  </strong>

                </div>


                {/* DEPARTMENT */}

                <div className="profile-detail">

                  <span>Department</span>

                  <strong>
                    {selectedUser.department}
                  </strong>

                </div>


                {/* GRADE LEVEL */}

                <div className="profile-detail">

                  <span>Grade level</span>

                  <strong>
                    {selectedUser.gradeLevel || "-"}
                  </strong>

                </div>


                {/* SECTION */}

                <div className="profile-detail">

                  <span>Section</span>

                  <strong>
                    {selectedUser.section || "-"}
                  </strong>

                </div>

              </div>

              <div className="profile-modal-actions">

                <button
                  type="button"
                  className="profile-close-btn"
                  onClick={() =>
                    setSelectedUser(null)
                  }
                >
                  Close
                </button>


                <button
                  type="button"
                  className="profile-edit-btn"
                  onClick={() =>
                    handleEditUser(
                      selectedUser,
                      users.indexOf(selectedUser)
                    )
                  }
                >
                  Edit User
                </button>

              </div>

            </div>

          </div>
        )}

        {/* DELETE USER MODAL */}
{deleteUser && (
  <div
    className="modal-overlay"
    onClick={() => setDeleteUser(null)}
  >
    <div
      className="delete-modal"
      onClick={(e) => e.stopPropagation()}
    >

      <div className="delete-modal-header">
        <h2>Delete User Account</h2>
        <p>This action cannot be undone.</p>
      </div>

      <div className="delete-user-info">
        <strong>{deleteUser.name}</strong>
        <span>{deleteUser.email}</span>
      </div>

      <div className="delete-modal-actions">

        <button
          type="button"
          className="delete-close-btn"
          onClick={() => setDeleteUser(null)}
        >
          Close
        </button>

        <button
          type="button"
          className="delete-confirm-btn"
          onClick={() => {
            setDeleteUser(null);
          }}
        >
          Delete Account
        </button>

      </div>

    </div>
  </div>
)}

      </div>
    </div>
  );
}