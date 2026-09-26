import React, { useEffect, useMemo, useRef, useState } from "react";
import DropdownSelect from "../../components/common/DropdownSelect";
import { Plus, X, Edit, Users, Eye, MoreVertical } from "lucide-react";
import "../../styles/ManageUsers.css";
import "../../styles/StudentSectionManagement.css";

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

function StatusBadge({ status }) {
  const isActive = String(status).toLowerCase() === "active";
  return (
    <span className={`status-badge ${isActive ? "active" : "inactive"}`}>
      <span className="status-dot"></span>
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

// Custom dropdown for Section Actions
function ActionMenu({ section, onEdit, onManageStudents, onViewStudents }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="actions" ref={menuRef} style={{ position: 'relative' }}>
      <button className="action-btn action-btn--edit" onClick={() => setIsOpen(!isOpen)} title="Actions" type="button">
        <Edit size={21} />
      </button>
      {isOpen && (
        <div className="section-action-dropdown">
          <button onClick={() => { setIsOpen(false); onEdit(section); }}>
            <Edit size={14} /> Edit Section
          </button>
          <button onClick={() => { setIsOpen(false); onManageStudents(section); }}>
            <Users size={14} /> Manage Students
          </button>
          <button onClick={() => { setIsOpen(false); onViewStudents(section); }}>
            <Eye size={14} /> View Students
          </button>
        </div>
      )}
    </div>
  );
}


export default function StudentSectionManagement() {
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [gradeLevels] = useState([
    { value: "Grade 7", label: "Grade 7" },
    { value: "Grade 8", label: "Grade 8" },
    { value: "Grade 9", label: "Grade 9" },
    { value: "Grade 10", label: "Grade 10" },
  ]);

  const [sectionLevelFilter, setSectionLevelFilter] = useState("All Levels");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSectionFilter, setStudentSectionFilter] = useState("All Sections");
  const [studentStatusFilter, setStudentStatusFilter] = useState("All Students");
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());

  // Modal states
  const [activeModal, setActiveModal] = useState(null); // 'createSection', 'editSection', 'assignSelected', 'manageStudents', 'removeStudent'
  
  // Modal context data
  const [sectionFormData, setSectionFormData] = useState({ id: null, name: "", level: "Grade 7" });
  const [assignFormData, setAssignFormData] = useState({ section_id: "" });
  const [targetSection, setTargetSection] = useState(null); // For Manage Students
  const [targetStudent, setTargetStudent] = useState(null); // For Remove single student confirmation
  const [manageSearch, setManageSearch] = useState("");

  // Dummy data init
  useEffect(() => {
    setSections([
      { id: 1, name: "Gemelina", level: "Grade 7", status: "Active" },
      { id: 2, name: "Mahogany", level: "Grade 7", status: "Active" },
      { id: 3, name: "Narra", level: "Grade 8", status: "Active" },
      { id: 4, name: "Tanguile", level: "Grade 9", status: "Active" },
    ]);
    setStudents([
      { id: 101, name: "Juan Dela Cruz", lrn: "123456789012", gradeLevel: "Grade 7", section_id: 1, section: "Gemelina", status: "Active" },
      { id: 102, name: "Maria Santos", lrn: "123456789013", gradeLevel: "Grade 7", section_id: 2, section: "Mahogany", status: "Active" },
      { id: 103, name: "Pedro Garcia", lrn: "123456789014", gradeLevel: "Grade 7", section_id: null, section: "Unassigned", status: "Active" },
      { id: 104, name: "Ana Reyes", lrn: "123456789015", gradeLevel: "Grade 8", section_id: 3, section: "Narra", status: "Active" },
    ]);
  }, []);

  // Get student count for a section dynamically
  const getSectionStudentCount = (sectionId) => students.filter(s => s.section_id === sectionId).length;

  const filteredSections = useMemo(() => {
    return sections.filter(sec => sectionLevelFilter === "All Levels" || sec.level === sectionLevelFilter);
  }, [sections, sectionLevelFilter]);

  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      const searchMatch = student.name.toLowerCase().includes(studentSearch.toLowerCase()) || student.lrn.includes(studentSearch);
      let sectionMatch = true;
      if (studentSectionFilter !== "All Sections") {
        if (studentSectionFilter === "Unassigned") sectionMatch = !student.section_id;
        else sectionMatch = student.section === studentSectionFilter;
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
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedStudentIds(newSelected);
  };

  const toggleAllStudents = () => {
    if (selectedStudentIds.size === filteredStudents.length && filteredStudents.length > 0) setSelectedStudentIds(new Set());
    else setSelectedStudentIds(new Set(filteredStudents.map(s => s.id)));
  };

  const handleSaveSection = (e) => {
    e.preventDefault();
    if (activeModal === 'createSection') {
      const newSection = {
        id: sections.length + 1,
        name: sectionFormData.name,
        level: sectionFormData.level,
        status: "Active"
      };
      setSections([...sections, newSection]);
    } else if (activeModal === 'editSection') {
      setSections(sections.map(s => s.id === sectionFormData.id ? { ...s, name: sectionFormData.name, level: sectionFormData.level } : s));
      
      // Update student grade levels if section level changed
      setStudents(students.map(st => st.section_id === sectionFormData.id ? { ...st, section: sectionFormData.name, gradeLevel: sectionFormData.level } : st));
    }
    closeModal();
  };

  const handleBulkAssign = (e) => {
    e.preventDefault();
    const ts = sections.find(s => String(s.id) === String(assignFormData.section_id));
    if (!ts) return;
    setStudents(prev => prev.map(st => {
      if (selectedStudentIds.has(st.id)) {
        return { ...st, section_id: ts.id, section: ts.name, gradeLevel: ts.level };
      }
      return st;
    }));
    setSelectedStudentIds(new Set());
    closeModal();
  };

  const openCreateSection = () => {
    setSectionFormData({ id: null, name: "", level: "Grade 7" });
    setActiveModal('createSection');
  };

  const openEditSection = (section) => {
    setSectionFormData({ id: section.id, name: section.name, level: section.level });
    setActiveModal('editSection');
  };

  const openManageStudents = (section) => {
    setTargetSection(section);
    setManageSearch("");
    setActiveModal('manageStudents');
  };

  const openViewStudents = (section) => {
    // Navigate main student table by applying filter
    setStudentSectionFilter(section.name);
    // Ensure view is scrolled
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const removeStudentFromSection = (student) => {
    setTargetStudent(student);
    setActiveModal('removeStudent');
  };

  const confirmRemoveStudent = () => {
    if (!targetStudent) return;
    setStudents(students.map(s => s.id === targetStudent.id ? { ...s, section_id: null, section: "Unassigned" } : s));
    setActiveModal('manageStudents');
    setTargetStudent(null);
  };

  const assignStudentToSection = (studentId, sectionId) => {
    const ts = sections.find(s => s.id === sectionId);
    if (!ts) return;
    setStudents(students.map(s => s.id === studentId ? { ...s, section_id: ts.id, section: ts.name, gradeLevel: ts.level } : s));
  };

  const closeModal = () => {
    setActiveModal(null);
    setTargetStudent(null);
  };

  return (
    <div className="user-management-page section-management-page">
      <div className="content-wrapper">
        <div className="page-header">
          <div>
            <h1>Student Section Management</h1>
            <p>Create and manage sections and assign students to their respective sections.</p>
          </div>
          <button type="button" className="add-user-btn" onClick={openCreateSection}>
            <Plus size={20} /> Create Section
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
                  <th>Actions</th>
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
                    <td>{getSectionStudentCount(sec.id)}</td>
                    <td><StatusBadge status={sec.status} /></td>
                    <td style={{ overflow: 'visible' }}>
                      <ActionMenu 
                        section={sec} 
                        onEdit={openEditSection} 
                        onManageStudents={openManageStudents} 
                        onViewStudents={openViewStudents} 
                      />
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
                onClick={() => setActiveModal('assignSelected')}
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
              >
                Assign Selected
              </button>
            </div>
          )}

          <div className="filter-container">
            <label className="search-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
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
                    <input type="checkbox" checked={selectedStudentIds.size === filteredStudents.length && filteredStudents.length > 0} onChange={toggleAllStudents} />
                  </th>
                  <th>Student</th>
                  <th>LRN</th>
                  <th>Grade Level</th>
                  <th>Section</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map(student => (
                  <tr key={student.id}>
                    <td>
                      <input type="checkbox" checked={selectedStudentIds.has(student.id)} onChange={() => toggleStudentSelection(student.id)} />
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
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr><td colSpan="6" className="users-empty-state">No students found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* MODALS */}
        {/* Create / Edit Section Modal */}
        {(activeModal === 'createSection' || activeModal === 'editSection') && (
          <div className="user-form-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
            <section className="user-form-modal" role="dialog" style={{ maxWidth: '500px' }}>
              <header className="user-form-header">
                <div className="user-form-heading">
                  <div>
                    <h2 id="user-form-title">{activeModal === 'createSection' ? 'Create Section' : 'Edit Section'}</h2>
                  </div>
                </div>
                <button className="user-form-close" type="button" onClick={closeModal}><X size={20}/></button>
              </header>
              <form className="user-form-layout" onSubmit={handleSaveSection}>
                <div className="user-form-body">
                  <fieldset className="user-form-fields">
                    <section className="user-form-section">
                      <div className="user-form-section-heading">
                        <h3>Section Details</h3>
                        <p>{activeModal === 'createSection' ? 'Create a new student section.' : 'Modify existing section details.'}</p>
                      </div>
                      <div className="user-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                        <div className="user-form-field">
                          <label className="user-form-label">Section Name <span aria-hidden="true">*</span></label>
                          <input type="text" className="user-form-placeholder-input" required value={sectionFormData.name} onChange={e => setSectionFormData({ ...sectionFormData, name: e.target.value })} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', color: '#1e293b' }} placeholder="Enter section name" />
                        </div>
                        <div className="user-form-field">
                          <label className="user-form-label">Section Level <span aria-hidden="true">*</span></label>
                          <DropdownSelect
                            label="Section Level"
                            value={sectionFormData.level}
                            options={gradeLevels}
                            onChange={(val) => setSectionFormData({ ...sectionFormData, level: val })}
                            className="user-form-select"
                          />
                        </div>
                      </div>
                    </section>
                  </fieldset>
                </div>
                <footer className="user-form-footer">
                  <span>Review section details before saving.</span>
                  <div>
                    <button type="button" className="user-form-cancel" onClick={closeModal}>Cancel</button>
                    <button type="submit" className="user-form-submit">{activeModal === 'createSection' ? 'Create Section' : 'Save Changes'}</button>
                  </div>
                </footer>
              </form>
            </section>
          </div>
        )}

        {/* Assign Selected Modal */}
        {activeModal === 'assignSelected' && (
          <div className="user-form-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
            <section className="user-form-modal" role="dialog" style={{ maxWidth: '500px' }}>
              <header className="user-form-header">
                <div className="user-form-heading">
                  <div>
                    <h2 id="user-form-title">Assign Students to Section</h2>
                  </div>
                </div>
                <button className="user-form-close" type="button" onClick={closeModal}><X size={20}/></button>
              </header>
              <form className="user-form-layout" onSubmit={handleBulkAssign}>
                <div className="user-form-body">
                  <fieldset className="user-form-fields">
                    <section className="user-form-section">
                      <div className="user-form-section-heading">
                        <h3>{selectedStudentIds.size} students selected</h3>
                        <p>These students will be assigned to the selected section.</p>
                      </div>
                      <div className="user-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                        <div className="user-form-field">
                          <label className="user-form-label">Select Section <span aria-hidden="true">*</span></label>
                          <DropdownSelect
                            label="Select Section"
                            value={assignFormData.section_id}
                            options={[
                              { value: "", label: "Select Section..." },
                              ...sections.map(sec => ({ value: sec.id, label: `${sec.name} — ${sec.level}` }))
                            ]}
                            onChange={(val) => setAssignFormData({ section_id: val })}
                            className="user-form-select"
                          />
                        </div>
                      </div>
                    </section>
                  </fieldset>
                </div>
                <footer className="user-form-footer">
                  <span>Review assignment details before saving.</span>
                  <div>
                    <button type="button" className="user-form-cancel" onClick={closeModal}>Cancel</button>
                    <button type="submit" className="user-form-submit">Assign Selected</button>
                  </div>
                </footer>
              </form>
            </section>
          </div>
        )}

        {/* Manage Students Modal */}
        {activeModal === 'manageStudents' && targetSection && (
          <div className="user-form-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
            <section className="user-form-modal" role="dialog" style={{ maxWidth: '650px', maxHeight: '90vh' }}>
              <header className="user-form-header">
                <div className="user-form-heading">
                  <div>
                    <h2 id="user-form-title">Manage Students — {targetSection.name}</h2>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>{targetSection.level}</p>
                  </div>
                </div>
                <button className="user-form-close" type="button" onClick={closeModal}><X size={20}/></button>
              </header>
              <div className="user-form-layout">
                <div className="user-form-body" style={{ padding: '0', overflowY: 'auto' }}>
                  
                  {/* Current Students */}
                  <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--mu-border)' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--mu-navy)', marginBottom: '12px' }}>Current Students</h3>
                    <div className="manage-student-list">
                      {students.filter(s => s.section_id === targetSection.id).map(student => (
                        <div key={student.id} className="manage-student-item">
                          <div>
                            <strong>{student.name}</strong>
                            <span>{student.lrn}</span>
                          </div>
                          <button type="button" onClick={() => removeStudentFromSection(student)} className="btn-text btn-danger">Remove</button>
                        </div>
                      ))}
                      {students.filter(s => s.section_id === targetSection.id).length === 0 && (
                        <p className="users-empty-state" style={{ padding: '16px 0', border: 'none' }}>No students assigned to this section yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Add Students */}
                  <div style={{ padding: '24px 32px' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--mu-navy)', marginBottom: '12px' }}>Add Students</h3>
                    <div className="search-box" style={{ marginBottom: '16px', maxWidth: '100%' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                      <input type="text" placeholder="Search unassigned students..." value={manageSearch} onChange={(e) => setManageSearch(e.target.value)} />
                    </div>
                    
                    <div className="manage-student-list">
                      {students.filter(s => s.section_id !== targetSection.id && s.gradeLevel === targetSection.level && s.name.toLowerCase().includes(manageSearch.toLowerCase())).slice(0, 5).map(student => (
                        <div key={student.id} className="manage-student-item">
                          <div>
                            <strong>{student.name}</strong>
                            <span>{student.lrn} • {student.section_id ? `Currently in ${student.section}` : 'Unassigned'}</span>
                          </div>
                          <button type="button" onClick={() => assignStudentToSection(student.id, targetSection.id)} className="add-user-btn" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Add</button>
                        </div>
                      ))}
                      {students.filter(s => s.section_id !== targetSection.id && s.gradeLevel === targetSection.level && s.name.toLowerCase().includes(manageSearch.toLowerCase())).length === 0 && (
                        <p className="users-empty-state" style={{ padding: '16px 0', border: 'none' }}>No eligible students found to add.</p>
                      )}
                    </div>
                  </div>

                </div>
                <footer className="user-form-footer">
                  <span>Changes are applied immediately.</span>
                  <div>
                    <button type="button" className="user-form-cancel" onClick={closeModal}>Done</button>
                  </div>
                </footer>
              </div>
            </section>
          </div>
        )}

        {/* Remove Student Confirmation Modal */}
        {activeModal === 'removeStudent' && targetStudent && (
          <div className="user-form-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setActiveModal('manageStudents'); }} style={{ zIndex: 1100 }}>
            <section className="user-form-modal" role="dialog" style={{ maxWidth: '400px' }}>
              <header className="user-form-header">
                <div className="user-form-heading">
                  <div>
                    <h2 id="user-form-title">Remove Student?</h2>
                  </div>
                </div>
                <button className="user-form-close" type="button" onClick={() => setActiveModal('manageStudents')}><X size={20}/></button>
              </header>
              <div className="user-form-layout">
                <div className="user-form-body">
                  <fieldset className="user-form-fields">
                    <section className="user-form-section">
                      <p style={{ color: '#334155', margin: '0' }}>
                        <strong>{targetStudent.name}</strong> will be removed from <strong>{targetSection.name}</strong> and become Unassigned.
                      </p>
                    </section>
                  </fieldset>
                </div>
                <footer className="user-form-footer">
                  <span>This does not delete the student record.</span>
                  <div>
                    <button type="button" className="user-form-cancel" onClick={() => setActiveModal('manageStudents')}>Cancel</button>
                    <button type="button" className="user-form-submit" onClick={confirmRemoveStudent} style={{ backgroundColor: '#ef4444' }}>Remove Student</button>
                  </div>
                </footer>
              </div>
            </section>
          </div>
        )}

      </div>
    </div>
  );
}
