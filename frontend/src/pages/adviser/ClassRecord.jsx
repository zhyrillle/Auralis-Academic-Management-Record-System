import React, { useMemo, useState } from "react";
import backIconUrl from "../../assets/backButton.svg";
import unavailableIconUrl from "../../assets/adviser-assets/unavailableicon.png";
import "../../styles/ClassRecord.css";

const MOCK_STUDENTS = [
  {
    id: "s1",
    lrn: "145783920614",
    firstName: "Alex Matthew",
    lastName: "Cruz",
    sex: "M",
  },
  {
    id: "s2",
    lrn: "238691475820",
    firstName: "Joshua Carlo",
    lastName: "Ramirez",
    sex: "M",
  },
  {
    id: "s3",
    lrn: "564920183747",
    firstName: "Daniel Joseph",
    lastName: "Reyes",
    sex: "M",
  },
  {
    id: "s4",
    lrn: "392748561830",
    firstName: "Adrian Kyle",
    lastName: "Santos",
    sex: "M",
  },
  {
    id: "s5",
    lrn: "817345629104",
    firstName: "Zachary James",
    lastName: "Villanueva",
    sex: "M",
  },
  {
    id: "s6",
    lrn: "472918365104",
    firstName: "Nathaniel John",
    lastName: "Garcia",
    sex: "M",
  },
  {
    id: "s7",
    lrn: "583027194658",
    firstName: "Miguel Andre",
    lastName: "Dela Cruz",
    sex: "M",
  },
  {
    id: "s8",
    lrn: "694135820477",
    firstName: "Patrick Luis",
    lastName: "Mendoza",
    sex: "M",
  },
  {
    id: "s9",
    lrn: "715284639501",
    firstName: "Christian Paolo",
    lastName: "Torres",
    sex: "M",
  },
  {
    id: "s10",
    lrn: "826395740612",
    firstName: "Gabriel Miguel",
    lastName: "Navarro",
    sex: "M",
  },

  {
    id: "s11",
    lrn: "937406851723",
    firstName: "Bianca Mae",
    lastName: "Santos",
    sex: "F",
  },
  {
    id: "s12",
    lrn: "148517962834",
    firstName: "Erika Nicole",
    lastName: "Mendoza",
    sex: "F",
  },
  {
    id: "s13",
    lrn: "259628073945",
    firstName: "Sophia Mae",
    lastName: "Rivera",
    sex: "F",
  },
  {
    id: "s14",
    lrn: "360739184056",
    firstName: "Trisha Anne",
    lastName: "Torres",
    sex: "F",
  },
  {
    id: "s15",
    lrn: "471840295167",
    firstName: "Maria Angelica",
    lastName: "Reyes",
    sex: "F",
  },
  {
    id: "s16",
    lrn: "582951306278",
    firstName: "Isabella Grace",
    lastName: "Garcia",
    sex: "F",
  },
  {
    id: "s17",
    lrn: "693062417389",
    firstName: "Nicole Andrea",
    lastName: "Dela Cruz",
    sex: "F",
  },
  {
    id: "s18",
    lrn: "704173528490",
    firstName: "Camille Rose",
    lastName: "Navarro",
    sex: "F",
  },
  {
    id: "s19",
    lrn: "815284639501",
    firstName: "Julia Marie",
    lastName: "Fernandez",
    sex: "F",
  },
  {
    id: "s20",
    lrn: "926395740612",
    firstName: "Gabrielle Anne",
    lastName: "Villanueva",
    sex: "F",
  },
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

export default function ClassRecord({ activeClass, onBack }) {
  // ============================================================
  // TERM
  // ============================================================

  const [activeTerm, setActiveTerm] = useState("T1");

  // ============================================================
  // DYNAMIC COLUMNS
  // ============================================================

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

  // ============================================================
  // GRADES
  // ============================================================

  const [grades, setGrades] = useState(() =>
    createGradeState(MOCK_STUDENTS)
  );

  // ============================================================
  // STUDENTS
  // ============================================================

  const maleStudents = useMemo(
    () => MOCK_STUDENTS.filter((student) => student.sex === "M"),
    []
  );

  const femaleStudents = useMemo(
    () => MOCK_STUDENTS.filter((student) => student.sex === "F"),
    []
  );

  // ============================================================
  // ADD WRITTEN WORK COLUMN
  // ============================================================

  const handleAddWrittenWork = () => {
    setWrittenWorkColumns((previous) => [
      ...previous,
      {
        id: `ww${previous.length + 1}`,
        label: String(previous.length + 1),
      },
    ]);
  };

  // ============================================================
  // ADD PERFORMANCE TASK COLUMN
  // ============================================================

  const handleAddPerformanceTask = () => {
    setPerformanceTaskColumns((previous) => [
      ...previous,
      {
        id: `pt${previous.length + 1}`,
        label: String(previous.length + 1),
      },
    ]);
  };

  // ============================================================
  // UPDATE GRADE
  // ============================================================

  const handleGradeChange = (
    studentId,
    category,
    columnId,
    value
  ) => {
    setGrades((previous) => ({
      ...previous,
      [studentId]: {
        ...previous[studentId],
        [category]: {
          ...previous[studentId][category],
          [columnId]: value,
        },
      },
    }));
  };

  // ============================================================
  // UPDATE SINGLE GRADE
  // ============================================================

  const handleSingleGradeChange = (
    studentId,
    field,
    value
  ) => {
    setGrades((previous) => ({
      ...previous,
      [studentId]: {
        ...previous[studentId],
        [field]: value,
      },
    }));
  };

  const isAvailable = activeTerm === "T1";

  const sectionName =
    activeClass?.sectionName || "Gemelina";

  return (
    <div className="class-record-page">

      <div className="class-record-header">

        <div className="class-record-title-area">

          <button
            className="class-record-back-btn"
            onClick={onBack}
            type="button"
            aria-label="Back"
          >
            <img
              src={backIconUrl}
              alt="Back"
            />
          </button>

          <h1>Assigned Classes</h1>

        </div>

      </div>

      <div className="class-record-subheader">

        <div>
          <h2>
            Section: {sectionName}
          </h2>

          <p>
            Input and manage student grades per term
          </p>
        </div>


{/* ACTIONS + TERM BUTTONS */}

<div className="class-record-actions">

  {/* ATTENDANCE */}

  <button
    type="button"
    className="class-record-action-btn attendance-btn"
    onClick={() => {
      // UI only for now
      alert("Attendance page coming soon by the one and only nekaneks.");
    }}
  >
    <span className="action-icon">▰</span>
    Attendance
  </button>

  {/* DOWNLOAD */}

  <button
    type="button"
    className="class-record-action-btn download-btn"
    onClick={() => {
      // UI only for now
      alert("Download feature coming soon.");
    }}
  >
    <span className="action-icon">↓</span>
    Download
  </button>

  {/* TERMS */}

  <div className="term-buttons">

    <button
      type="button"
      className={
        activeTerm === "T1"
          ? "term-btn active"
          : "term-btn"
      }
      onClick={() => setActiveTerm("T1")}
    >
      T1
    </button>

    <button
      type="button"
      className={
        activeTerm === "T2"
          ? "term-btn active"
          : "term-btn"
      }
      onClick={() => setActiveTerm("T2")}
    >
      T2
    </button>

    <button
      type="button"
      className={
        activeTerm === "T3"
          ? "term-btn active"
          : "term-btn"
      }
      onClick={() => setActiveTerm("T3")}
    >
      T3
    </button>

  </div>

</div>

      </div>

      {/* ======================================================
          UNAVAILABLE STATE
      ====================================================== */}

      {!isAvailable ? (
        <div className="unavailable-state">

          <img
            src={unavailableIconUrl}
            alt="Unavailable"
            className="unavailable-icon"
          />

          <h3>
            This grading term is currently unavailable.
          </h3>

          <p>
            Access will be enabled once the official
            grading period begins.
          </p>

        </div>
      ) : (

        /* ====================================================
           T1 CLASS RECORD
        ==================================================== */

        <div className="class-record-content">

          {/* TOTAL STUDENTS */}

          <div className="student-count">
            Total Students: {MOCK_STUDENTS.length}
          </div>

          {/* ==================================================
              TABLE
          ================================================== */}

          <div className="class-record-table-wrapper">

            <table className="class-record-table">

              {/* =================================================
                  TABLE HEADER
              ================================================= */}

              <thead>

                {/* MAIN HEADER */}

                <tr>

                  <th
                    rowSpan="2"
                    className="number-header"
                  >
                    No.
                  </th>

                  <th
                    rowSpan="2"
                    className="lrn-header"
                  >
                    LRN
                  </th>

                  <th
                    rowSpan="2"
                    className="name-header"
                  >
                    Learners' Name
                  </th>

                  {/* WRITTEN WORKS */}

                  <th
                    colSpan={
                      writtenWorkColumns.length + 3
                    }
                    className="category-header"
                  >
                    <div className="category-title">

                      <span>
                        Written Works (30%)
                      </span>

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
                    colSpan={
                      performanceTaskColumns.length + 3
                    }
                    className="category-header"
                  >
                    <div className="category-title">

                      <span>
                        Performance Tasks (50%)
                      </span>

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

                  <th
                    colSpan="3"
                    className="category-header"
                  >
                    Quarterly Assessment (20%)
                  </th>

                  {/* FINAL GRADES */}

                  <th
                    rowSpan="2"
                    className="grade-header"
                  >
                    Initial
                    <br />
                    Grade
                  </th>

                  <th
                    rowSpan="2"
                    className="grade-header"
                  >
                    Quarterly
                    <br />
                    Grade
                  </th>

                </tr>

                {/* SUB HEADER */}

                <tr>

                  {/* WRITTEN WORKS */}

                  {writtenWorkColumns.map((column) => (
                    <th
                      key={column.id}
                      className="sub-header"
                    >
                      {column.label}
                    </th>
                  ))}

                  <th className="sub-header total-header">
                    Total
                  </th>

                  <th className="sub-header">
                    PS
                  </th>

                  <th className="sub-header">
                    WS
                  </th>

                  {/* PERFORMANCE TASKS */}

                  {performanceTaskColumns.map((column) => (
                    <th
                      key={column.id}
                      className="sub-header"
                    >
                      {column.label}
                    </th>
                  ))}

                  <th className="sub-header total-header">
                    Total
                  </th>

                  <th className="sub-header">
                    PS
                  </th>

                  <th className="sub-header">
                    WS
                  </th>

                  {/* QUARTERLY ASSESSMENT */}

                  <th className="sub-header">
                    1
                  </th>

                  <th className="sub-header">
                    PS
                  </th>

                  <th className="sub-header">
                    WS
                  </th>

                </tr>

              </thead>

              {/* =================================================
                  TABLE BODY
              ================================================= */}

              <tbody>

                {/* =================================================
                    MALE IDENTIFIER
                ================================================= */}

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

                {/* MALE STUDENTS */}

                {maleStudents.map(
                  (student, index) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      number={index + 1}
                      grades={grades}
                      writtenWorkColumns={
                        writtenWorkColumns
                      }
                      performanceTaskColumns={
                        performanceTaskColumns
                      }
                      handleGradeChange={
                        handleGradeChange
                      }
                      handleSingleGradeChange={
                        handleSingleGradeChange
                      }
                    />
                  )
                )}

                {/* =================================================
                    FEMALE IDENTIFIER
                ================================================= */}

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

                {/* FEMALE STUDENTS */}

                {femaleStudents.map(
                  (student, index) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      number={
                        maleStudents.length +
                        index +
                        1
                      }
                      grades={grades}
                      writtenWorkColumns={
                        writtenWorkColumns
                      }
                      performanceTaskColumns={
                        performanceTaskColumns
                      }
                      handleGradeChange={
                        handleGradeChange
                      }
                      handleSingleGradeChange={
                        handleSingleGradeChange
                      }
                    />
                  )
                )}

              </tbody>

            </table>

          </div>

        </div>
      )}

    </div>
  );
}

// ============================================================
// STUDENT ROW
// ============================================================

function StudentRow({
  student,
  number,
  grades,
  writtenWorkColumns,
  performanceTaskColumns,
  handleGradeChange,
  handleSingleGradeChange,
}) {
  const studentGrades =
    grades[student.id] || {};

  return (
    <tr className="student-row">

      {/* NUMBER */}

      <td className="number-cell">
        {number}
      </td>

      {/* LRN */}

      <td className="lrn-cell">
        {student.lrn}
      </td>

      {/* NAME */}

      <td className="name-cell">
        {student.firstName}{" "}
        {student.lastName}
      </td>

      {/* ======================================================
          WRITTEN WORKS
      ====================================================== */}

      {writtenWorkColumns.map((column) => (
        <td
          key={column.id}
          className="grade-input-cell"
        >
          <input
            type="number"
            min="0"
            max="100"
            value={
              studentGrades.writtenWorks?.[
                column.id
              ] || ""
            }
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

      <td className="computed-cell">
        -
      </td>

      <td className="computed-cell">
        -
      </td>

      <td className="computed-cell">
        -
      </td>

      {/* ======================================================
          PERFORMANCE TASKS
      ====================================================== */}

      {performanceTaskColumns.map((column) => (
        <td
          key={column.id}
          className="grade-input-cell"
        >
          <input
            type="number"
            min="0"
            max="100"
            value={
              studentGrades.performanceTasks?.[
                column.id
              ] || ""
            }
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

      <td className="computed-cell">
        -
      </td>

      <td className="computed-cell">
        -
      </td>

      <td className="computed-cell">
        -
      </td>

      {/* ======================================================
          QUARTERLY ASSESSMENT
      ====================================================== */}

      <td className="grade-input-cell">
        <input
          type="number"
          min="0"
          max="100"
          value={
            studentGrades.quarterlyAssessment ||
            ""
          }
          onChange={(e) =>
            handleSingleGradeChange(
              student.id,
              "quarterlyAssessment",
              e.target.value
            )
          }
        />
      </td>

      <td className="computed-cell">
        -
      </td>

      <td className="computed-cell">
        -
      </td>

      {/* ======================================================
          INITIAL GRADE
      ====================================================== */}

      <td className="grade-input-cell final-grade-cell">
        <input
          type="number"
          min="0"
          max="100"
          value={
            studentGrades.initialGrade || ""
          }
          onChange={(e) =>
            handleSingleGradeChange(
              student.id,
              "initialGrade",
              e.target.value
            )
          }
        />
      </td>

      {/* ======================================================
          QUARTERLY GRADE
      ====================================================== */}

      <td className="grade-input-cell final-grade-cell">
        <input
          type="number"
          min="0"
          max="100"
          value={
            studentGrades.quarterlyGrade || ""
          }
          onChange={(e) =>
            handleSingleGradeChange(
              student.id,
              "quarterlyGrade",
              e.target.value
            )
          }
        />
      </td>

    </tr>
  );
}