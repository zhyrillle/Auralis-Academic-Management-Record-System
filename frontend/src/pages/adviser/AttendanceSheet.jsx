import React, { useState, useMemo } from "react";
import { Calendar, CheckCircle, AlertTriangle, Info, X } from "lucide-react";
import "../../styles/attendanceSheet.css";
import backIconUrl from "../../assets/backButton.svg";

// Student names roster matching the 28 students in the mockup image
const STUDENTS_ROSTER = [
  "John Doe", "Jane Smith", "Peter Jones", "Alice Brown", "Bob White",
  "Charlie Green", "Ola Nordmann", "Jan Modaal", "Han Meimei", "Yamada Taro",
  "Ivan Ivanov", "Jean Dupont", "Erika Mustermann", "Max Mustermann", "Fulano de Tal",
  "Juan Pérez", "Robin Banks", "Anita Job", "Justin Case", "Ima Hogg",
  "Frank Foster", "David Davis", "Betty Baker", "Arthur Adams", "Diana Prince",
  "Wade Wilson", "Lois Lane", "Clark Kent"
];

// Map 20 columns to the weekdays of July 2026
const JULY_2026_DAYS = [
  { label: "M", dateStr: "2026-07-06", display: "Mon, Jul 6" },
  { label: "T", dateStr: "2026-07-07", display: "Tue, Jul 7" },
  { label: "W", dateStr: "2026-07-08", display: "Wed, Jul 8" },
  { label: "TH", dateStr: "2026-07-09", display: "Thu, Jul 9" },
  { label: "F", dateStr: "2026-07-10", display: "Fri, Jul 10" },
  { label: "M", dateStr: "2026-07-13", display: "Mon, Jul 13" },
  { label: "T", dateStr: "2026-07-14", display: "Tue, Jul 14" },
  { label: "W", dateStr: "2026-07-15", display: "Wed, Jul 15" },
  { label: "TH", dateStr: "2026-07-16", display: "Thu, Jul 16" },
  { label: "F", dateStr: "2026-07-17", display: "Fri, Jul 17" },
  { label: "M", dateStr: "2026-07-20", display: "Mon, Jul 20" },
  { label: "T", dateStr: "2026-07-21", display: "Tue, Jul 21" },
  { label: "W", dateStr: "2026-07-22", display: "Wed, Jul 22" },
  { label: "TH", dateStr: "2026-07-23", display: "Thu, Jul 23" },
  { label: "F", dateStr: "2026-07-24", display: "Fri, Jul 24" },
  { label: "M", dateStr: "2026-07-27", display: "Mon, Jul 27" },
  { label: "T", dateStr: "2026-07-28", display: "Tue, Jul 28" },
  { label: "W", dateStr: "2026-07-29", display: "Wed, Jul 29" }, // Today (Column 18)
  { label: "TH", dateStr: "2026-07-30", display: "Thu, Jul 30" },
  { label: "F", dateStr: "2026-07-31", display: "Fri, Jul 31" }
];

const TODAY_DATE = "2026-07-29"; // Mock today's local date

export default function AttendanceSheet({ onBack }) {
  const [selectedDate, setSelectedDate] = useState(TODAY_DATE);
  
  // Create state for all students' 20-day attendance status
  const [attendance, setAttendance] = useState(() => {
    const initial = {};
    STUDENTS_ROSTER.forEach((student, index) => {
      initial[student] = JULY_2026_DAYS.map((d, colIdx) => {
        // Special case seed data to match the visual mockups
        if (student === "John Doe") {
          if (colIdx === 2) return "A"; // 1st week Wed
          if (colIdx === 10) return "L"; // 3rd week Mon
          if (colIdx === 15) return "A"; // 4th week Mon
        }
        if (student === "Peter Jones") {
          if (colIdx === 5) return "A"; // 2nd week Mon
          if (colIdx === 9) return "L"; // 2nd week Fri
          if (colIdx === 13) return "A"; // 3rd week Thu
        }
        if (student === "Bob White") {
          if (colIdx === 4) return "A"; // 1st week Fri
        }
        if (student === "Charlie Green") {
          if (colIdx === 1) return "A"; // 1st week Tue
        }
        if (student === "Han Meimei") {
          // Continuous Late streak
          if (colIdx >= 2 && colIdx <= 9) return "L";
          if (colIdx === 10) return "A";
        }
        if (student === "Yamada Taro") {
          if (colIdx === 8) return "A";
        }
        if (student === "Ivan Ivanov") {
          if (colIdx === 3 || colIdx === 5) return "A";
        }
        if (student === "Max Mustermann") {
          if (colIdx === 14) return "A";
        }
        if (student === "Fulano de Tal") {
          if (colIdx === 2 || colIdx === 3 || colIdx === 4) return "A";
        }
        if (student === "Robin Banks") {
          if (colIdx === 9) return "A";
        }
        if (student === "Justin Case") {
          if (colIdx === 14) return "A";
        }
        if (student === "Ima Hogg") {
          if (colIdx === 10) return "A";
        }
        if (student === "David Davis") {
          if (colIdx === 4) return "A";
        }
        if (student === "Arthur Adams") {
          if (colIdx === 3) return "A";
        }
        if (student === "Diana Prince") {
          if (colIdx === 6) return "A";
        }
        if (student === "Clark Kent") {
          if (colIdx === 18) return "A";
        }

        // Default to P (Present) for all other cells
        return "P";
      });
    });
    return initial;
  });

  const [toasts, setToasts] = useState([]);

  const triggerToast = (message, type = "error") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Determine if the selected date is the current mock today's date
  const isEditableDate = selectedDate === TODAY_DATE;

  // Find the column index of the selected date in our grid
  const activeColIndex = useMemo(() => {
    return JULY_2026_DAYS.findIndex(d => d.dateStr === selectedDate);
  }, [selectedDate]);

  const handleCellClick = (student, colIdx) => {
    // 1. Check if the cell being clicked is for the currently selected date
    if (colIdx !== activeColIndex) {
      triggerToast("You can only edit attendance for the selected date on the calendar.");
      return;
    }

    // 2. Check if the selected date is current date (Today)
    if (!isEditableDate) {
      triggerToast("Past/Future dates are locked. Attendance can only be modified for the current date (July 29, 2026).");
      return;
    }

    // 3. Toggles status: P -> L -> A -> P
    setAttendance((prev) => {
      const currentStudentDays = [...prev[student]];
      const oldStatus = currentStudentDays[colIdx];
      let newStatus = "P";
      if (oldStatus === "P") newStatus = "L";
      else if (oldStatus === "L") newStatus = "A";
      
      currentStudentDays[colIdx] = newStatus;
      return {
        ...prev,
        [student]: currentStudentDays
      };
    });
  };

  // Process rows statistics (total present, absent, tardy)
  const studentStats = useMemo(() => {
    const stats = {};
    STUDENTS_ROSTER.forEach((student) => {
      const record = attendance[student] || [];
      const absents = record.filter(status => status === "A").length;
      const tardy = record.filter(status => status === "L").length;
      
      let remark = "";
      if (absents === 0 && tardy === 0) {
        remark = "Perfect attendance";
      } else if (absents > 1 || tardy > 4) {
        remark = "Needs Improvement";
      }

      stats[student] = { absents, tardy, remark };
    });
    return stats;
  }, [attendance]);

  // Gender demographics matching summary (13 Males, 15 Females = 28 Total)
  const malesCount = 13;
  const femalesCount = 15;

  return (
    <div className="attendance-sheet-container">
      {/* Toast Warnings */}
      <div style={{ position: "fixed", top: "24px", right: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "10px" }}>
        {toasts.map((t) => (
          <div 
            key={t.id} 
            style={{ 
              backgroundColor: "#fee2e2", 
              border: "1px solid #fecaca", 
              borderRadius: "10px", 
              padding: "12px 18px", 
              color: "#991b1b", 
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)", 
              display: "flex", 
              alignItems: "center", 
              gap: "8px",
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              fontWeight: "600",
              animation: "fadeIn 0.2s ease-out"
            }}
          >
            <AlertTriangle size={16} />
            <span>{t.message}</span>
            <button 
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ background: "transparent", border: "none", color: "#991b1b", cursor: "pointer", marginLeft: "8px", display: "flex", padding: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Header Area */}
      <div className="att-header-bar">
        <div className="att-title-area">
          <button className="back-btn" onClick={onBack} title="Back to Sections">
            <img src={backIconUrl} alt="Back" width={17} height={17} />
          </button>
          <h1 className="att-title">Class Record</h1>
        </div>

        {/* Date Selector input */}
        <div className="att-calendar-wrapper">
          <div className="att-calendar-icon-btn">
            <Calendar size={18} />
          </div>
          <input 
            type="date" 
            className="att-date-input" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {/* Subheader and locking indicator */}
      <div className="att-mode-row">
        <span className="att-section-label">Section: Mahogany</span>
        {isEditableDate ? (
          <span className="att-mode-badge editable">
            <CheckCircle size={14} />
            <span>Editable Mode (Current Date Selected)</span>
          </span>
        ) : (
          <span className="att-mode-badge readonly">
            <Info size={14} />
            <span>Read-Only Mode (Past/Future Date)</span>
          </span>
        )}
      </div>

      {/* Roster Spreadsheet Grid Table */}
      <div className="att-table-wrapper">
        <table className="att-table">
          <thead>
            {/* Main Header Weeks Row */}
            <tr>
              <th className="name-header" rowSpan={2}>Names</th>
              <th colSpan={5}>Week 1</th>
              <th colSpan={5}>Week 2</th>
              <th colSpan={5}>Week 3</th>
              <th colSpan={5}>Week 4</th>
              <th rowSpan={2} style={{ width: "80px" }}>Total Absent</th>
              <th rowSpan={2} style={{ width: "80px" }}>Total Tardy</th>
              <th rowSpan={2} style={{ width: "150px" }}>Remarks</th>
            </tr>
            {/* Days Header Row */}
            <tr>
              {JULY_2026_DAYS.map((d, colIdx) => (
                <th 
                  key={colIdx} 
                  className={colIdx === activeColIndex ? "active-date-header" : ""}
                  title={d.display}
                  style={{ width: "30px", fontSize: "11px" }}
                >
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STUDENTS_ROSTER.map((student) => {
              const stats = studentStats[student] || { absents: 0, tardy: 0, remark: "" };
              return (
                <tr key={student}>
                  {/* Sticky student name */}
                  <td className="student-name-cell">{student}</td>
                  {/* 20-day grid cells */}
                  {attendance[student].map((status, colIdx) => {
                    const isActive = colIdx === activeColIndex;
                    return (
                      <td 
                        key={colIdx} 
                        className={`${isActive ? "active-date-cell" : ""} ${isActive && isEditableDate ? "editable-cell" : ""}`}
                        onClick={() => handleCellClick(student, colIdx)}
                        title={JULY_2026_DAYS[colIdx].display}
                      >
                        <span className={`att-status-badge ${status.toLowerCase()}`}>
                          {status}
                        </span>
                      </td>
                    );
                  })}
                  {/* Stats columns */}
                  <td className="summary-stat-cell">{stats.absents}</td>
                  <td className="summary-stat-cell">{stats.tardy}</td>
                  <td className="remarks-cell">{stats.remark}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Summary & Legend panels */}
      <div className="att-bottom-grid">
        {/* Attendance Summary */}
        <div className="att-summary-card">
          <h3 className="att-card-header">Attendance Summary</h3>
          <p style={{ color: "#64748b", margin: "0 0 12px 0", fontSize: "14px", fontWeight: 500 }}>
            Total Students: {STUDENTS_ROSTER.length}
          </p>
          <table className="att-summary-table">
            <thead>
              <tr>
                <th style={{ textAlign: "center" }}>Month</th>
                <th>No.of Days of Classes</th>
                <th>M</th>
                <th>F</th>
                <th>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="row-month">July</td>
                <td>20</td>
                <td>{malesCount}</td>
                <td>{femalesCount}</td>
                <td>{STUDENTS_ROSTER.length}</td>
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
        </div>
      </div>
    </div>
  );
}
