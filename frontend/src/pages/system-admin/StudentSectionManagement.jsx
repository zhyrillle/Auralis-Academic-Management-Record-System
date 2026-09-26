import React, { useEffect, useMemo, useRef, useState } from "react";
import DropdownSelect from "../../components/common/DropdownSelect";
import "../../styles/ManageUsers.css"; // Reuse existing styles for consistency
import "../../styles/StudentSectionManagement.css";

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

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
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
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
    case "close":
      return (
        <svg {...common}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    default:
      return null;
  }
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

export default function StudentSectionManagement() {
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([
    { value: "Grade 7", label: "Grade 7" },
    { value: "Grade 8", label: "Grade 8" },
    { value: "Grade 9", label: "Grade 9" },
    { value: "Grade 10", label: "Grade 10" },
  ]);

  const [loading, setLoading] = useState(false);
  
  // Section filters
  const [sectionLevelFilter, setSectionLevelFilter] = useState("All Levels");
  
  // Student filters
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSectionFilter, setStudentSectionFilter] = useState("All Sections");
  const [studentStatusFilter, setStudentStatusFilter] = useState("All Students");

  // Selection state for bulk assign
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());

  // Modal states
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningStudent, setAssigningStudent] = useState(null); // null means bulk
  
  const [sectionFormData, setSectionFormData] = useState({ name: "", level: "Grade 7" });
  const [assignFormData, setAssignFormData] = useState({ section_id: "" });

  // Dummy data initialization to show UI functionality before actual backend wiring
  useEffect(() => {
    setSections([
      { id: 1, name: "Gemelina", level: "Grade 7", students: 50, status: "Active" },
      { id: 2, name: "Mahogany", level: "Grade 7", students: 50, status: "Active" },
      { id: 3, name: "Narra", level: "Grade 8", students: 48, status: "Active" },
      { id: 4, name: "Tanguile", level: "Grade 9", students: 52, status: "Active" },
    ]);
    
    setStudents([
      { id: 101, name: "Juan Dela Cruz", lrn: "123456789012", gradeLevel: "Grade 7", section_id: 1, section: "Gemelina", status: "Active" },
      { id: 102, name: "Maria Santos", lrn: "123456789013", gradeLevel: "Grade 7", section_id: 2, section: "Mahogany", status: "Active" },
      { id: 103, name: "Pedro Garcia", lrn: "123456789014", gradeLevel: "Grade 7", section_id: null, section: "Unassigned", status: "Active" },
      { id: 104, name: "Ana Reyes", lrn: "123456789015", gradeLevel: "Grade 8", section_id: 3, section: "Narra", status: "Active" },
    ]);
  }, []);

  const filteredSections = useMemo(() => {
    return sections.filter(sec => 
      sectionLevelFilter === "All Levels" || sec.level === sectionLevelFilter
    );
  }, [sections, sectionLevelFilter]);

  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      const searchMatch = student.name.toLowerCase().includes(studentSearch.toLowerCase()) || 
                          student.lrn.includes(studentSearch);
      
      let sectionMatch = true;
      if (studentSectionFilter !== "All Sections") {
        if (studentSectionFilter === "Unassigned") {
          sectionMatch = !student.section_id;
        } else {
          sectionMatch = student.section === studentSectionFilter;
        }
      }
      
      let statusMatch = true;
      if (studentStatusFilter !== "All Students") {
        if (studentStatusFilter === "Assigned") statusMatch = !!student.section_id;
        if (studentStatusFilter === "Unassigned") statusMatch = !student.section_id;
      }
      
      return searchMatch && sectionMatch && statusMatch;
    });
  }, [students, studentSearch, studentSectionFilter, studentStatusFilter]);

  const toggleStudentSelection = (id) => {
    const newSelected = new Set(selectedStudentIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedStudentIds(newSelected);
  };

  const toggleAllStudents = () => {
    if (selectedStudentIds.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const handleCreateSection = (e) => {
    e.preventDefault();
    const newSection = {
      id: sections.length + 1,
      name: sectionFormData.name,
      level: sectionFormData.level,
      students: 0,
      status: "Active"
    };
    setSections([...sections, newSection]);
    setIsSectionModalOpen(false);
    setSectionFormData({ name: "", level: "Grade 7" });
  };

  const handleAssignSubmit = (e) => {
    e.preventDefault();
    const targetSection = sections.find(s => String(s.id) === String(assignFormData.section_id));
    if (!targetSection) return;

    setStudents(prev => prev.map(student => {
      if (assigningStudent) {
        if (student.id === assigningStudent.id) {
          return { ...student, section_id: targetSection.id, section: targetSection.name, gradeLevel: targetSection.level };
        }
      } else {
        if (selectedStudentIds.has(student.id)) {
          return { ...student, section_id: targetSection.id, section: targetSection.name, gradeLevel: targetSection.level };
        }
      }
      return student;
    }));
    
    setIsAssignModalOpen(false);
    setSelectedStudentIds(new Set());
    setAssigningStudent(null);
  };

  return (
    <div className="user-management-page section-management-page">
      <div className="content-wrapper">
        <div className="page-header">
          <div>
            <h1>Student Section Management</h1>
            <p>Create and manage sections and assign students to their respective sections.</p>
          </div>
          <button type="button" className="add-user-btn" onClick={() => setIsSectionModalOpen(true)}>
            <Icon type="plus" size={20} /> Create Section
          </button>
        </div>

        {/* Section List Panel */}
        <section className="users-panel">
          <div className="users-panel-header">
            <div>
              <h2>Sections</h2>
              <p>Manage existing sections and view capacity.</p>
            </div>
            <span className="users-result-count">{filteredSections.length} sections</span>
          </div>

          <div className="filter-container">
            <DropdownSelect
              label="Filter by level"
              value={sectionLevelFilter}
              options={[{ value: "All Levels", label: "All Levels" }, ...gradeLevels]}
              onChange={setSectionLevelFilter}
              className="manage-users-filter-select"
            />
          </div>

          <div className="table-responsive">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Section Name</th>
                  <th>Level</th>
                  <th>Students</th>
                  <th>Status</th>
                  <th className="action-column">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSections.map(sec => (
                  <tr key={sec.id}>
                    <td>
                      <div className="user-info">
                        <span className="user-name">{sec.name}</span>
                      </div>
                    </td>
                    <td><span className="role-badge">{sec.level}</span></td>
                    <td>{sec.students}</td>
                    <td><StatusBadge status={sec.status} /></td>
                    <td className="action-column">
                      <button className="icon-btn edit" title="Edit Section"><Icon type="edit" size={16}/></button>
                    </td>
                  </tr>
                ))}
                {filteredSections.length === 0 && (
                  <tr><td colSpan="5" className="users-empty-state">No sections found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Student Management Panel */}
        <section className="users-panel" style={{ marginTop: '24px' }}>
          <div className="users-panel-header">
            <div>
              <h2>Students</h2>
              <p>Assign students to sections.</p>
            </div>
            <span className="users-result-count">{filteredStudents.length} students</span>
          </div>

          {selectedStudentIds.size > 0 && (
            <div className="bulk-action-bar">
              <span>{selectedStudentIds.size} students selected</span>
              <button 
                className="add-user-btn" 
                onClick={() => { setAssigningStudent(null); setIsAssignModalOpen(true); }}
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
              >
                Assign Selected
              </button>
            </div>
          )}

          <div className="filter-container">
            <label className="search-box">
              <Icon type="search" size={18} />
              <input type="text" placeholder="Search by name or LRN" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
            </label>
            <DropdownSelect
              label="Filter by Section"
              value={studentSectionFilter}
              options={[
                { value: "All Sections", label: "All Sections" },
                { value: "Unassigned", label: "Unassigned" },
                ...sections.map(s => ({ value: s.name, label: s.name }))
              ]}
              onChange={setStudentSectionFilter}
              className="manage-users-filter-select"
            />
            <DropdownSelect
              label="Filter by Assignment"
              value={studentStatusFilter}
              options={[
                { value: "All Students", label: "All Students" },
                { value: "Assigned", label: "Assigned" },
                { value: "Unassigned", label: "Unassigned" },
              ]}
              onChange={setStudentStatusFilter}
              className="manage-users-filter-select"
            />
          </div>

          <div className="table-responsive">
            <table className="users-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedStudentIds.size === filteredStudents.length && filteredStudents.length > 0}
                      onChange={toggleAllStudents}
                    />
                  </th>
                  <th>Student</th>
                  <th>LRN</th>
                  <th>Grade Level</th>
                  <th>Section</th>
                  <th>Status</th>
                  <th className="action-column">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map(student => (
                  <tr key={student.id}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedStudentIds.has(student.id)}
                        onChange={() => toggleStudentSelection(student.id)}
                      />
                    </td>
                    <td>
                      <div className="user-info">
                        <span className="user-name">{student.name}</span>
                      </div>
                    </td>
                    <td><span className="user-email">{student.lrn}</span></td>
                    <td>{student.gradeLevel}</td>
                    <td>
                      {student.section_id ? (
                        <span className="role-badge adviser">{student.section}</span>
                      ) : (
                        <span className="role-badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>Unassigned</span>
                      )}
                    </td>
                    <td><StatusBadge status={student.status} /></td>
                    <td className="action-column">
                      <button 
                        className="btn-text" 
                        onClick={() => { setAssigningStudent(student); setIsAssignModalOpen(true); }}
                        style={{ color: 'var(--mu-navy)', fontWeight: '600', cursor: 'pointer', background: 'none', border: 'none' }}
                      >
                        {student.section_id ? 'Reassign' : 'Assign Section'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr><td colSpan="7" className="users-empty-state">No students found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Modals */}
        {isSectionModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '400px' }}>
              <div className="modal-header">
                <h2>Create Section</h2>
                <button type="button" className="close-btn" onClick={() => setIsSectionModalOpen(false)}>
                  <Icon type="close" size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateSection} className="modal-form-body">
                <div className="form-group">
                  <label>Section Name</label>
                  <input 
                    type="text" 
                    required 
                    value={sectionFormData.name}
                    onChange={(e) => setSectionFormData({ ...sectionFormData, name: e.target.value })}
                    className="form-input"
                    placeholder="e.g. Gemelina"
                  />
                </div>
                <div className="form-group">
                  <label>Section Level</label>
                  <select 
                    className="form-input" 
                    value={sectionFormData.level}
                    onChange={(e) => setSectionFormData({ ...sectionFormData, level: e.target.value })}
                  >
                    {gradeLevels.map(lvl => (
                      <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setIsSectionModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">Create Section</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isAssignModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '400px' }}>
              <div className="modal-header">
                <h2>{assigningStudent ? 'Assign Student to Section' : 'Assign Students to Section'}</h2>
                <button type="button" className="close-btn" onClick={() => { setIsAssignModalOpen(false); setAssigningStudent(null); }}>
                  <Icon type="close" size={20} />
                </button>
              </div>
              <form onSubmit={handleAssignSubmit} className="modal-form-body">
                {assigningStudent ? (
                  <div style={{ marginBottom: '16px', fontSize: '0.9rem', color: '#475569' }}>
                    <p><strong>Student:</strong> {assigningStudent.name}</p>
                    <p><strong>Grade Level:</strong> {assigningStudent.gradeLevel}</p>
                    <p><strong>Current Section:</strong> {assigningStudent.section}</p>
                  </div>
                ) : (
                  <div style={{ marginBottom: '16px', fontSize: '0.9rem', color: '#475569' }}>
                    <p>Assigning <strong>{selectedStudentIds.size}</strong> selected students.</p>
                  </div>
                )}
                
                <div className="form-group">
                  <label>Assign Section</label>
                  <select 
                    className="form-input" 
                    required
                    value={assignFormData.section_id}
                    onChange={(e) => setAssignFormData({ section_id: e.target.value })}
                  >
                    <option value="" disabled>Select Section</option>
                    {sections.map(sec => (
                      <option key={sec.id} value={sec.id}>{sec.name} — {sec.level}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => { setIsAssignModalOpen(false); setAssigningStudent(null); }}>Cancel</button>
                  <button type="submit" className="btn-primary">Save Assignment</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
