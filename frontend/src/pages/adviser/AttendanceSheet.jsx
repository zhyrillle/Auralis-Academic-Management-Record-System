import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Calendar, CheckCircle, AlertTriangle, Info, X, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import "../../styles/attendanceSheet.css";
import backIconUrl from "../../assets/backButton.svg";
import { getStoredUser } from "../../utils/auth";

const BASE_URL = "http://localhost:5000/api";

const DAY_LABELS = ["SU", "M", "T", "W", "Th", "F", "SA"];
const WEEK_HEADER_COLORS = [
  { bg: "#ddd6fe", border: "#c4b5fd", text: "#4c1d95" }, // Week 1: Lilac/Purple
  { bg: "#fed7aa", border: "#fdba74", text: "#7c2d12" }, // Week 2: Peach/Orange
  { bg: "#a5f3fc", border: "#67e8f9", text: "#164e63" }, // Week 3: Cyan/Aqua
  { bg: "#fbcfe8", border: "#f472b6", text: "#831843" }, // Week 4: Pink
  { bg: "#bbf7d0", border: "#86efac", text: "#14532d" }, // Week 5: Mint Green
];

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

export default function AttendanceSheet({ activeClass: propActiveClass, onBack }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = getStoredUser();

  const activeClass = propActiveClass || location.state?.activeClass || location.state?.activeSelectedClass;
  const targetSectionId =
    activeClass?.section_id ||
    activeClass?.sectionId ||
    location.state?.section_id ||
    (typeof activeClass?.id === "number" ? activeClass.id : null) ||
    (typeof activeClass?.id === "string" && !isNaN(Number(activeClass.id)) ? Number(activeClass.id) : null) ||
    (typeof activeClass?.id === "string" && activeClass.id.startsWith("sec-") ? Number(activeClass.id.replace("sec-", "")) : null) ||
    (typeof activeClass?.id === "string" && activeClass.id.startsWith("class-") ? Number(activeClass.id.replace("class-", "")) : null);

  const handleBack = onBack || (() => navigate("/adviser/sections", {
    state: {
      currentView: "class-record",
      activeSelectedClass: activeClass,
    },
  }));

  const TODAY = getTodayISO();
  const [selectedDate, setSelectedDate] = useState(TODAY);

  // Data states
  const [adviserAssignment, setAdviserAssignment] = useState(null);
  const [students, setStudents] = useState([]); // { student_id, student_section_id, first_name, last_name, middle_name, sex }
  const [sheetsByDate, setSheetsByDate] = useState({}); // { "YYYY-MM-DD": attendance_sheet_id }
  const [attendanceMap, setAttendanceMap] = useState({}); // { "student_section_id-dateStr": status }
  const [remarksMap, setRemarksMap] = useState({}); // { "student_section_id": remarks }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState([]);

  const triggerToast = useCallback((message, type = "error") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Load all data on mount and whenever section changes ──
  useEffect(() => {
    setStudents([]);
    setSheetsByDate({});
    setAttendanceMap({});
    setRemarksMap({});
    setAdviserAssignment(null);
    loadAll();
  }, [targetSectionId, currentUser?.user_id, currentUser?.id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const userId = currentUser?.user_id || currentUser?.id;
      const sectionId = targetSectionId;

      if (!sectionId) {
        triggerToast("No section identified for attendance.", "error");
        setLoading(false);
        return;
      }

      // 1. Get section details & adviser assignment if any
      let sectionName = `Section ${sectionId}`;
      let gradeLevelName = "";
      let assignment = null;

      try {
        const assignRes = await fetch(`${BASE_URL}/section-adviser-assignments/section/${sectionId}`);
        const assignments = assignRes.ok ? await assignRes.json() : [];
        if (Array.isArray(assignments) && assignments.length > 0) {
          assignment = assignments[0];
        } else if (assignments && assignments.adviser_assignment_id) {
          assignment = assignments;
        }
      } catch (e) {
        console.warn("Could not fetch adviser assignment:", e);
      }

      const secRes = await fetch(`${BASE_URL}/sections/${sectionId}`);
      const secData = secRes.ok ? await secRes.json() : null;
      sectionName = secData?.section_name || assignment?.section_name || activeClass?.sectionName || activeClass?.section_name || `Section ${sectionId}`;
      gradeLevelName = secData?.grade_level_name || assignment?.grade_level_name || activeClass?.gradeLevel || activeClass?.grade_level_name || "";

      setAdviserAssignment({
        section_id: Number(sectionId),
        adviser_assignment_id: assignment?.adviser_assignment_id || null,
        section_name: sectionName,
        grade_level_name: gradeLevelName,
      });

      // 2. Get enrolled students for section
      let enrichedStudents = [];
      try {
        const stuRes = await fetch(`${BASE_URL}/sections/${sectionId}/students`);
        if (stuRes.ok) {
          const list = await stuRes.json();
          if (Array.isArray(list) && list.length > 0) {
            enrichedStudents = list.map(s => ({
              student_section_id: s.student_section_id,
              student_id: s.student_id || s.id,
              first_name: s.firstName || s.first_name || "Unknown",
              last_name: s.lastName || s.last_name || "",
              middle_name: s.middleName || s.middle_name || "",
              sex: s.sex || "M",
            }));
          }
        }
      } catch (e) {
        console.warn("Could not fetch /sections/:id/students:", e);
      }

      if (enrichedStudents.length === 0) {
        const ssRes = await fetch(`${BASE_URL}/student-sections`);
        const allStudentSections = ssRes.ok ? await ssRes.json() : [];
        const sectionStudentSections = allStudentSections.filter(ss => Number(ss.section_id) === Number(sectionId));

        const allStudentsRes = await fetch(`${BASE_URL}/students`);
        const allStudents = allStudentsRes.ok ? await allStudentsRes.json() : [];

        enrichedStudents = sectionStudentSections.map(ss => {
          const stu = allStudents.find(s => Number(s.student_id) === Number(ss.student_id));
          return {
            student_section_id: ss.student_section_id,
            student_id: ss.student_id,
            first_name: stu?.first_name || "Unknown",
            last_name: stu?.last_name || "",
            middle_name: stu?.middle_name || "",
            sex: stu?.sex || "M",
          };
        });
      }

      enrichedStudents.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
      setStudents(enrichedStudents);

      // 3. Load all sheets for this section
      const sheetsRes = await fetch(`${BASE_URL}/attendance-sheets/section/${sectionId}`);
      const sheets = sheetsRes.ok ? await sheetsRes.json() : [];
      const byDate = {};
      sheets.forEach(sh => {
        const d = sh.attendance_date?.split("T")[0] || sh.attendance_date;
        byDate[d] = sh.attendance_sheet_id;
      });
      setSheetsByDate(byDate);

      // 4. Load attendance records for this section
      const attRes = await fetch(`${BASE_URL}/attendance/section/${sectionId}`);
      const attRows = attRes.ok ? await attRes.json() : [];
      const attMap = {};
      const remMap = {};
      attRows.forEach(row => {
        const d = row.attendance_date?.split("T")[0] || row.attendance_date;
        const key = `${row.student_section_id}-${d}`;
        attMap[key] = row.status;
        if (row.student_id) {
          attMap[`${row.student_id}-${d}`] = row.status;
        }
        if (row.remarks) {
          remMap[row.student_section_id] = row.remarks;
          if (row.student_id) remMap[row.student_id] = row.remarks;
        }
      });
      setAttendanceMap(attMap);
      setRemarksMap(remMap);

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
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [selectedDate, TODAY]);

  // ── Helper to find or create attendance sheet for a date ──
  const ensureSheetForDate = async (dateStr) => {
    if (sheetsByDate[dateStr]) return sheetsByDate[dateStr];
    const sheetRes = await fetch(`${BASE_URL}/attendance-sheets/find-or-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section_id: targetSectionId,
        adviser_assignment_id: adviserAssignment?.adviser_assignment_id || undefined,
        user_id: currentUser?.user_id || currentUser?.id,
        attendance_scope: "SECTION",
        attendance_date: dateStr,
      }),
    });
    if (!sheetRes.ok) {
      const errData = await sheetRes.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to create attendance sheet");
    }
    const sheetData = await sheetRes.json();
    const sheetId = sheetData.attendance_sheet_id;
    setSheetsByDate(prev => ({ ...prev, [dateStr]: sheetId }));
    return sheetId;
  };

  // ── Handle cell click: toggle Blank → P → L → A → Blank ──
  const handleCellClick = async (studentSectionId, dateStr, colIdx, studentId = null) => {
    if (colIdx !== activeColIndex) {
      triggerToast("You can only edit attendance for the selected date on the calendar.");
      return;
    }
    if (!isEditableDate) {
      triggerToast("Past/Future dates are locked. Attendance can only be modified for today.");
      return;
    }
    if (!targetSectionId) {
      triggerToast("No section selected.");
      return;
    }

    const key = `${studentSectionId}-${dateStr}`;
    const altKey = studentId ? `${studentId}-${dateStr}` : null;
    const oldStatus = attendanceMap[key] || (altKey ? attendanceMap[altKey] : null) || null;
    
    let newStatus = null;
    if (!oldStatus) newStatus = "P";
    else if (oldStatus === "P") newStatus = "L";
    else if (oldStatus === "L") newStatus = "A";
    else if (oldStatus === "A") newStatus = null;

    // Optimistic update
    setAttendanceMap(prev => {
      const next = { ...prev };
      if (newStatus) {
        next[key] = newStatus;
        if (altKey) next[altKey] = newStatus;
      } else {
        delete next[key];
        if (altKey) delete next[altKey];
      }
      return next;
    });

    // Save to backend
    try {
      setSaving(true);
      const sheetId = await ensureSheetForDate(dateStr);

      const saveRes = await fetch(`${BASE_URL}/attendance/bulk-save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: [{
            attendance_sheet_id: sheetId,
            student_section_id: studentSectionId,
            student_id: studentId,
            status: newStatus || "BLANK",
            remarks: remarksMap[studentSectionId] || (studentId ? remarksMap[studentId] : null) || null,
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
      setAttendanceMap(prev => {
        const next = { ...prev };
        if (oldStatus) {
          next[key] = oldStatus;
          if (altKey) next[altKey] = oldStatus;
        } else {
          delete next[key];
          if (altKey) delete next[altKey];
        }
        return next;
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Quick action: Mark all students as Present for Today ──
  const handleMarkAllPresent = async () => {
    if (!isEditableDate || !targetSectionId || students.length === 0) return;
    try {
      setSaving(true);
      const sheetId = await ensureSheetForDate(TODAY);

      const newMapUpdates = {};
      const records = students.map(stu => {
        const sSecId = stu.student_section_id || stu.student_id || stu.id;
        newMapUpdates[`${sSecId}-${TODAY}`] = "P";
        if (stu.student_section_id) newMapUpdates[`${stu.student_section_id}-${TODAY}`] = "P";
        if (stu.student_id) newMapUpdates[`${stu.student_id}-${TODAY}`] = "P";

        return {
          attendance_sheet_id: sheetId,
          student_section_id: sSecId,
          student_id: stu.student_id || stu.id,
          status: "P",
          remarks: remarksMap[sSecId] || null,
        };
      });

      setAttendanceMap(prev => ({ ...prev, ...newMapUpdates }));

      const saveRes = await fetch(`${BASE_URL}/attendance/bulk-save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });

      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save attendance");
      }

      triggerToast("Marked all learners as Present for today!", "success");
    } catch (err) {
      console.error("Error marking all present:", err);
      triggerToast(`Failed: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Save all today's attendance at once ──
  const handleSaveAll = async () => {
    if (!isEditableDate || !targetSectionId) return;
    try {
      setSaving(true);
      const sheetId = await ensureSheetForDate(TODAY);

      const records = students.map(stu => {
        const sSecId = stu.student_section_id || stu.student_id || stu.id;
        const currentStatus = attendanceMap[`${sSecId}-${TODAY}`] || attendanceMap[`${stu.student_section_id}-${TODAY}`] || attendanceMap[`${stu.student_id}-${TODAY}`] || null;

        return {
          attendance_sheet_id: sheetId,
          student_section_id: sSecId,
          student_id: stu.student_id || stu.id,
          status: currentStatus || "BLANK",
          remarks: remarksMap[sSecId] || null,
        };
      });

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

  // ── Gender separation ──
  const maleStudents = useMemo(() => students.filter(s => s.sex === "M"), [students]);
  const femaleStudents = useMemo(() => students.filter(s => s.sex === "F"), [students]);

  // ── Per-student stats for the current displayed month ──
  const studentStats = useMemo(() => {
    const stats = {};
    students.forEach(stu => {
      const sId = stu.student_section_id || stu.student_id || stu.id;
      let absents = 0;
      let tardy = 0;
      schoolDays.forEach(sd => {
        const key = `${sId}-${sd.dateStr}`;
        const altKey1 = `${stu.student_section_id}-${sd.dateStr}`;
        const altKey2 = `${stu.student_id}-${sd.dateStr}`;
        const status = attendanceMap[key] || attendanceMap[altKey1] || attendanceMap[altKey2] || null;
        if (status === "A") absents++;
        else if (status === "L") tardy++;
      });
      const res = { absents, tardy };
      stats[sId] = res;
      if (stu.student_section_id) stats[stu.student_section_id] = res;
      if (stu.student_id) stats[stu.student_id] = res;
    });
    return stats;
  }, [students, attendanceMap, schoolDays]);

  // ── Daily totals calculation (Attendees recorded as Present 'P' or Late 'L' on each day) ──
  const dailyMaleTotals = useMemo(() => {
    const totals = {};
    schoolDays.forEach(sd => {
      let count = 0;
      maleStudents.forEach(stu => {
        const key = `${stu.student_section_id || stu.student_id}-${sd.dateStr}`;
        const status = attendanceMap[key] || attendanceMap[`${stu.student_section_id}-${sd.dateStr}`] || attendanceMap[`${stu.student_id}-${sd.dateStr}`] || null;
        if (status === "P" || status === "L") count++;
      });
      totals[sd.dateStr] = count;
    });
    return totals;
  }, [maleStudents, schoolDays, attendanceMap]);

  const totalMaleMonthAttendance = useMemo(() => {
    return Object.values(dailyMaleTotals).reduce((sum, c) => sum + c, 0);
  }, [dailyMaleTotals]);

  const dailyFemaleTotals = useMemo(() => {
    const totals = {};
    schoolDays.forEach(sd => {
      let count = 0;
      femaleStudents.forEach(stu => {
        const key = `${stu.student_section_id || stu.student_id}-${sd.dateStr}`;
        const status = attendanceMap[key] || attendanceMap[`${stu.student_section_id}-${sd.dateStr}`] || attendanceMap[`${stu.student_id}-${sd.dateStr}`] || null;
        if (status === "P" || status === "L") count++;
      });
      totals[sd.dateStr] = count;
    });
    return totals;
  }, [femaleStudents, schoolDays, attendanceMap]);

  const totalFemaleMonthAttendance = useMemo(() => {
    return Object.values(dailyFemaleTotals).reduce((sum, c) => sum + c, 0);
  }, [dailyFemaleTotals]);

  const dailyCombinedTotals = useMemo(() => {
    const totals = {};
    schoolDays.forEach(sd => {
      totals[sd.dateStr] = (dailyMaleTotals[sd.dateStr] || 0) + (dailyFemaleTotals[sd.dateStr] || 0);
    });
    return totals;
  }, [schoolDays, dailyMaleTotals, dailyFemaleTotals]);

  const totalCombinedMonthAttendance = useMemo(() => {
    return totalMaleMonthAttendance + totalFemaleMonthAttendance;
  }, [totalMaleMonthAttendance, totalFemaleMonthAttendance]);

  // ── Month shift helpers ──
  const handleShiftMonth = (direction) => {
    const parts = (selectedDate || TODAY).split("-");
    let y = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10) - 1;
    m += direction;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    const newMonthStr = String(m + 1).padStart(2, "0");
    const targetDay = Math.min(parseInt(parts[2], 10) || 1, new Date(y, m + 1, 0).getDate());
    const newDayStr = String(targetDay).padStart(2, "0");
    setSelectedDate(`${y}-${newMonthStr}-${newDayStr}`);
  };

  const sectionName = adviserAssignment?.section_name || "–";

  // Format student name: LASTNAME, Firstname M.
  const formatStudentName = (stu) => {
    const last = (stu.last_name || "").toUpperCase();
    const first = stu.first_name || "";
    const middleInitial = stu.middle_name ? `${stu.middle_name.charAt(0).toUpperCase()}.` : "";
    return (
      <div className="sf2-name-cell-wrap">
        <span className="sf2-last-name">{last}</span>
        <span className="sf2-first-name">, {first}</span>
        {middleInitial && <span className="sf2-mi"> {middleInitial}</span>}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="attendance-sheet-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <p style={{ color: "#64748b", fontSize: "15px", fontWeight: 600 }}>Loading attendance spreadsheet…</p>
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

      {/* Header Bar */}
      <div className="att-header-bar">
        <div className="att-title-area">
          <button className="back-btn" onClick={handleBack} title="Back to Class Record">
            <img src={backIconUrl} alt="Back" width={17} height={17} />
          </button>
          <div>
            <h1 className="att-title">Learner Attendance Conversion Tool</h1>
            <span className="att-subtitle">School Form 2 (SF2) Daily Attendance & Monthly Record</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Quick Mark All Present button */}
          {isEditableDate && students.length > 0 && (
            <button
              type="button"
              onClick={handleMarkAllPresent}
              disabled={saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                background: "#f0fdf4",
                color: "#15803d",
                border: "1px solid #bbf7d0",
                borderRadius: "9px",
                fontFamily: "var(--font-dm-sans, sans-serif)",
                fontSize: "13px",
                fontWeight: "700",
                cursor: saving ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
              title="Set all students to Present for today"
            >
              <CheckCircle size={15} />
              <span>Mark All Present</span>
            </button>
          )}

          {/* Save All button */}
          {isEditableDate && students.length > 0 && (
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="att-save-btn"
            >
              <Save size={15} />
              <span>{saving ? "Saving…" : "Save All"}</span>
            </button>
          )}

          {/* Month Stepper & Date Picker */}
          <div className="att-month-stepper">
            <button
              type="button"
              className="att-month-step-btn"
              onClick={() => handleShiftMonth(-1)}
              title="Previous Month"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="att-current-month-label">{currentMonthName}</span>
            <button
              type="button"
              className="att-month-step-btn"
              onClick={() => handleShiftMonth(1)}
              title="Next Month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Date Selector */}
          <div className="att-calendar-wrapper">
            <div className="att-calendar-icon-btn">
              <Calendar size={17} />
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

      {/* Subheader and Mode Badge */}
      <div className="att-mode-row">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="att-section-label">Section: <strong>{sectionName}</strong></span>
          <span className="att-stats-summary-pill">
            Total Learners: <strong>{students.length}</strong> (M: {maleStudents.length} | F: {femaleStudents.length})
          </span>
        </div>

        {isEditableDate ? (
          <span className="att-mode-badge editable">
            <CheckCircle size={14} />
            <span>Editable Mode (Today's Date: {TODAY})</span>
          </span>
        ) : (
          <span className="att-mode-badge readonly">
            <Info size={14} />
            <span>Read-Only Mode ({selectedDate})</span>
          </span>
        )}
      </div>

      {/* Main SF2 Conversion Tool Table */}
      {students.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", color: "#64748b", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <p style={{ fontSize: "15px" }}>No students enrolled in this section yet.</p>
        </div>
      ) : (
        <div className="sf2-table-wrapper">
          <table className="sf2-table">
            <thead>
              {/* Row 1: Super Headers */}
              <tr>
                <th rowSpan={3} className="sf2-th-no">No.</th>
                <th rowSpan={3} className="sf2-th-name">
                  <div className="sf2-name-hdr-content">
                    <span>NAME</span>
                    <span className="sf2-name-subtext">(Last Name, First Name, Middle Name)</span>
                  </div>
                </th>

                {/* DATE SUPER HEADER */}
                <th colSpan={schoolDays.length} className="sf2-th-date-title">
                  DATE
                </th>

                {/* TOTAL FOR THE MONTH */}
                <th colSpan={2} className="sf2-th-month-total">
                  Total for the Month
                </th>

                {/* REMARKS HEADER */}
                <th rowSpan={3} className="sf2-th-remarks">
                  <div className="sf2-remarks-hdr-content">
                    <span>REMARKS</span>
                    <span className="sf2-remarks-subtext">
                      (If NLPA, state reason, please refer to legend number 2. If TRANSFERRED IN/OUT, write the name of School.)
                    </span>
                  </div>
                </th>
              </tr>

              {/* Row 2: Week Day Letters (M, T, W, Th, F) with Color Coded Weeks */}
              <tr>
                {weeks.map((week, wIdx) => {
                  const colorObj = WEEK_HEADER_COLORS[wIdx % WEEK_HEADER_COLORS.length];
                  return (
                    <React.Fragment key={`week-group-${week.weekNum}`}>
                      {week.days.map((sd, dIdx) => (
                        <th
                          key={`dow-${sd.dateStr}`}
                          style={{
                            backgroundColor: colorObj.bg,
                            color: colorObj.text,
                            borderBottom: `1px solid ${colorObj.border}`,
                            width: "28px",
                            minWidth: "28px",
                            maxWidth: "32px",
                            fontSize: "11px",
                            fontWeight: "800",
                            padding: "4px 2px",
                          }}
                        >
                          {sd.dayLabel}
                        </th>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* Sub-headers for Total for the Month */}
                <th rowSpan={2} className="sf2-th-substat sf2-th-absent">ABSENT</th>
                <th rowSpan={2} className="sf2-th-substat sf2-th-tardy">TARDY</th>
              </tr>

              {/* Row 3: Day Numbers (16, 17, 18, 19, 20...) directly matching screenshot */}
              <tr>
                {weeks.map((week, wIdx) => {
                  const colorObj = WEEK_HEADER_COLORS[wIdx % WEEK_HEADER_COLORS.length];
                  return (
                    <React.Fragment key={`week-dates-${week.weekNum}`}>
                      {week.days.map((sd) => {
                        const isActive = sd.dateStr === selectedDate;
                        return (
                          <th
                            key={`num-${sd.dateStr}`}
                            className={`sf2-date-num-th ${isActive ? "active-date-th" : ""}`}
                            style={{
                              backgroundColor: isActive ? "#fef08a" : colorObj.bg,
                              color: isActive ? "#854d0e" : colorObj.text,
                              width: "28px",
                              fontSize: "11px",
                              fontWeight: "700",
                              padding: "4px 2px",
                            }}
                            title={sd.fullDate}
                          >
                            {sd.dayNumber}
                          </th>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* ════════════════ MALE LEARNERS SECTION ════════════════ */}
              {maleStudents.map((stu, rowIdx) => {
                const sId = stu.student_section_id || stu.student_id || stu.id;
                const stats = studentStats[sId] || { absents: 0, tardy: 0 };
                const remarksVal = remarksMap[sId] || remarksMap[stu.student_section_id] || remarksMap[stu.student_id] || "";

                return (
                  <tr key={`male-${sId || rowIdx}`} className="sf2-student-row">
                    <td className="sf2-td-no">{rowIdx + 1}</td>
                    <td className="sf2-td-name">{formatStudentName(stu)}</td>

                    {/* Weekday Attendance Cells */}
                    {schoolDays.map((sd, colIdx) => {
                      const key = `${sId}-${sd.dateStr}`;
                      const altKey1 = `${stu.student_section_id}-${sd.dateStr}`;
                      const altKey2 = `${stu.student_id}-${sd.dateStr}`;
                      const status = attendanceMap[key] || attendanceMap[altKey1] || attendanceMap[altKey2] || null;
                      const isActive = colIdx === activeColIndex;

                      return (
                        <td
                          key={`cell-${sId}-${sd.dateStr}`}
                          className={`sf2-td-att-cell ${isActive ? "sf2-active-col-cell" : ""} ${isActive && isEditableDate ? "sf2-editable-cell" : ""}`}
                          onClick={() => handleCellClick(sId, sd.dateStr, colIdx, stu.student_id)}
                          title={`${stu.last_name}, ${stu.first_name} - ${sd.fullDate} (${status === "P" ? "Present" : status === "L" ? "Late" : status === "A" ? "Absent" : "Unrecorded"})`}
                        >
                          {status ? (
                            <span className={`sf2-badge ${status.toLowerCase()}`}>
                              {status}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}

                    <td className="sf2-td-stat">{stats.absents}</td>
                    <td className="sf2-td-stat">{stats.tardy}</td>
                    <td className="sf2-td-remarks">{remarksVal}</td>
                  </tr>
                );
              })}

              {/* ════════════════ MALE SUB-TOTAL ROW ════════════════ */}
              <tr className="sf2-subtotal-row male-total-row">
                <td colSpan={2} className="sf2-subtotal-label">
                  MALE | Total Per Day ➡
                </td>
                {schoolDays.map((sd) => (
                  <td key={`male-tot-${sd.dateStr}`} className="sf2-subtotal-cell">
                    {dailyMaleTotals[sd.dateStr] || 0}
                  </td>
                ))}
                <td colSpan={2} className="sf2-subtotal-sum">
                  {totalMaleMonthAttendance}
                </td>
                <td className="sf2-subtotal-blank"></td>
              </tr>

              {/* ════════════════ FEMALE LEARNERS SECTION ════════════════ */}
              {femaleStudents.map((stu, rowIdx) => {
                const sId = stu.student_section_id || stu.student_id || stu.id;
                const stats = studentStats[sId] || { absents: 0, tardy: 0 };
                const remarksVal = remarksMap[sId] || remarksMap[stu.student_section_id] || remarksMap[stu.student_id] || "";

                return (
                  <tr key={`female-${sId || rowIdx}`} className="sf2-student-row">
                    <td className="sf2-td-no">{rowIdx + 1}</td>
                    <td className="sf2-td-name">{formatStudentName(stu)}</td>

                    {/* Weekday Attendance Cells */}
                    {schoolDays.map((sd, colIdx) => {
                      const key = `${sId}-${sd.dateStr}`;
                      const altKey1 = `${stu.student_section_id}-${sd.dateStr}`;
                      const altKey2 = `${stu.student_id}-${sd.dateStr}`;
                      const status = attendanceMap[key] || attendanceMap[altKey1] || attendanceMap[altKey2] || null;
                      const isActive = colIdx === activeColIndex;

                      return (
                        <td
                          key={`cell-${sId}-${sd.dateStr}`}
                          className={`sf2-td-att-cell ${isActive ? "sf2-active-col-cell" : ""} ${isActive && isEditableDate ? "sf2-editable-cell" : ""}`}
                          onClick={() => handleCellClick(sId, sd.dateStr, colIdx, stu.student_id)}
                          title={`${stu.last_name}, ${stu.first_name} - ${sd.fullDate} (${status === "P" ? "Present" : status === "L" ? "Late" : status === "A" ? "Absent" : "Unrecorded"})`}
                        >
                          {status ? (
                            <span className={`sf2-badge ${status.toLowerCase()}`}>
                              {status}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}

                    <td className="sf2-td-stat">{stats.absents}</td>
                    <td className="sf2-td-stat">{stats.tardy}</td>
                    <td className="sf2-td-remarks">{remarksVal}</td>
                  </tr>
                );
              })}

              {/* ════════════════ FEMALE SUB-TOTAL ROW ════════════════ */}
              <tr className="sf2-subtotal-row female-total-row">
                <td colSpan={2} className="sf2-subtotal-label">
                  FEMALE | Total Per Day ➡
                </td>
                {schoolDays.map((sd) => (
                  <td key={`female-tot-${sd.dateStr}`} className="sf2-subtotal-cell">
                    {dailyFemaleTotals[sd.dateStr] || 0}
                  </td>
                ))}
                <td colSpan={2} className="sf2-subtotal-sum">
                  {totalFemaleMonthAttendance}
                </td>
                <td className="sf2-subtotal-blank"></td>
              </tr>

              {/* ════════════════ COMBINED TOTAL ROW ════════════════ */}
              <tr className="sf2-subtotal-row combined-total-row">
                <td colSpan={2} className="sf2-subtotal-label combined">
                  COMBINED | Total Per Day ➡
                </td>
                {schoolDays.map((sd) => (
                  <td key={`comb-tot-${sd.dateStr}`} className="sf2-subtotal-cell combined">
                    {dailyCombinedTotals[sd.dateStr] || 0}
                  </td>
                ))}
                <td colSpan={2} className="sf2-subtotal-sum combined">
                  {totalCombinedMonthAttendance}
                </td>
                <td className="sf2-subtotal-blank"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom Summary & Legend */}
      <div className="att-bottom-grid">
        {/* Attendance Summary */}
        <div className="att-summary-card">
          <h3 className="att-card-header">Monthly Attendance Summary</h3>
          <table className="att-summary-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Month</th>
                <th>No. of Class Days</th>
                <th>Males (M)</th>
                <th>Females (F)</th>
                <th>TOTAL LEARNERS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="row-month" style={{ textAlign: "left", fontWeight: 700 }}>{currentMonthName}</td>
                <td>{schoolDays.length}</td>
                <td>{maleStudents.length}</td>
                <td>{femaleStudents.length}</td>
                <td style={{ color: "#112d61", fontWeight: 800 }}>{students.length}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="att-legend-card">
          <h3 className="att-card-header">Attendance Legend</h3>
          <div className="att-legend-list">
            <div className="att-legend-item">
              <span className="legend-badge-box p">P</span>
              <span className="att-legend-text"><strong>Present</strong></span>
            </div>
            <div className="att-legend-item">
              <span className="legend-badge-box l">L</span>
              <span className="att-legend-text"><strong>Late</strong> / Tardy</span>
            </div>
            <div className="att-legend-item">
              <span className="legend-badge-box a">A</span>
              <span className="att-legend-text"><strong>Absent</strong></span>
            </div>
            <div className="att-legend-item">
              <span className="legend-badge-box blank"></span>
              <span className="att-legend-text"><strong>Blank</strong> = Unrecorded</span>
            </div>
          </div>
          <p style={{ fontSize: "12px", color: "#64748b", marginTop: "12px", fontStyle: "italic", lineHeight: 1.4 }}>
            * Click any cell on today's date ({TODAY}) to toggle status: <strong>Present (P) ➡ Late (L) ➡ Absent (A) ➡ Clear (Blank)</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
