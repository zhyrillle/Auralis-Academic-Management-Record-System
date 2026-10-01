import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  AlertTriangle,
  X,
  Send,
  FileSpreadsheet,
  Printer,
  Inbox,
} from "lucide-react";

import backIconUrl from "../../assets/backButton.svg";
import unavailableIconUrl from "../../assets/adviser-assets/unavailableicon.png";
import { getStoredUser } from "../../utils/auth";

// Services
import {
  getDeptFilterOptions,
  getDeptClassRecord,
  getDeptMissingGradesAlerts,
  sendTeacherGradeReminder,
} from "../../services/deptHeadClassRecordApi";

// DepEd Print Modal
import DepEdClassRecordPrintModal from "../../components/DepEdClassRecordPrintModal";

// Styles
import "../../styles/ClassRecord.css";

const MOCK_STUDENTS = [
  { id: "s1", lrn: "145783920614", firstName: "Alex Matthew", lastName: "Cruz", sex: "M" },
  { id: "s2", lrn: "238691475820", firstName: "Joshua Carlo", lastName: "Ramirez", sex: "M" },
  { id: "s3", lrn: "564920183747", firstName: "Daniel Joseph", lastName: "Reyes", sex: "M" },
  { id: "s4", lrn: "392748561830", firstName: "Adrian Kyle", lastName: "Santos", sex: "M" },
  { id: "s5", lrn: "817345629104", firstName: "Zachary James", lastName: "Villanueva", sex: "M" },
  { id: "s6", lrn: "472918365104", firstName: "Nathaniel John", lastName: "Garcia", sex: "M" },
  { id: "s7", lrn: "583027194658", firstName: "Miguel Andre", lastName: "Dela Cruz", sex: "M" },
  { id: "s8", lrn: "694135820477", firstName: "Patrick Luis", lastName: "Mendoza", sex: "M" },
  { id: "s9", lrn: "715284639501", firstName: "Christian Paolo", lastName: "Torres", sex: "M" },
  { id: "s10", lrn: "826395740612", firstName: "Gabriel Miguel", lastName: "Navarro", sex: "M" },
  { id: "s11", lrn: "937406851723", firstName: "Bianca Mae", lastName: "Santos", sex: "F" },
  { id: "s12", lrn: "148517962834", firstName: "Erika Nicole", lastName: "Mendoza", sex: "F" },
  { id: "s13", lrn: "259628073945", firstName: "Sophia Mae", lastName: "Rivera", sex: "F" },
  { id: "s14", lrn: "360739184056", firstName: "Trisha Anne", lastName: "Torres", sex: "F" },
  { id: "s15", lrn: "471840295167", firstName: "Maria Angelica", lastName: "Reyes", sex: "F" },
  { id: "s16", lrn: "582951306278", firstName: "Isabella Grace", lastName: "Garcia", sex: "F" },
  { id: "s17", lrn: "693062417389", firstName: "Nicole Andrea", lastName: "Dela Cruz", sex: "F" },
  { id: "s18", lrn: "704173528490", firstName: "Camille Rose", lastName: "Navarro", sex: "F" },
  { id: "s19", lrn: "815284639501", firstName: "Julia Marie", lastName: "Fernandez", sex: "F" },
  { id: "s20", lrn: "926395740612", firstName: "Gabrielle Anne", lastName: "Villanueva", sex: "F" },
];

const createGradeState = (students) => {
  const initialState = {};
  students.forEach((student) => {
    initialState[student.id] = {
      writtenWorks: {},
      performanceTasks: {},
      quarterlyAssessment: "",
      initialGrade: "",
      quarterlyGrade: "",
    };
  });
  return initialState;
};

export default function DeptClassRecord({ activeClass, onBack }) {
  const navigate = useNavigate();
  const currentUser = useMemo(() => getStoredUser(), []);

  // Department name
  const departmentName =
    currentUser?.department_name ||
    currentUser?.department ||
    "English";

  // Filter States
  const [filterOptions, setFilterOptions] = useState({
    schoolYears: ["SY 2025-2026", "SY 2026-2027"],
    gradeLevels: ["All", "Grade 7", "Grade 8", "Grade 9", "Grade 10"],
    sections: ["All", "Gemelina", "Mahogany", "Narra", "Tanguile"],
    teachers: ["All", "Mr. Santos", "Ms. Garcia", "Mr. Ramirez", "Ms. Reyes"],
  });

  const [selectedSY, setSelectedSY] = useState("SY 2025-2026");
  const [selectedSection, setSelectedSection] = useState(
    activeClass?.sectionName || "All"
  );
  const [selectedGradeLevel, setSelectedGradeLevel] = useState("All");
  const [selectedTeacher, setSelectedTeacher] = useState("All");

  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState(null);

  // Active Term
  const [activeTerm, setActiveTerm] = useState("T1");

  // Print Modal & Missing Alert Modal states
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isMissingAlertOpen, setIsMissingAlertOpen] = useState(false);
  const [missingAlerts, setMissingAlerts] = useState([]);
  const [reminderStatus, setReminderStatus] = useState({});

  // Dynamic columns
  const [writtenWorkColumns, setWrittenWorkColumns] = useState([
    { id: "ww1", label: "1" },
    { id: "ww2", label: "2" },
    { id: "ww3", label: "3" },
    { id: "ww4", label: "4" },
    { id: "ww5", label: "5" },
  ]);

  const [performanceTaskColumns, setPerformanceTaskColumns] = useState([
    { id: "pt1", label: "1" },
    { id: "pt2", label: "2" },
    { id: "pt3", label: "3" },
    { id: "pt4", label: "4" },
    { id: "pt5", label: "5" },
  ]);

  // Grades state
  const [grades, setGrades] = useState(() => createGradeState(MOCK_STUDENTS));

  // Load filter options on mount
  useEffect(() => {
    getDeptFilterOptions(currentUser?.department_id).then(setFilterOptions);
    getDeptMissingGradesAlerts(currentUser?.department_id, activeTerm).then((res) => {
      setMissingAlerts(res?.alerts || []);
    });
  }, [currentUser, activeTerm]);

  // Students by sex
  const maleStudents = useMemo(
    () => MOCK_STUDENTS.filter((student) => student.sex === "M"),
    []
  );

  const femaleStudents = useMemo(
    () => MOCK_STUDENTS.filter((student) => student.sex === "F"),
    []
  );

  const handleAddWrittenWork = () => {
    setWrittenWorkColumns((prev) => [
      ...prev,
      { id: `ww${prev.length + 1}`, label: String(prev.length + 1) },
    ]);
  };

  const handleAddPerformanceTask = () => {
    setPerformanceTaskColumns((prev) => [
      ...prev,
      { id: `pt${prev.length + 1}`, label: String(prev.length + 1) },
    ]);
  };

  const handleGradeChange = (studentId, category, columnId, value) => {
    setGrades((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [category]: {
          ...prev[studentId][category],
          [columnId]: value,
        },
      },
    }));
  };

  const handleSingleGradeChange = (studentId, field, value) => {
    setGrades((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
      },
    }));
  };

  const handleSendReminder = async (item) => {
    const key = `${item.teacherId || item.teacher}-${item.sectionName}`;
    const res = await sendTeacherGradeReminder({
      teacherId: item.teacherId,
      sectionName: item.sectionName,
      subjectName: departmentName,
      term: activeTerm,
    });
    setReminderStatus((prev) => ({ ...prev, [key]: "Sent" }));
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigate("/department-head/dashboard");
  };

  // Section resolution: If "All", check if we show empty prompt
  const hasSectionSelected = selectedSection && selectedSection !== "All";
  const isAvailable = activeTerm === "T1";
  const displaySection = hasSectionSelected ? selectedSection : "Gemelina";

  return (
    <div className="class-record-page dept-class-record-page">
      {/* 1. Department Head Header Banner */}
      <header className="dept-header-banner">
        <div className="dept-header-left">
          <h1 className="dept-header-title">
            Department Head - {departmentName}
          </h1>
        </div>
        <div className="dept-header-right">
          <button
            type="button"
            className="dept-bell-btn"
            title="Notifications"
            onClick={() => setIsMissingAlertOpen(true)}
          >
            <Bell size={18} />
            <span className="dept-bell-badge">7</span>
          </button>
        </div>
      </header>

      {/* 2. Top Filter Bar Card */}
      <section className="dept-filters-card">
        <div className="dept-filters-left">
          <span className="dept-filters-label">Filters:</span>

          {/* School Year Dropdown */}
          <div className="dept-filter-dropdown-wrap">
            <button
              type="button"
              className="dept-filter-dropdown-btn"
              onClick={() =>
                setOpenDropdown(openDropdown === "sy" ? null : "sy")
              }
            >
              <span>{selectedSY}</span>
              <ChevronDown size={14} />
            </button>
            {openDropdown === "sy" && (
              <div className="dept-filter-menu">
                {filterOptions.schoolYears.map((sy) => (
                  <button
                    key={sy}
                    type="button"
                    className={`dept-filter-item ${selectedSY === sy ? "active" : ""}`}
                    onClick={() => {
                      setSelectedSY(sy);
                      setOpenDropdown(null);
                    }}
                  >
                    {sy}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Section Dropdown */}
          <div className="dept-filter-dropdown-wrap">
            <button
              type="button"
              className="dept-filter-dropdown-btn"
              onClick={() =>
                setOpenDropdown(openDropdown === "sec" ? null : "sec")
              }
            >
              <span>
                {selectedSection === "All" ? "Section" : selectedSection}
              </span>
              <ChevronDown size={14} />
            </button>
            {openDropdown === "sec" && (
              <div className="dept-filter-menu">
                {filterOptions.sections.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    className={`dept-filter-item ${selectedSection === sec ? "active" : ""}`}
                    onClick={() => {
                      setSelectedSection(sec);
                      setOpenDropdown(null);
                    }}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grade Level Dropdown */}
          <div className="dept-filter-dropdown-wrap">
            <button
              type="button"
              className="dept-filter-dropdown-btn"
              onClick={() =>
                setOpenDropdown(openDropdown === "gl" ? null : "gl")
              }
            >
              <span>
                {selectedGradeLevel === "All"
                  ? "Grade Level"
                  : selectedGradeLevel}
              </span>
              <ChevronDown size={14} />
            </button>
            {openDropdown === "gl" && (
              <div className="dept-filter-menu">
                {filterOptions.gradeLevels.map((gl) => (
                  <button
                    key={gl}
                    type="button"
                    className={`dept-filter-item ${selectedGradeLevel === gl ? "active" : ""}`}
                    onClick={() => {
                      setSelectedGradeLevel(gl);
                      setOpenDropdown(null);
                    }}
                  >
                    {gl}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Teacher Dropdown */}
          <div className="dept-filter-dropdown-wrap">
            <button
              type="button"
              className="dept-filter-dropdown-btn"
              onClick={() =>
                setOpenDropdown(openDropdown === "tch" ? null : "tch")
              }
            >
              <span>
                {selectedTeacher === "All" ? "Teacher" : selectedTeacher}
              </span>
              <ChevronDown size={14} />
            </button>
            {openDropdown === "tch" && (
              <div className="dept-filter-menu">
                {filterOptions.teachers.map((tch) => (
                  <button
                    key={tch}
                    type="button"
                    className={`dept-filter-item ${selectedTeacher === tch ? "active" : ""}`}
                    onClick={() => {
                      setSelectedTeacher(tch);
                      setOpenDropdown(null);
                    }}
                  >
                    {tch}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Grade Missing Alert Button */}
        <div className="dept-filters-right">
          <button
            type="button"
            className="dept-missing-alert-btn"
            onClick={() => setIsMissingAlertOpen(true)}
          >
            <Bell size={15} className="dept-missing-bell-icon" />
            <span>Grade Missing Alert</span>
          </button>
        </div>
      </section>

      {/* 3. Class Record Content Area */}
      {!hasSectionSelected ? (
        <div className="dept-empty-record-card">
          <Inbox size={48} className="dept-empty-record-icon" />
          <h3>No Class Record Selected</h3>
          <p>
            Please select a section from the filter above to view its electronic
            class record.
          </p>
        </div>
      ) : (
        <>
          <div className="class-record-subheader">
            <div>
              <h2>Section: {displaySection}</h2>
              <p>Review and manage student grades per term</p>
            </div>

            <div className="class-record-actions">
              {/* PRINT / PREVIEW */}
              <button
                type="button"
                className="class-record-action-btn download-btn"
                onClick={() => setIsPrintModalOpen(true)}
              >
                <Printer size={15} style={{ marginRight: "6px" }} />
                Download / Print
              </button>

              {/* TERMS */}
              <div className="term-buttons">
                <button
                  type="button"
                  className={activeTerm === "T1" ? "term-btn active" : "term-btn"}
                  onClick={() => setActiveTerm("T1")}
                >
                  T1
                </button>
                <button
                  type="button"
                  className={activeTerm === "T2" ? "term-btn active" : "term-btn"}
                  onClick={() => setActiveTerm("T2")}
                >
                  T2
                </button>
                <button
                  type="button"
                  className={activeTerm === "T3" ? "term-btn active" : "term-btn"}
                  onClick={() => setActiveTerm("T3")}
                >
                  T3
                </button>
              </div>
            </div>
          </div>

          {/* UNAVAILABLE STATE */}
          {!isAvailable ? (
            <div className="unavailable-state">
              <img
                src={unavailableIconUrl}
                alt="Unavailable"
                className="unavailable-icon"
              />
              <h3>This grading term is currently unavailable.</h3>
              <p>
                Access will be enabled once the official grading period begins.
              </p>
            </div>
          ) : (
            /* CLASS RECORD TABLE */
            <div className="class-record-content">
              <div className="student-count">
                Total Students: {MOCK_STUDENTS.length}
              </div>

              <div className="class-record-table-wrapper">
                <table className="class-record-table">
                  <thead>
                    <tr>
                      <th rowSpan="2" className="number-header">
                        No.
                      </th>
                      <th rowSpan="2" className="lrn-header">
                        LRN
                      </th>
                      <th rowSpan="2" className="name-header">
                        Learners' Name
                      </th>

                      {/* WRITTEN WORKS */}
                      <th
                        colSpan={writtenWorkColumns.length + 3}
                        className="category-header"
                      >
                        <div className="category-title">
                          <span>Written Works (30%)</span>
                          <button
                            type="button"
                            className="add-column-btn"
                            onClick={handleAddWrittenWork}
                          >
                            + Add
                          </button>
                        </div>
                      </th>

                      {/* PERFORMANCE TASKS */}
                      <th
                        colSpan={performanceTaskColumns.length + 3}
                        className="category-header"
                      >
                        <div className="category-title">
                          <span>Performance Tasks (50%)</span>
                          <button
                            type="button"
                            className="add-column-btn"
                            onClick={handleAddPerformanceTask}
                          >
                            + Add
                          </button>
                        </div>
                      </th>

                      {/* QUARTERLY ASSESSMENT */}
                      <th colSpan="3" className="category-header">
                        Quarterly Assessment (20%)
                      </th>

                      {/* FINAL GRADES */}
                      <th rowSpan="2" className="grade-header">
                        Initial
                        <br />
                        Grade
                      </th>
                      <th rowSpan="2" className="grade-header">
                        Quarterly
                        <br />
                        Grade
                      </th>
                    </tr>

                    {/* SUB HEADER */}
                    <tr>
                      {/* WRITTEN WORKS */}
                      {writtenWorkColumns.map((column) => (
                        <th key={column.id} className="sub-header">
                          {column.label}
                        </th>
                      ))}
                      <th className="sub-header total-header">Total</th>
                      <th className="sub-header">PS</th>
                      <th className="sub-header">WS</th>

                      {/* PERFORMANCE TASKS */}
                      {performanceTaskColumns.map((column) => (
                        <th key={column.id} className="sub-header">
                          {column.label}
                        </th>
                      ))}
                      <th className="sub-header total-header">Total</th>
                      <th className="sub-header">PS</th>
                      <th className="sub-header">WS</th>

                      {/* QUARTERLY ASSESSMENT */}
                      <th className="sub-header">1</th>
                      <th className="sub-header">PS</th>
                      <th className="sub-header">WS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {/* MALE STUDENTS */}
                    <tr className="gender-divider-row">
                      <td
                        colSpan={
                          3 +
                          writtenWorkColumns.length +
                          3 +
                          performanceTaskColumns.length +
                          3 +
                          3 +
                          2
                        }
                      >
                        MALE
                      </td>
                    </tr>
                    {maleStudents.map((student, index) => (
                      <StudentRow
                        key={student.id}
                        student={student}
                        number={index + 1}
                        grades={grades}
                        writtenWorkColumns={writtenWorkColumns}
                        performanceTaskColumns={performanceTaskColumns}
                        handleGradeChange={handleGradeChange}
                        handleSingleGradeChange={handleSingleGradeChange}
                      />
                    ))}

                    {/* FEMALE STUDENTS */}
                    <tr className="gender-divider-row">
                      <td
                        colSpan={
                          3 +
                          writtenWorkColumns.length +
                          3 +
                          performanceTaskColumns.length +
                          3 +
                          3 +
                          2
                        }
                      >
                        FEMALE
                      </td>
                    </tr>
                    {femaleStudents.map((student, index) => (
                      <StudentRow
                        key={student.id}
                        student={student}
                        number={maleStudents.length + index + 1}
                        grades={grades}
                        writtenWorkColumns={writtenWorkColumns}
                        performanceTaskColumns={performanceTaskColumns}
                        handleGradeChange={handleGradeChange}
                        handleSingleGradeChange={handleSingleGradeChange}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* 4. Grade Missing Alert Modal */}
      {isMissingAlertOpen && (
        <div className="dept-missing-modal-overlay">
          <div className="dept-missing-modal-box">
            <div className="dept-missing-modal-header">
              <div className="dept-missing-modal-title">
                <AlertTriangle size={20} className="dept-alert-icon" />
                <h3>Grade Missing Alert - {departmentName}</h3>
              </div>
              <button
                type="button"
                className="dept-modal-close-btn"
                onClick={() => setIsMissingAlertOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="dept-missing-modal-body">
              {missingAlerts.length > 0 ? (
                <div className="dept-missing-list">
                  {missingAlerts.map((item, idx) => {
                    const key = `${item.teacherId || item.teacher}-${item.sectionName}`;
                    const isSent = reminderStatus[key] === "Sent";
                    return (
                      <div key={idx} className="dept-missing-item">
                        <div className="dept-missing-item-info">
                          <span className="dept-missing-teacher">
                            {item.teacher}
                          </span>
                          <span className="dept-missing-details">
                            {item.sectionName} — {item.missingReason || "Pending Submission"}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`dept-remind-btn ${isSent ? "sent" : ""}`}
                          disabled={isSent}
                          onClick={() => handleSendReminder(item)}
                        >
                          <Send size={13} />
                          {isSent ? "Reminder Sent" : "Send Reminder"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="dept-missing-empty">
                  <Inbox size={36} />
                  <span>No missing grade submissions found for {activeTerm}.</span>
                </div>
              )}
            </div>

            <div className="dept-missing-modal-footer">
              <button
                type="button"
                className="dept-modal-btn"
                onClick={() => setIsMissingAlertOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. DepEd Class Record Print Modal */}
      <DepEdClassRecordPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        metadata={{
          region: "Region X",
          division: "Gingoog City",
          schoolName: "Gingoog City Comprehensive National High School",
          schoolId: "304018",
          schoolYear: selectedSY.replace("SY ", ""),
          quarterLabel: activeTerm === "T1" ? "1st Quarter" : activeTerm === "T2" ? "2nd Quarter" : "3rd Quarter",
          gradeAndSection: `Grade 10 - ${displaySection}`,
          teacherName: selectedTeacher !== "All" ? selectedTeacher : "Subject Teacher",
          subjectName: departmentName,
        }}
        writtenWorkColumns={writtenWorkColumns}
        performanceTaskColumns={performanceTaskColumns}
        students={MOCK_STUDENTS}
        grades={grades}
      />
    </div>
  );
}

function StudentRow({
  student,
  number,
  grades,
  writtenWorkColumns,
  performanceTaskColumns,
  handleGradeChange,
  handleSingleGradeChange,
}) {
  const studentGrades = grades[student.id] || {};

  return (
    <tr className="student-row">
      <td className="number-cell">{number}</td>
      <td className="lrn-cell">{student.lrn}</td>
      <td className="name-cell">
        {student.firstName} {student.lastName}
      </td>

      {/* WRITTEN WORKS */}
      {writtenWorkColumns.map((column) => (
        <td key={column.id} className="grade-input-cell">
          <input
            type="number"
            min="0"
            max="100"
            value={studentGrades.writtenWorks?.[column.id] || ""}
            onChange={(e) =>
              handleGradeChange(
                student.id,
                "writtenWorks",
                column.id,
                e.target.value
              )
            }
          />
        </td>
      ))}
      <td className="computed-cell">-</td>
      <td className="computed-cell">-</td>
      <td className="computed-cell">-</td>

      {/* PERFORMANCE TASKS */}
      {performanceTaskColumns.map((column) => (
        <td key={column.id} className="grade-input-cell">
          <input
            type="number"
            min="0"
            max="100"
            value={studentGrades.performanceTasks?.[column.id] || ""}
            onChange={(e) =>
              handleGradeChange(
                student.id,
                "performanceTasks",
                column.id,
                e.target.value
              )
            }
          />
        </td>
      ))}
      <td className="computed-cell">-</td>
      <td className="computed-cell">-</td>
      <td className="computed-cell">-</td>

      {/* QUARTERLY ASSESSMENT */}
      <td className="grade-input-cell">
        <input
          type="number"
          min="0"
          max="100"
          value={studentGrades.quarterlyAssessment || ""}
          onChange={(e) =>
            handleSingleGradeChange(
              student.id,
              "quarterlyAssessment",
              e.target.value
            )
          }
        />
      </td>
      <td className="computed-cell">-</td>
      <td className="computed-cell">-</td>

      {/* INITIAL GRADE */}
      <td className="grade-input-cell final-grade-cell">
        <input
          type="number"
          min="0"
          max="100"
          value={studentGrades.initialGrade || ""}
          onChange={(e) =>
            handleSingleGradeChange(student.id, "initialGrade", e.target.value)
          }
        />
      </td>

      {/* QUARTERLY GRADE */}
      <td className="grade-input-cell final-grade-cell">
        <input
          type="number"
          min="0"
          max="100"
          value={studentGrades.quarterlyGrade || ""}
          onChange={(e) =>
            handleSingleGradeChange(student.id, "quarterlyGrade", e.target.value)
          }
        />
      </td>
    </tr>
  );
}
