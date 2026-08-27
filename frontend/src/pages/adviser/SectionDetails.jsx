import React, { useState, useMemo } from "react";
import { Eye, ArrowDownNarrowWide } from "lucide-react";

// Reusable Common Components
import SearchBar from "../../components/common/SearchBar.jsx";
import SelectFilter from "../../components/common/SelectFilter.jsx";
import TermToggleGroup from "../../components/common/TermToggleGroup.jsx";
import StudentSF9Page from "./StudentSF9Page.jsx";

// Back icon asset matching GradingSheet.jsx
import backIconUrl from "../../assets/backButton.svg";

// Page Stylesheet
import "../../styles/sectionDetails.css";

// -------------------------------------------------------------
// SAMPLE MOCK DATA
// -------------------------------------------------------------
const INITIAL_STUDENTS = [
  { id: 1, lrn: "145783920614", name: "Alex Matthew Cruz", riskStatus: "Low Risk", grade: 91, honorStatus: "With Honor" },
  { id: 2, lrn: "238691475820", name: "Bianca Mae Santos", riskStatus: "Low Risk", grade: 95, honorStatus: "High Honor" },
  { id: 3, lrn: "564920183747", name: "Erika Nicole Mendoza", riskStatus: "Medium Risk", grade: 88, honorStatus: "None" },
  { id: 4, lrn: "392748561830", name: "Joshua Carlo Ramirez", riskStatus: "Low Risk", grade: 90, honorStatus: "With Honor" },
  { id: 5, lrn: "817345629104", name: "Daniel Joseph Reyes", riskStatus: "Medium Risk", grade: 84, honorStatus: "None" },
  { id: 6, lrn: "472918365104", name: "Sophia Mae Rivera", riskStatus: "Low Risk", grade: 97, honorStatus: "High Honor" },
  { id: 7, lrn: "583027194658", name: "Adrian Kyle Santos", riskStatus: "At Risk", grade: 79, honorStatus: "None" },
  { id: 8, lrn: "694135820477", name: "Trisha Anne Torres", riskStatus: "Low Risk", grade: 93, honorStatus: "Highest Honor" },
];

// KPI Cards Data Definition matching themes.css variables
const KPI_CARDS_DATA = [
  { label: "Advancing", count: 12, range: "90 - 100", colorClass: "advancing" },
  { label: "Benchmarking", count: 17, range: "80 - 89", colorClass: "benchmarking" },
  { label: "Connecting", count: 6, range: "75 - 79", colorClass: "connecting" },
  { label: "Developing", count: 2, range: "65 - 74", colorClass: "developing" },
  { label: "Emerging", count: 0, range: "0 - 64", colorClass: "emerging" },
  { label: "At-risk", count: 7, range: "-", colorClass: "atrisk" },
];

// Sort Options for SelectFilter
const SORT_OPTIONS = [
  { label: "Student Name", value: "name" },
  { label: "LRN", value: "lrn" },
  { label: "Term Grade", value: "grade" },
];

/**
 * SectionDetails Component
 *
 * @param {Object} props
 * @param {string} [props.userRole="adviser"] - Role of the logged-in user ("adviser", "teacher", etc.)
 * @param {function():void} [props.onBack] - Navigation handler for back button
 * @param {function(Object):void} [props.onViewStudent] - Action handler when clicking Eye button
 */
export default function SectionDetails({ userRole = "adviser", onBack, onViewStudent }) {
  // State Management
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRisk, setSelectedRisk] = useState(null); // "Low", "Medium", "High" or null
  const [selectedHonor, setSelectedHonor] = useState(null); // "With", "High", "Highest" or null
  const [selectedTerm, setSelectedTerm] = useState("T1");
  const [sortBy, setSortBy] = useState("name");
  const [sortAscending, setSortAscending] = useState(true);

  // Active student for StudentSF9Page view fallback
  const [activeSf9Student, setActiveSf9Student] = useState(null);

  // Filter & Sort Logic
  const filteredStudents = useMemo(() => {
    let result = INITIAL_STUDENTS.filter((student) => {
      // Search query match
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        student.name.toLowerCase().includes(query) ||
        student.lrn.includes(query);

      // Risk filter match
      let matchesRisk = true;
      if (selectedRisk === "Low") matchesRisk = student.riskStatus === "Low Risk";
      if (selectedRisk === "Medium") matchesRisk = student.riskStatus === "Medium Risk";
      if (selectedRisk === "High") matchesRisk = student.riskStatus === "At Risk";

      // Honor filter match
      let matchesHonor = true;
      if (selectedHonor === "With") matchesHonor = student.honorStatus === "With Honor";
      if (selectedHonor === "High") matchesHonor = student.honorStatus === "High Honor";
      if (selectedHonor === "Highest") matchesHonor = student.honorStatus === "Highest Honor";

      return matchesSearch && matchesRisk && matchesHonor;
    });

    result.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
        if (valA < valB) return sortAscending ? -1 : 1;
        if (valA > valB) return sortAscending ? 1 : -1;
        return 0;
      }

      if (typeof valA === "number") {
        return sortAscending ? valA - valB : valB - valA;
      }

      return 0;
    });

    return result;
  }, [searchQuery, selectedRisk, selectedHonor, sortBy, sortAscending]);

  // Risk Pill Toggle Handler
  const handleRiskToggle = (riskKey) => {
    if (selectedRisk === riskKey) {
      setSelectedRisk(null);
    } else {
      setSelectedRisk(riskKey);
    }
  };

  // Honor Pill Toggle Handler
  const handleHonorToggle = (honorKey) => {
    if (selectedHonor === honorKey) {
      setSelectedHonor(null);
    } else {
      setSelectedHonor(honorKey);
    }
  };

  // Eye action button click handler -> Redirects to StudentSF9Page
  const handleActionClick = (student) => {
    if (onViewStudent) {
      onViewStudent(student);
    } else {
      setActiveSf9Student(student);
    }
  };

  // If redirecting to StudentSF9Page via local view state
  if (activeSf9Student) {
    return (
      <StudentSF9Page
        student={activeSf9Student}
        userRole={userRole}
        onBack={() => setActiveSf9Student(null)}
      />
    );
  }

  // Helper for rendering Risk Badges (Rectangular, taking full column width)
  const renderRiskBadge = (status) => {
    switch (status) {
      case "Low Risk":
        return <span className="badge-rect badge-risk-low">Low Risk</span>;
      case "Medium Risk":
        return <span className="badge-rect badge-risk-medium">Medium Risk</span>;
      case "At Risk":
        return <span className="badge-rect badge-risk-atrisk">At Risk</span>;
      default:
        return <span className="badge-rect badge-honor-none">{status}</span>;
    }
  };

  // Helper for rendering Honor Badges (Rectangular, rendered ONLY if userRole === 'adviser')
  const renderHonorBadge = (status) => {
    switch (status) {
      case "With Honor":
        return <span className="badge-rect badge-honor-with">With Honor</span>;
      case "High Honor":
        return <span className="badge-rect badge-honor-high">High Honor</span>;
      case "Highest Honor":
        return <span className="badge-rect badge-honor-highest">Highest Honor</span>;
      case "None":
      default:
        return <span className="badge-rect badge-honor-none">None</span>;
    }
  };

  return (
    <div className="section-details-page">
      {/* Header Bar matching GradingSheet.jsx */}
      <div className="section-details-header-bar">
        <div className="section-details-title-area">
          <button
            className="back-btn"
            onClick={onBack ? onBack : () => window.history.back()}
            title="Back to Classes"
          >
            <img src={backIconUrl} alt="Back" width={17} height={17} />
          </button>
          <h1
            className="section-details-title"
            onClick={onBack ? onBack : () => window.history.back()}
          >
            Assigned Classes
          </h1>
        </div>
      </div>

      {/* Section 1: Metric KPI Summary Grid (Top Row) */}
      <div className="kpi-summary-grid">
        {KPI_CARDS_DATA.map((kpi, idx) => (
          <div key={idx} className="kpi-card">
            <span className="kpi-label">{kpi.label}</span>
            <span className={`kpi-count ${kpi.colorClass}`}>{kpi.count}</span>
            <span className="kpi-range">{kpi.range}</span>
          </div>
        ))}
      </div>

      {/* Section 2: Search & Filter Toolbar Row */}
      <div className="toolbar-row">
        <div style={{ flex: 1, maxWidth: "440px" }}>
          <SearchBar
            query={searchQuery}
            setQuery={setSearchQuery}
            placeholder="Search student or LRN..."
          />
        </div>

        <div className="toolbar-right">
          {/* Risk Filter Group (Inline, Rectangular with small corner radius) */}
          <div className="filter-segmented-group">
            {["Low", "Medium", "High"].map((rKey) => (
              <button
                key={rKey}
                type="button"
                onClick={() => handleRiskToggle(rKey)}
                className={`filter-rect-btn ${selectedRisk === rKey ? "active" : ""}`}
              >
                {rKey}
              </button>
            ))}
          </div>

          {/* Honor Filter Group (rendered ONLY if userRole === 'adviser') */}
          {userRole === "adviser" && (
            <div className="filter-segmented-group">
              {["With", "High", "Highest"].map((hKey) => (
                <button
                  key={hKey}
                  type="button"
                  onClick={() => handleHonorToggle(hKey)}
                  className={`filter-rect-btn ${selectedHonor === hKey ? "active" : ""}`}
                >
                  {hKey}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Main Data Table Container */}
      <div className="table-container-card">
        {/* Table Sub-Header Controls (NO bottom line between total students and column names) */}
        <div className="table-sub-header">
          <div className="total-students-label">
            Total Students: {filteredStudents.length}
          </div>

          <div className="sub-header-controls">
            {/* Sort Box with Sort Icon matching AdviserSections.jsx */}
            <div className="sort-wrapper">
              <span className="sort-label">Sort:</span>
              <SelectFilter
                value={sortBy}
                onChange={setSortBy}
                options={SORT_OPTIONS}
                minWidth="150px"
              />
              <button
                type="button"
                className="sort-order-btn"
                onClick={() => setSortAscending(!sortAscending)}
                title="Toggle sorting order"
              >
                <ArrowDownNarrowWide
                  size={20}
                  style={{
                    transform: sortAscending ? "none" : "rotate(180deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              </button>
            </div>

            {/* Term Toggle Group */}
            <TermToggleGroup
              selectedTerm={selectedTerm}
              onSelectTerm={setSelectedTerm}
            />
          </div>
        </div>

        {/* Table Structure */}
        <div style={{ overflowX: "auto" }}>
          <table className="section-data-table">
            <thead>
              <tr>
                <th className="text-center" style={{ width: userRole === "adviser" ? "5%" : "6%" }}>
                  No.
                </th>
                <th className="text-left" style={{ width: userRole === "adviser" ? "16%" : "20%" }}>
                  LRN
                </th>
                <th className="text-left" style={{ width: userRole === "adviser" ? "26%" : "35%" }}>
                  Student Name
                </th>
                <th className="text-center" style={{ width: userRole === "adviser" ? "18%" : "21%" }}>
                  At-risk Status
                </th>
                <th className="text-center" style={{ width: userRole === "adviser" ? "12%" : "12%" }}>
                  Term Grade
                </th>

                {/* Conditional Honor Status Column (rendered ONLY if userRole === 'adviser') */}
                {userRole === "adviser" && (
                  <th className="text-center" style={{ width: "16%" }}>
                    Honor Status
                  </th>
                )}

                <th className="text-center" style={{ width: userRole === "adviser" ? "7%" : "6%" }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student, index) => (
                  <tr key={student.id}>
                    <td className="text-center">
                      {index + 1}
                    </td>
                    <td className="text-left student-lrn">
                      {student.lrn}
                    </td>
                    <td className="text-left student-name">
                      {student.name}
                    </td>
                    <td className="text-center">
                      {renderRiskBadge(student.riskStatus)}
                    </td>
                    <td className="text-center">
                      {student.grade}
                    </td>

                    {/* Conditional Honor Status Cell (rendered ONLY if userRole === 'adviser') */}
                    {userRole === "adviser" && (
                      <td className="text-center">
                        {renderHonorBadge(student.honorStatus)}
                      </td>
                    )}

                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => handleActionClick(student)}
                        className="action-eye-btn"
                        title="View Student Details"
                      >
                        <Eye size={20} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={userRole === "adviser" ? 7 : 6}
                    className="text-center"
                    style={{ padding: "32px", color: "var(--subtext-color)" }}
                  >
                    No students match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
