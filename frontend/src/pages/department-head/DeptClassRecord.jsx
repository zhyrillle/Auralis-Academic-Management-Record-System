import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  LoaderCircle,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect.jsx";
import SearchBar from "../../components/common/SearchBar.jsx";
import Toast from "../../components/common/Toast.jsx";
import {
  getDeptFilterOptions,
  getDeptClassRecord,
  downloadDeptClassRecord,
} from "../../services/deptHeadClassRecordApi.js";
import { getStoredUser } from "../../utils/auth.js";
import "../../styles/masterSheet.css";

const getUserId = (user) => user?.user_id || user?.id || user?.user?.user_id || user?.user?.id || 4;
const emptyToast = { message: "", variant: "success", icon: null };

const formatGradeLevelLabel = (name) => {
  if (!name) return "Grade Level";
  const str = String(name).trim();
  if (/^g\d+$/i.test(str)) {
    return `Grade ${str.replace(/[^0-9]/g, "")}`;
  }
  return str;
};

const formatSubmissionDeadline = (terms = []) => {
  if (!terms || !terms.length) return "Oct 15, 2026";
  const deadlines = terms
    .map((term) => ({
      deadline: term.submissionDeadlineAt,
      timestamp: new Date(term.submissionDeadlineAt).getTime(),
    }))
    .filter((term) => term.deadline && Number.isFinite(term.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!deadlines.length) return "Oct 15, 2026";

  const now = Date.now();
  const relevantDeadline =
    deadlines.find((term) => term.timestamp >= now) ||
    deadlines[deadlines.length - 1];

  return new Date(relevantDeadline.deadline).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Default fallback placeholder rows if a section has no students yet
const DEFAULT_EMPTY_ROWS = Array.from({ length: 10 }, (_, i) => ({
  studentId: `placeholder-${i + 1}`,
  studentSectionId: `placeholder-${i + 1}`,
  lrn: "—",
  displayName: "—",
  firstName: "",
  lastName: "",
  sex: i < 5 ? "M" : "F",
  grades: {
    english: {
      terms: [null, null, null],
      finalGrade: null,
    },
  },
  generalAverage: null,
  isPlaceholder: true,
}));

export default function DeptClassRecord() {
  const currentUser = useMemo(() => getStoredUser(), []);
  const effectiveUserId = useMemo(() => getUserId(currentUser), [currentUser]);

  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [toast, setToast] = useState(emptyToast);

  // Filters State
  const [filterData, setFilterData] = useState(null);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("1");
  const [selectedGradeLevelId, setSelectedGradeLevelId] = useState("all");
  const [selectedSectionId, setSelectedSectionId] = useState("1");

  // Record Data State
  const [recordData, setRecordData] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const departmentName = useMemo(() => {
    return (
      recordData?.department?.name ||
      filterData?.department?.name ||
      currentUser?.department_name ||
      currentUser?.department ||
      "English"
    );
  }, [recordData, filterData, currentUser]);

  // Load filter options on mount
  useEffect(() => {
    let isCancelled = false;

    async function loadOptions() {
      setIsLoadingOptions(true);
      try {
        const options = await getDeptFilterOptions(effectiveUserId);
        if (isCancelled) return;

        if (options && options.sections && options.sections.length > 0) {
          setFilterData(options);

          // Find current or first school year
          const currentSy = options.schoolYears.find((sy) => sy.isCurrent) || options.schoolYears[0];
          if (currentSy) {
            setSelectedSchoolYearId(String(currentSy.id));
          }

          // Default to first section (e.g. Mahogany)
          if (!selectedSectionId && options.sections[0]) {
            setSelectedSectionId(String(options.sections[0].sectionId));
          }
        }
      } catch (err) {
        console.warn("Could not load filter options from API:", err);
      } finally {
        if (!isCancelled) {
          setIsLoadingOptions(false);
        }
      }
    }

    loadOptions();

    return () => {
      isCancelled = true;
    };
  }, [effectiveUserId]);

  // Fetch Class Record whenever selectedSectionId or selectedSchoolYearId changes
  useEffect(() => {
    if (!selectedSectionId) return;

    let isCancelled = false;

    async function loadRecord() {
      setIsLoadingRecord(true);
      try {
        const data = await getDeptClassRecord({
          sectionId: selectedSectionId,
          schoolYearId: selectedSchoolYearId || "1",
          userId: effectiveUserId,
        });

        if (isCancelled) return;
        if (data) {
          setRecordData(data);
        }
      } catch (err) {
        console.warn("Error fetching department class record:", err);
      } finally {
        if (!isCancelled) {
          setIsLoadingRecord(false);
        }
      }
    }

    loadRecord();

    return () => {
      isCancelled = true;
    };
  }, [selectedSectionId, selectedSchoolYearId, effectiveUserId]);

  // Dropdown options
  const schoolYearOptions = useMemo(() => {
    if (filterData?.schoolYears?.length) {
      return filterData.schoolYears.map((sy) => ({
        value: String(sy.id),
        label: `SY ${sy.label}${sy.isCurrent ? " (Current)" : ""}`,
      }));
    }
    return [
      { value: "1", label: "SY 2026-2027 (Current)" },
      { value: "2", label: "SY 2025-2026" },
      { value: "3", label: "SY 2027-2028" },
    ];
  }, [filterData]);

  const gradeLevelOptions = useMemo(() => {
    if (filterData?.gradeLevels?.length) {
      return [
        { value: "all", label: "All Grade Levels" },
        ...filterData.gradeLevels.map((gl) => ({
          value: String(gl.id),
          label: formatGradeLevelLabel(gl.name),
        })),
      ];
    }
    return [
      { value: "all", label: "All Grade Levels" },
      { value: "1", label: "Grade 7" },
      { value: "2", label: "Grade 8" },
      { value: "3", label: "Grade 9" },
      { value: "4", label: "Grade 10" },
    ];
  }, [filterData]);

  // Sections filtered by selected Grade Level
  const filteredSections = useMemo(() => {
    const list = filterData?.sections || [
      { sectionId: 1, sectionName: "Mahogany", gradeLevelId: 1, gradeLevelName: "G7" },
      { sectionId: 2, sectionName: "Narra", gradeLevelId: 1, gradeLevelName: "G7" },
      { sectionId: 7, sectionName: "Molave", gradeLevelId: 1, gradeLevelName: "G7" },
      { sectionId: 17, sectionName: "Tanguile", gradeLevelId: 1, gradeLevelName: "G7" },
      { sectionId: 8, sectionName: "Honesty", gradeLevelId: 2, gradeLevelName: "G8" },
      { sectionId: 9, sectionName: "Fortitude", gradeLevelId: 2, gradeLevelName: "G8" },
      { sectionId: 10, sectionName: "Wisdom", gradeLevelId: 2, gradeLevelName: "G8" },
      { sectionId: 11, sectionName: "Opal", gradeLevelId: 3, gradeLevelName: "G9" },
      { sectionId: 12, sectionName: "Sapphire", gradeLevelId: 3, gradeLevelName: "G9" },
      { sectionId: 13, sectionName: "Emerald", gradeLevelId: 3, gradeLevelName: "G9" },
      { sectionId: 14, sectionName: "Jupiter", gradeLevelId: 4, gradeLevelName: "G10" },
      { sectionId: 15, sectionName: "Saturn", gradeLevelId: 4, gradeLevelName: "G10" },
      { sectionId: 16, sectionName: "Venus", gradeLevelId: 4, gradeLevelName: "G10" },
    ];

    if (selectedGradeLevelId === "all") return list;
    return list.filter(
      (sec) => String(sec.gradeLevelId) === String(selectedGradeLevelId)
    );
  }, [filterData, selectedGradeLevelId]);

  const sectionOptions = useMemo(() => {
    return filteredSections.map((sec) => ({
      value: String(sec.sectionId),
      label: `${formatGradeLevelLabel(sec.gradeLevelName)} - ${sec.sectionName}`,
    }));
  }, [filteredSections]);

  const handleSchoolYearChange = (syId) => {
    setSelectedSchoolYearId(syId);
  };

  const handleGradeLevelChange = (glId) => {
    setSelectedGradeLevelId(glId);
    const newFiltered =
      glId === "all"
        ? filterData?.sections || []
        : (filterData?.sections || []).filter(
            (sec) => String(sec.gradeLevelId) === String(glId)
          );
    if (newFiltered.length > 0) {
      const stillValid = newFiltered.some(
        (sec) => String(sec.sectionId) === String(selectedSectionId)
      );
      if (!stillValid) {
        setSelectedSectionId(String(newFiltered[0].sectionId));
      }
    }
  };

  const handleSectionChange = (secId) => {
    setSelectedSectionId(secId);
  };

  // Determine current active section name and grade level
  const currentSectionMeta = useMemo(() => {
    const found = filteredSections.find(
      (s) => String(s.sectionId) === String(selectedSectionId)
    );
    if (found) {
      return {
        sectionName: found.sectionName,
        gradeLevel: formatGradeLevelLabel(found.gradeLevelName),
      };
    }
    return {
      sectionName: recordData?.section?.name || "Mahogany",
      gradeLevel: formatGradeLevelLabel(recordData?.section?.gradeLevel || "Grade 7"),
    };
  }, [filteredSections, selectedSectionId, recordData]);

  // Students list: Use actual students from backend, or placeholder blank rows so the table is ALWAYS visible
  const activeStudents = useMemo(() => {
    if (recordData?.students && recordData.students.length > 0) {
      return recordData.students;
    }
    return DEFAULT_EMPTY_ROWS;
  }, [recordData?.students]);

  // Search filter (by student name or LRN)
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return activeStudents;
    return activeStudents.filter(
      (st) =>
        (st.displayName && st.displayName.toLowerCase().includes(query)) ||
        `${st.firstName || ""} ${st.lastName || ""}`.toLowerCase().includes(query) ||
        (st.lrn && String(st.lrn).toLowerCase().includes(query))
    );
  }, [activeStudents, searchQuery]);

  const groupedStudents = useMemo(() => {
    const males = [];
    const females = [];
    const unspecified = [];
    for (const student of filteredStudents) {
      if (student.sex === "M") males.push(student);
      else if (student.sex === "F") females.push(student);
      else unspecified.push(student);
    }
    return { males, females, unspecified };
  }, [filteredStudents]);

  // Strictly Department-Specific Subject: English
  const subjects = useMemo(() => {
    if (recordData?.subjects && recordData.subjects.length > 0) {
      return recordData.subjects;
    }
    return [{ key: "english", code: "ENG", label: "English", available: true }];
  }, [recordData]);

  const submissionDeadline = useMemo(
    () => formatSubmissionDeadline(recordData?.terms),
    [recordData?.terms]
  );

  // Download Handler (Excel XLSX)
  const handleDownload = async () => {
    if (!selectedSectionId || isDownloading) return;
    setIsDownloading(true);
    try {
      const { blob, filename } = await downloadDeptClassRecord({
        sectionId: selectedSectionId,
        schoolYearId: selectedSchoolYearId,
        userId: effectiveUserId,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setToast({
        message: "Department class record spreadsheet downloaded successfully.",
        variant: "success",
        icon: FileSpreadsheet,
      });
    } catch (err) {
      setToast({
        message: err.message || "Failed to download class record spreadsheet.",
        variant: "error",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Group Header Row
  const renderGroupHeader = (label, key) => (
    <tr key={`group-${key}`} className="ms-group-header-row">
      <td
        colSpan={1 + subjects.length * 4 + 1}
        className="ms-group-header-cell"
      >
        {label}
      </td>
    </tr>
  );

  // Student Rows (Strictly View Mode: Plain Text Cells)
  const renderStudentRows = (studentList, groupKey) => {
    if (!studentList.length) {
      return (
        <tr key={`empty-${groupKey}`} className="ms-empty-group-row">
          <td
            colSpan={1 + subjects.length * 4 + 1}
            className="ms-empty-group-cell"
          >
            No {groupKey} learners match this search.
          </td>
        </tr>
      );
    }

    return studentList.map((student, index) => (
      <tr
        key={student.studentId || student.studentSectionId || `row-${index}`}
        className="ms-student-row"
      >
        <td className="ms-name-cell">
          <span className="ms-name-cell__index">{index + 1}.</span>
          <span className="ms-name-cell__label">
            {student.displayName && student.displayName !== "—"
              ? student.displayName
              : student.isPlaceholder
              ? ""
              : "—"}
          </span>
          {student.lrn && student.lrn !== "—" && (
            <span style={{ display: "block", fontSize: "0.72rem", color: "#8a99ad", marginTop: "2px" }}>
              LRN: {student.lrn}
            </span>
          )}
        </td>

        {subjects.map((subject) => {
          const grades = student.grades?.[subject.key] || {
            terms: [null, null, null],
            finalGrade: null,
          };
          return (
            <Fragment
              key={`${student.studentId || student.studentSectionId}-${subject.key}`}
            >
              {grades.terms.map((grade, termIdx) => (
                <td
                  key={`${subject.key}-term-${termIdx + 1}`}
                  className="ms-grade-cell"
                >
                  {grade !== null && grade !== undefined ? grade : "—"}
                </td>
              ))}
              <td className="ms-final-cell">
                {grades.finalGrade !== null && grades.finalGrade !== undefined
                  ? grades.finalGrade
                  : "—"}
              </td>
            </Fragment>
          );
        })}

        <td className="ms-gen-avg-cell">
          {student.generalAverage !== null && student.generalAverage !== undefined
            ? student.generalAverage
            : "—"}
        </td>
      </tr>
    ));
  };

  const isRefreshing = isLoadingRecord && Boolean(recordData);

  return (
    <div className="ms-container" aria-busy={isRefreshing}>
      <Toast toast={toast} setToast={setToast} />

      {/* 1. Header & Selectors (Redundant notification bell button with label 7 is removed) */}
      <div className="ms-page-header">
        <div>
          <p className="ms-page-eyebrow">Department Head Report · {departmentName}</p>
          <h1>
            {currentSectionMeta.gradeLevel} - {currentSectionMeta.sectionName}
          </h1>
          <p>
            {currentSectionMeta.gradeLevel} · SY{" "}
            {recordData?.schoolYear?.label ||
              schoolYearOptions.find((o) => o.value === selectedSchoolYearId)?.label ||
              "2026-2027"}{" "}
            · {departmentName} Department
          </p>
        </div>

        {/* Dropdown Filters: School Year, Year Level (Grade Level), Section */}
        <div
          className="ms-selectors"
          aria-label="Department Head class record filters"
        >
          <div className="ms-selector-field">
            <span>School year</span>
            <DropdownSelect
              label="School year"
              value={selectedSchoolYearId}
              options={schoolYearOptions}
              onChange={handleSchoolYearChange}
              disabled={isRefreshing}
            />
          </div>

          <div className="ms-selector-field">
            <span>Year level</span>
            <DropdownSelect
              label="Year level"
              value={selectedGradeLevelId}
              options={gradeLevelOptions}
              onChange={handleGradeLevelChange}
              disabled={isRefreshing}
            />
          </div>

          <div className="ms-selector-field">
            <span>Section</span>
            <DropdownSelect
              label="Section"
              value={selectedSectionId}
              options={sectionOptions}
              onChange={handleSectionChange}
              disabled={isRefreshing}
            />
          </div>
        </div>
      </div>

      {/* 2. Controls Row: Dropdown counters, Search bar, and Download button */}
      <div
        className={`ms-sheet-content ${isRefreshing ? "ms-sheet-content--busy" : ""}`}
      >
        {isRefreshing && (
          <div className="ms-refresh-overlay" role="status" aria-live="polite">
            <LoaderCircle size={20} className="ms-spin" aria-hidden="true" />
            <span>Loading class record…</span>
          </div>
        )}

        <div className="ms-controls-row">
          {/* Dropdown counters */}
          <div className="ms-summary">
            <span className="ms-summary__metric">
              <strong>{recordData?.students ? filteredStudents.length : 0}</strong>
              <span>Learners</span>
            </span>
            <span className="ms-summary__metric">
              <strong>{recordData?.completeness?.completedTermGrades ?? 0}</strong>/
              <strong>{recordData?.completeness?.expectedTermGrades ?? (activeStudents.length * 3)}</strong>
              <span>Term grades complete</span>
            </span>
          </div>

          {/* Actions: Search bar and Download button */}
          <div className="ms-control-actions">
            <fieldset
              className="ms-search-fieldset"
              disabled={isRefreshing}
            >
              <SearchBar
                query={searchQuery}
                setQuery={setSearchQuery}
                placeholder="Search by student name or LRN..."
              />
            </fieldset>

            <button
              type="button"
              className="ms-download-btn"
              onClick={handleDownload}
              disabled={isDownloading || isRefreshing}
              title="Download official XLSX spreadsheet"
            >
              {isDownloading ? (
                <LoaderCircle
                  size={17}
                  className="ms-spin"
                  aria-hidden="true"
                />
              ) : (
                <Download size={17} aria-hidden="true" />
              )}
              <span>{isDownloading ? "Preparing…" : "Download XLSX"}</span>
            </button>
          </div>
        </div>

        {/* 3. Class Record Table: ALWAYS DISPLAYED with columns and rows */}
        <div className="ms-table-wrapper">
          <table className="ms-table">
            <thead>
              <tr className="ms-header-row-1">
                <th className="ms-name-header-cell" rowSpan={3}>
                  Names of Learners
                </th>
                {subjects.map((subject) => (
                  <th
                    key={subject.key}
                    colSpan={4}
                    className="ms-subject-header"
                  >
                    {subject.label}
                  </th>
                ))}
                <th rowSpan={3} className="ms-gen-avg-header">
                  General Average
                </th>
              </tr>
              <tr className="ms-header-row-2">
                {subjects.map((subject) => (
                  <Fragment key={subject.key}>
                    <th colSpan={3} className="ms-term-group-header">
                      Term
                    </th>
                    <th rowSpan={2} className="ms-fg-header-cell">
                      Final Grade
                    </th>
                  </Fragment>
                ))}
              </tr>
              <tr className="ms-header-row-3">
                {subjects.map((subject) => (
                  <Fragment key={subject.key}>
                    <th className="ms-term-cell">1</th>
                    <th className="ms-term-cell">2</th>
                    <th className="ms-term-cell">3</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderGroupHeader("Male", "male")}
              {renderStudentRows(groupedStudents.males, "male")}
              {renderGroupHeader("Female", "female")}
              {renderStudentRows(groupedStudents.females, "female")}
              {groupedStudents.unspecified.length > 0 && (
                <>
                  {renderGroupHeader("Unspecified", "unspecified")}
                  {renderStudentRows(
                    groupedStudents.unspecified,
                    "unspecified"
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Footer with Deadline indicator (Strictly View Mode: No Save, Edit, or Submit buttons) */}
        <footer className="ms-submission-footer">
          <div className="ms-submission-footer__copy">
            <span className="ms-submission-footer__icon" aria-hidden="true">
              <FileSpreadsheet size={19} />
            </span>
            <div>
              <strong>Deadline: {submissionDeadline}</strong>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

