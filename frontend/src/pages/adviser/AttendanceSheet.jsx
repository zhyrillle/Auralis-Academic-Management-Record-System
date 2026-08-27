import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Calendar, CheckCircle, AlertTriangle, Info, X, Save } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import "../../styles/attendanceSheet.css";
import backIconUrl from "../../assets/backButton.svg";
import { getStoredUser } from "../../utils/auth";

const BASE_URL = "http://localhost:5000/api";

const DAY_LABELS = ["SU", "M", "T", "W", "TH", "F", "SA"];

function getTodayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Generate all weekdays (Monday through Friday) for the month of dateStr
function getMonthSchoolDays(dateStr) {
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const schoolDays = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      const mFormatted = String(month + 1).padStart(2, "0");
      const dFormatted = String(day).padStart(2, "0");
      schoolDays.push({
        dateStr: `${year}-${mFormatted}-${dFormatted}`,
        dayNumber: day,
        dayOfWeek: dow,
        dayLabel: DAY_LABELS[dow],
        fullDate: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      });
    }
  }

  // Group into calendar weeks (starting fresh on Mondays or 1st school day)
  const weeks = [];
  let currentWeek = [];
  let weekNum = 1;

  schoolDays.forEach(sd => {
    if (sd.dayOfWeek === 1 && currentWeek.length > 0) {
      weeks.push({ weekNum, days: currentWeek });
      weekNum++;
      currentWeek = [];
    }
    currentWeek.push(sd);
  });
  if (currentWeek.length > 0) {
    weeks.push({ weekNum, days: currentWeek });
  }

  return { schoolDays, weeks };
}

export default function AttendanceSheet({ onBack }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = getStoredUser();

  const handleBack = onBack || (() => navigate("/adviser/sections", {
    state: {
      currentView: "class-record",
      activeSelectedClass: location.state?.activeClass,
    },
  }));

  const TODAY = getTodayISO();
  const [selectedDate, setSelectedDate] = useState(TODAY);

  // Data states
  const [adviserAssignment, setAdviserAssignment] = useState(null);
  const [students, setStudents] = useState([]); // { student_id, student_section_id, first_name, last_name, sex }
  const [sheetsByDate, setSheetsByDate] = useState({}); // { "YYYY-MM-DD": attendance_sheet_id }
  const [attendanceMap, setAttendanceMap] = useState({}); // { "student_section_id-dateStr": status }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState([]);

  const triggerToast = useCallback((message, type = "error") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Load all data on mount ──
  useEffect(() => {
    const userId = currentUser?.user_id || currentUser?.id;
    if (!userId && !location.state?.activeClass?.section_id) return;
    loadAll();
  }, [currentUser?.user_id, currentUser?.id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const userId = currentUser?.user_id || currentUser?.id;
      let assignment = null;

      // 1. Get adviser assignment by user ID
      if (userId) {
        const assignRes = await fetch(`${BASE_URL}/section-adviser-assignments/user/${userId}`);
        const assignments = assignRes.ok ? await assignRes.json() : [];
        if (assignments.length > 0) {
          assignment = assignments[0];
        }
      }

      // Fallback: If not found by user, check if section is passed in navigation state
      if (!assignment && location.state?.activeClass?.section_id) {
        const secId = location.state.activeClass.section_id;
        const allAssignRes = await fetch(`${BASE_URL}/section-adviser-assignments`);
        const allAssignments = allAssignRes.ok ? await allAssignRes.json() : [];
        assignment = allAssignments.find(a => Number(a.section_id) === Number(secId));
      }

      // Fallback: Default to first available assignment if in dev/demo
      if (!assignment) {
        const allAssignRes = await fetch(`${BASE_URL}/section-adviser-assignments`);
        const allAssignments = allAssignRes.ok ? await allAssignRes.json() : [];
        if (allAssignments.length > 0) {
          assignment = allAssignments[0];
        }
      }

      if (!assignment) {
        triggerToast("No adviser assignment found for your section.", "error");
        setLoading(false);
        return;
      }
      setAdviserAssignment(assignment);

      const sectionId = assignment.section_id;
      const adviserAssignmentId = assignment.adviser_assignment_id;

      // 2. Get enrolled students in the section
      const ssRes = await fetch(`${BASE_URL}/student-sections`);
      const allStudentSections = ssRes.ok ? await ssRes.json() : [];
      const sectionStudentSections = allStudentSections.filter(ss => Number(ss.section_id) === Number(sectionId));

      // 3. Get student details
      const stuRes = await fetch(`${BASE_URL}/students`);
      const allStudents = stuRes.ok ? await stuRes.json() : [];

      const enrichedStudents = sectionStudentSections.map(ss => {
        const stu = allStudents.find(s => Number(s.student_id) === Number(ss.student_id));
        return {
          student_section_id: ss.student_section_id,
          student_id: ss.student_id,
          first_name: stu?.first_name || "Unknown",
          last_name: stu?.last_name || "",
          sex: stu?.sex || "M",
        };
      }).sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));

      setStudents(enrichedStudents);

      // 4. Get all attendance sheets for this adviser assignment
      const sheetsRes = await fetch(`${BASE_URL}/attendance-sheets/adviser/${adviserAssignmentId}`);
      const sheets = sheetsRes.ok ? await sheetsRes.json() : [];

      // Build sheetsByDate map
      const byDate = {};
      sheets.forEach(sh => {
        const d = sh.attendance_date?.split("T")[0] || sh.attendance_date;
        byDate[d] = sh.attendance_sheet_id;
      });
      setSheetsByDate(byDate);

      // 5. Load attendance records for each sheet
      const attMap = {};
      await Promise.all(
        sheets.map(async sh => {
          const dateStr = sh.attendance_date?.split("T")[0] || sh.attendance_date;
          const attRes = await fetch(`${BASE_URL}/attendance/sheet/${sh.attendance_sheet_id}`);
          const attRows = attRes.ok ? await attRes.json() : [];
          attRows.forEach(row => {
            const key = `${row.student_section_id}-${dateStr}`;
            attMap[key] = row.status;
          });
        })
      );
      setAttendanceMap(attMap);

    } catch (err) {
      console.error("Error loading attendance data:", err);
      triggerToast("Failed to load attendance data.", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Compute all school days (Monday to Friday) and week groups for selected month ──
  const { schoolDays, weeks } = useMemo(() => {
    return getMonthSchoolDays(selectedDate || TODAY);
  }, [selectedDate, TODAY]);

  const activeColIndex = useMemo(() => {
    return schoolDays.findIndex(sd => sd.dateStr === selectedDate);
  }, [schoolDays, selectedDate]);

  const isEditableDate = selectedDate === TODAY;

  const currentMonthName = useMemo(() => {
    const parts = (selectedDate || TODAY).split("-");
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long" });
  }, [selectedDate, TODAY]);

  // ── Handle cell click: toggle P → L → A → P ──
  const handleCellClick = async (studentSectionId, dateStr, colIdx) => {
    if (colIdx !== activeColIndex) {
      triggerToast("You can only edit attendance for the selected date on the calendar.");
      return;
    }
    if (!isEditableDate) {
      triggerToast("Past/Future dates are locked. Attendance can only be modified for today.");
      return;
    }
    if (!adviserAssignment?.adviser_assignment_id) {
      triggerToast("No adviser assignment configured for this section.");
      return;
    }

    const key = `${studentSectionId}-${dateStr}`;
    const oldStatus = attendanceMap[key] || "P";
    let newStatus = "P";
    if (oldStatus === "P") newStatus = "L";
    else if (oldStatus === "L") newStatus = "A";

    // Optimistic update
    setAttendanceMap(prev => ({ ...prev, [key]: newStatus }));

    // Save to backend
    try {
      setSaving(true);
      let sheetId = sheetsByDate[TODAY];
      if (!sheetId) {
        const sheetRes = await fetch(`${BASE_URL}/attendance-sheets/find-or-create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adviser_assignment_id: adviserAssignment.adviser_assignment_id,
            attendance_scope: "SECTION",
            attendance_date: TODAY,
          }),
        });
        if (!sheetRes.ok) {
          const errData = await sheetRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to create attendance sheet");
        }
        const sheetData = await sheetRes.json();
        sheetId = sheetData.attendance_sheet_id;
        setSheetsByDate(prev => ({ ...prev, [TODAY]: sheetId }));
      }

      const saveRes = await fetch(`${BASE_URL}/attendance/bulk-save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: [{
            attendance_sheet_id: sheetId,
            student_section_id: studentSectionId,
            status: newStatus,
            remarks: null,
          }],
        }),
      });

      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save attendance");
      }
    } catch (err) {
      console.error("Error saving attendance:", err);
      triggerToast(`Failed to save attendance: ${err.message}`, "error");
      // Rollback
      setAttendanceMap(prev => ({ ...prev, [key]: oldStatus }));
    } finally {
      setSaving(false);
    }
  };

  // ── Save all today's attendance at once ──
  const handleSaveAll = async () => {
    if (!isEditableDate || !adviserAssignment) return;
    try {
      setSaving(true);
      let sheetId = sheetsByDate[TODAY];
      if (!sheetId) {
        const sheetRes = await fetch(`${BASE_URL}/attendance-sheets/find-or-create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adviser_assignment_id: adviserAssignment.adviser_assignment_id,
            attendance_scope: "SECTION",
            attendance_date: TODAY,
          }),
        });
        if (!sheetRes.ok) {
          const errData = await sheetRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to create attendance sheet");
        }
        const sheetData = await sheetRes.json();
        sheetId = sheetData.attendance_sheet_id;
        setSheetsByDate(prev => ({ ...prev, [TODAY]: sheetId }));
      }

      const records = students.map(stu => ({
        attendance_sheet_id: sheetId,
        student_section_id: stu.student_section_id,
        status: attendanceMap[`${stu.student_section_id}-${TODAY}`] || "P",
        remarks: null,
      }));

      const saveRes = await fetch(`${BASE_URL}/attendance/bulk-save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });

      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save attendance");
      }

      triggerToast("Attendance saved successfully!", "success");
    } catch (err) {
      console.error("Error saving all attendance:", err);
      triggerToast(`Failed to save attendance: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Per-student stats for the current displayed month ──
  const studentStats = useMemo(() => {
    const stats = {};
    students.forEach(stu => {
      let absents = 0;
      let tardy = 0;
      schoolDays.forEach(sd => {
        const status = attendanceMap[`${stu.student_section_id}-${sd.dateStr}`] || "P";
        if (status === "A") absents++;
        else if (status === "L") tardy++;
      });
      let remark = "";
      if (absents === 0 && tardy === 0) remark = "Perfect attendance";
      else if (absents > 1 || tardy > 4) remark = "Needs Improvement";
      stats[stu.student_section_id] = { absents, tardy, remark };
    });
    return stats;
  }, [students, attendanceMap, schoolDays]);

  // ── Gender summary ──
  const malesCount = useMemo(() => students.filter(s => s.sex === "M").length, [students]);
  const femalesCount = useMemo(() => students.filter(s => s.sex === "F").length, [students]);

  const sectionName = adviserAssignment?.section_name || "–";

  if (loading) {
    return (
      <div className="attendance-sheet-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <p style={{ color: "#64748b", fontSize: "15px" }}>Loading attendance data…</p>
      </div>
    );
  }

  return (
    <div className="attendance-sheet-container">
      {/* Toast Notifications */}
      <div style={{ position: "fixed", top: "24px", right: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "10px" }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              backgroundColor: t.type === "success" ? "#dcfce7" : "#fee2e2",
              border: `1px solid ${t.type === "success" ? "#bbf7d0" : "#fecaca"}`,
              borderRadius: "10px",
              padding: "12px 18px",
              color: t.type === "success" ? "#166534" : "#991b1b",
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              fontWeight: "600",
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            <AlertTriangle size={16} />
            <span>{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", marginLeft: "8px", display: "flex", padding: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Header Area */}
      <div className="att-header-bar">
        <div className="att-title-area">
          <button className="back-btn" onClick={handleBack} title="Back to Class Record">
            <img src={backIconUrl} alt="Back" width={17} height={17} />
          </button>
          <h1 className="att-title">Attendance Sheet</h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Save All button */}
          {isEditableDate && students.length > 0 && (
            <button
              onClick={handleSaveAll}
              disabled={saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                background: saving ? "#94a3b8" : "#112d61",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: saving ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
            >
              <Save size={14} />
              {saving ? "Saving…" : "Save All"}
            </button>
          )}

          {/* Date Selector */}
          <div className="att-calendar-wrapper">
            <div className="att-calendar-icon-btn">
              <Calendar size={18} />
            </div>
            <input
              type="date"
              className="att-date-input"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Subheader and mode indicator */}
      <div className="att-mode-row">
        <span className="att-section-label">Section: {sectionName}</span>
        {isEditableDate ? (
          <span className="att-mode-badge editable">
            <CheckCircle size={14} />
            <span>Editable Mode (Today's Date Selected)</span>
          </span>
        ) : (
          <span className="att-mode-badge readonly">
            <Info size={14} />
            <span>Read-Only Mode (Past/Future Date)</span>
          </span>
        )}
      </div>

      {/* No students enrolled message */}
      {students.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", color: "#64748b" }}>
          <p style={{ fontSize: "15px" }}>No students enrolled in this section yet.</p>
        </div>
      ) : (
        <>
          {/* Roster Spreadsheet Grid Table */}
          <div className="att-table-wrapper">
            <table className="att-table">
              <thead>
                <tr>
                  <th className="name-header" rowSpan={2}>#</th>
                  <th className="name-header" rowSpan={2}>Student Name</th>
                  {weeks.map(week => (
                    <th
                      key={`week-${week.weekNum}`}
                      colSpan={week.days.length}
                    >
                      Week {week.weekNum}
                    </th>
                  ))}
                  <th rowSpan={2} style={{ width: "80px" }}>Total Absent</th>
                  <th rowSpan={2} style={{ width: "80px" }}>Total Tardy</th>
                  <th rowSpan={2} style={{ width: "150px" }}>Remarks</th>
                </tr>
                <tr>
                  {schoolDays.map((sd, colIdx) => (
                    <th
                      key={sd.dateStr}
                      className={colIdx === activeColIndex ? "active-date-header" : ""}
                      title={sd.fullDate}
                      style={{ width: "30px", fontSize: "11px" }}
                    >
                      {sd.dayLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((stu, rowIdx) => {
                  const stats = studentStats[stu.student_section_id] || { absents: 0, tardy: 0, remark: "" };
                  return (
                    <tr key={stu.student_section_id}>
                      <td className="student-name-cell" style={{ width: "36px", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                        {rowIdx + 1}
                      </td>
                      <td className="student-name-cell">
                        {stu.last_name}, {stu.first_name}
                      </td>
                      {schoolDays.map((sd, colIdx) => {
                        const key = `${stu.student_section_id}-${sd.dateStr}`;
                        const status = attendanceMap[key] || "P";
                        const isActive = colIdx === activeColIndex;
                        return (
                          <td
                            key={sd.dateStr}
                            className={`${isActive ? "active-date-cell" : ""} ${isActive && isEditableDate ? "editable-cell" : ""}`}
                            onClick={() => handleCellClick(stu.student_section_id, sd.dateStr, colIdx)}
                            title={sd.fullDate}
                            style={{ cursor: isActive && isEditableDate ? "pointer" : "default" }}
                          >
                            <span className={`att-status-badge ${status.toLowerCase()}`}>
                              {status}
                            </span>
                          </td>
                        );
                      })}
                      <td className="summary-stat-cell">{stats.absents}</td>
                      <td className="summary-stat-cell">{stats.tardy}</td>
                      <td className="remarks-cell">{stats.remark}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Summary & Legend */}
          <div className="att-bottom-grid">
            {/* Attendance Summary */}
            <div className="att-summary-card">
              <h3 className="att-card-header">Attendance Summary</h3>
              <p style={{ color: "#64748b", margin: "0 0 12px 0", fontSize: "14px", fontWeight: 500 }}>
                Total Students: {students.length}
              </p>
              <table className="att-summary-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "center" }}>Month</th>
                    <th>No. of Days of Classes</th>
                    <th>M</th>
                    <th>F</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="row-month">{currentMonthName}</td>
                    <td>{schoolDays.length}</td>
                    <td>{malesCount}</td>
                    <td>{femalesCount}</td>
                    <td>{students.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="att-legend-card">
              <h3 className="att-card-header">Attendance Indicator</h3>
              <div className="att-legend-list">
                <div className="att-legend-item">
                  <span className="legend-badge-box p">P</span>
                  <span className="att-legend-text">Present</span>
                </div>
                <div className="att-legend-item">
                  <span className="legend-badge-box l">L</span>
                  <span className="att-legend-text">Late / Tardy</span>
                </div>
                <div className="att-legend-item">
                  <span className="legend-badge-box a">A</span>
                  <span className="att-legend-text">Absent</span>
                </div>
              </div>
              <p style={{ fontSize: "12px", color: "#64748b", marginTop: "12px" }}>
                Click a cell on today's date to toggle status.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
