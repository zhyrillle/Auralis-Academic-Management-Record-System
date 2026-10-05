import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Cloud, CloudOff, RefreshCw } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import backIconUrl from "../../assets/backButton.svg";
import depedLogoUrl from "../../assets/deped_logo.png";
import gccnhsLogoUrl from "../../assets/gccnhs_logo.png";
import { getClassRecord, API_BASE_URL } from "../../services/classRecordApi";
import { getPhilIriRecords, savePhilIriBatch } from "../../services/philIriApi";
import { getStoredUser } from "../../utils/auth";
import "../../styles/PhilIriPage.css";

// DepEd PHIL-IRI Evaluation Functions
function computeOralReadingLevel(wordsCorrect, totalWords) {
  if (wordsCorrect === "" || wordsCorrect === null || wordsCorrect === undefined) return "";
  const num = Number(wordsCorrect);
  if (isNaN(num) || num < 0) return "";
  const pct = (num / totalWords) * 100;
  if (pct >= 97) return "INDEPENDENT";
  if (pct >= 90) return "INSTRUCTIONAL";
  return "FRUSTRATION";
}

function computeComprehensionLevel(correctAnswers, totalItems) {
  if (correctAnswers === "" || correctAnswers === null || correctAnswers === undefined) return "";
  const num = Number(correctAnswers);
  if (isNaN(num) || num < 0) return "";
  const pct = (num / totalItems) * 100;
  if (pct >= 80) return "INDEPENDENT";
  if (pct >= 59) return "INSTRUCTIONAL";
  return "FRUSTRATION";
}

function computeOverallReadingLevel(oralLevel, compLevel) {
  if (!oralLevel && !compLevel) return "";
  const o = (oralLevel || "").toUpperCase();
  const c = (compLevel || "").toUpperCase();

  if (o === "INDEPENDENT" && c === "INDEPENDENT") return "INDEPENDENT";
  if (o === "INDEPENDENT" && (c === "INSTRUCTIONAL" || c === "FRUSTRATION")) return "INSTRUCTIONAL";
  if (o === "INSTRUCTIONAL" && (c === "INDEPENDENT" || c === "INSTRUCTIONAL")) return "INSTRUCTIONAL";
  if (o === "INSTRUCTIONAL" && c === "FRUSTRATION") return "FRUSTRATION";
  if (o === "FRUSTRATION" && c === "INDEPENDENT") return "INSTRUCTIONAL";
  if (o === "FRUSTRATION" && (c === "INSTRUCTIONAL" || c === "FRUSTRATION")) return "FRUSTRATION";

  return o || c || "";
}

function formatPercent(num, denom) {
  if (num === "" || num === null || num === undefined) return "";
  const n = Number(num);
  if (isNaN(n) || n < 0 || !denom) return "";
  const pct = (n / denom) * 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`;
}

export default function PhilIri({ activeClass: propActiveClass, onBack }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = getStoredUser();

  const activeClass = useMemo(() => {
    return propActiveClass || location.state?.activeClass || location.state?.activeSelectedClass || {};
  }, [propActiveClass, location.state]);

  const sectionId = useMemo(() => {
    return (
      activeClass?.section_id ||
      activeClass?.sectionId ||
      location.state?.section_id ||
      (typeof activeClass?.id === "number" ? activeClass.id : null) ||
      (typeof activeClass?.id === "string" && !isNaN(Number(activeClass.id)) ? Number(activeClass.id) : null) ||
      (typeof activeClass?.id === "string" && activeClass.id.startsWith("sec-") ? Number(activeClass.id.replace("sec-", "")) : null) ||
      null
    );
  }, [activeClass, location.state]);

  const subjectOfferingId = useMemo(() => {
    return (
      activeClass?.subject_offering_id ||
      activeClass?.offering_id ||
      location.state?.subject_offering_id ||
      sectionId ||
      1
    );
  }, [activeClass, location.state, sectionId]);

  // Assessment & Test Type State
  const [testType, setTestType] = useState("PRE_TEST"); // 'PRE_TEST' | 'POST_TEST'
  const [passageWordsCount, setPassageWordsCount] = useState(70);
  const [totalCompItems, setTotalCompItems] = useState(5);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [syncStatus, setSyncStatus] = useState("saved"); // 'saving' | 'saved' | 'offline'
  const [isDownloading, setIsDownloading] = useState(false);
  const [classMeta, setClassMeta] = useState(null);
  const [coordinatorInfo, setCoordinatorInfo] = useState({
    name: "",
    role: "Master Teacher II - English Department Coordinator",
  });
  const sheetRef = useRef(null);
  const isLoadedRef = useRef(false);
  const debounceTimerRef = useRef(null);

  // Fetch English Department Coordinator dynamically from database on mount
  useEffect(() => {
    let isCurrent = true;
    fetch(`${API_BASE_URL}/phil-iri/coordinator/english`)
      .then((res) => res.json())
      .then((data) => {
        if (!isCurrent) return;
        if (data.coordinator && data.coordinator.name) {
          setCoordinatorInfo(data.coordinator);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch English Department Coordinator from DB:", err);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  // 1. Fetch Students & Class Metadata
  useEffect(() => {
    let isCurrent = true;
    if (subjectOfferingId || sectionId) {
      getClassRecord(subjectOfferingId, "T1", sectionId)
        .then((data) => {
          if (!isCurrent || !data) return;
          if (Array.isArray(data.students)) {
            setStudents(
              data.students.map((st) => ({
                id: String(st.student_id),
                student_id: st.student_id,
                student_section_id: st.student_section_id,
                lrn: st.LRN,
                firstName: st.first_name,
                lastName: st.last_name,
                middleName: st.middle_name,
                sex: st.sex,
              }))
            );
          }
          if (data.class_context) {
            setClassMeta(data.class_context);
          }
        })
        .catch((err) => {
          console.warn("Could not pre-populate student roster from class record API:", err);
        });
    }
    return () => {
      isCurrent = false;
    };
  }, [subjectOfferingId, sectionId]);

  // 2. Load PHIL-IRI Scores for Current Test Type
  useEffect(() => {
    let isCurrent = true;
    isLoadedRef.current = false;
    if (sectionId) {
      getPhilIriRecords(sectionId, testType, subjectOfferingId)
        .then((res) => {
          if (!isCurrent) return;
          if (res.passageWordsCount) setPassageWordsCount(res.passageWordsCount);
          if (res.totalCompItems) setTotalCompItems(res.totalCompItems);
          if (res.coordinator) {
            setCoordinatorInfo(res.coordinator);
          }

          const newScores = {};
          if (Array.isArray(res.records)) {
            res.records.forEach((r) => {
              const key = String(r.student_section_id || r.student_id);
              newScores[key] = {
                wordsCorrect: r.words_correct !== undefined && r.words_correct !== null ? r.words_correct : "",
                correctAnswers: r.comp_correct !== undefined && r.comp_correct !== null ? r.comp_correct : "",
              };
            });
          }
          setScores(newScores);
          setSyncStatus(res.tableReady ? "saved" : "offline");
          setTimeout(() => {
            isLoadedRef.current = true;
          }, 400);
        })
        .catch((err) => {
          console.warn("Error fetching PHIL-IRI scores:", err);
        });
    }
    return () => {
      isCurrent = false;
    };
  }, [sectionId, testType, subjectOfferingId]);

  // Group and sort students safely
  const { maleStudents, femaleStudents } = useMemo(() => {
    if (!Array.isArray(students)) return { maleStudents: [], femaleStudents: [] };
    const isMale = (s) => Boolean(s && String(s.sex || "M").toUpperCase().startsWith("M"));
    const isFemale = (s) => Boolean(s && String(s.sex || "M").toUpperCase().startsWith("F"));

    const sortFn = (a, b) => {
      const lastA = (a?.lastName || a?.last_name || "").toUpperCase();
      const lastB = (b?.lastName || b?.last_name || "").toUpperCase();
      if (lastA !== lastB) return lastA.localeCompare(lastB);
      const firstA = (a?.firstName || a?.first_name || "").toUpperCase();
      const firstB = (b?.firstName || b?.first_name || "").toUpperCase();
      return firstA.localeCompare(firstB);
    };

    return {
      maleStudents: students.filter(isMale).sort(sortFn),
      femaleStudents: students.filter(isFemale).sort(sortFn),
    };
  }, [students]);

  // Handle score cell input
  const handleScoreChange = (studentSecId, field, value) => {
    setScores((prev) => ({
      ...prev,
      [studentSecId]: {
        ...(prev[studentSecId] || {}),
        [field]: value,
      },
    }));
  };

  // Compile computed student data
  const computedStudentData = useMemo(() => {
    const map = {};
    const process = (list) => {
      list.forEach((st) => {
        if (!st) return;
        const secId = String(st.student_section_id || st.student_id);
        const rowScore = scores[secId] || {};
        const wordsCorrect = rowScore.wordsCorrect ?? "";
        const correctAnswers = rowScore.correctAnswers ?? "";

        const oralPct = formatPercent(wordsCorrect, passageWordsCount);
        const oralLevel = computeOralReadingLevel(wordsCorrect, passageWordsCount);

        const compPct = formatPercent(correctAnswers, totalCompItems);
        const compLevel = computeComprehensionLevel(correctAnswers, totalCompItems);

        const overallLevel = computeOverallReadingLevel(oralLevel, compLevel);

        map[secId] = {
          wordsCorrect,
          oralPct,
          oralLevel,
          correctAnswers,
          compPct,
          compLevel,
          overallLevel,
        };
      });
    };

    process(maleStudents);
    process(femaleStudents);
    return map;
  }, [scores, maleStudents, femaleStudents, passageWordsCount, totalCompItems]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    const counts = {
      boys: { INDEPENDENT: 0, INSTRUCTIONAL: 0, FRUSTRATION: 0 },
      girls: { INDEPENDENT: 0, INSTRUCTIONAL: 0, FRUSTRATION: 0 },
    };

    maleStudents.forEach((st) => {
      if (!st) return;
      const secId = String(st.student_section_id || st.student_id);
      const lvl = computedStudentData[secId]?.overallLevel;
      if (lvl && counts.boys[lvl] !== undefined) {
        counts.boys[lvl] += 1;
      }
    });

    femaleStudents.forEach((st) => {
      if (!st) return;
      const secId = String(st.student_section_id || st.student_id);
      const lvl = computedStudentData[secId]?.overallLevel;
      if (lvl && counts.girls[lvl] !== undefined) {
        counts.girls[lvl] += 1;
      }
    });

    return counts;
  }, [maleStudents, femaleStudents, computedStudentData]);

  // Save to DB / LocalStorage
  const handleSave = async () => {
    setSyncStatus("saving");

    const effectiveUserId = currentUser?.user_id || currentUser?.id || null;
    const effectiveSubjectOfferingId = classMeta?.subject_offering_id || subjectOfferingId || null;

    const recordsToSave = [];
    const allStudents = [...maleStudents, ...femaleStudents];

    allStudents.forEach((st) => {
      if (!st) return;
      const secId = String(st.student_section_id || st.student_id);
      const computed = computedStudentData[secId] || {};

      if (computed.wordsCorrect !== "" || computed.correctAnswers !== "") {
        recordsToSave.push({
          student_section_id: st.student_section_id || Number(st.student_id),
          subject_offering_id: effectiveSubjectOfferingId,
          test_type: testType,
          passage_words_count: Number(passageWordsCount),
          words_correct: computed.wordsCorrect !== "" ? Number(computed.wordsCorrect) : 0,
          oral_reading_percent: computed.wordsCorrect !== "" ? parseFloat(((Number(computed.wordsCorrect) / passageWordsCount) * 100).toFixed(2)) : 0.0,
          oral_reading_level: computed.oralLevel || "FRUSTRATION",
          total_comp_items: Number(totalCompItems),
          comp_correct: computed.correctAnswers !== "" ? Number(computed.correctAnswers) : 0,
          comp_score_percent: computed.correctAnswers !== "" ? parseFloat(((Number(computed.correctAnswers) / totalCompItems) * 100).toFixed(2)) : 0.0,
          comp_reading_level: computed.compLevel || "FRUSTRATION",
          overall_reading_level: computed.overallLevel || "FRUSTRATION",
          user_id: effectiveUserId,
        });
      }
    });

    if (recordsToSave.length === 0) {
      setSyncStatus("saved");
      return;
    }

    try {
      const res = await savePhilIriBatch({
        sectionId,
        subjectOfferingId: effectiveSubjectOfferingId,
        userId: effectiveUserId,
        testType,
        records: recordsToSave,
        passageWordsCount,
        totalCompItems,
      });

      setSyncStatus(res.tableReady ? "saved" : "offline");
    } catch (err) {
      console.warn("Save error:", err);
      setSyncStatus("offline");
    }
  };

  const handleInputBlur = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      handleSave();
    }
  };

  // Auto-save debounced effect on score input changes
  useEffect(() => {
    if (!isLoadedRef.current || !sectionId) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      handleSave();
    }, 600);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [scores, passageWordsCount, totalCompItems]);

  // Download PDF using html2canvas & jsPDF directly from sheetRef.current
  const handleDownloadPdf = async () => {
    if (!sheetRef.current || isDownloading) return;
    setIsDownloading(true);

    const testLabel = testType === "PRE_TEST" ? "PRE-TEST" : "POST-TEST";
    const secName = activeClass?.section_name || activeClass?.sectionName || classMeta?.section_name || "Section";
    const filename = `PHIL-IRI_ENGLISH_${testLabel}_${secName}.pdf`.replace(/\s+/g, "_");

    try {
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        imageTimeout: 15000,
        onclone: (clonedDoc) => {
          // In the cloned DOM that html2canvas renders internally,
          // replace input fields with clean text spans so typed scores are rendered crisp without outlines
          const inputs = clonedDoc.querySelectorAll(".phil-iri-table-input");
          inputs.forEach((input) => {
            const span = clonedDoc.createElement("span");
            span.textContent = input.value || "";
            span.style.display = "inline-block";
            span.style.width = "100%";
            span.style.textAlign = "center";
            span.style.fontFamily = "inherit";
            span.style.fontSize = "inherit";
            span.style.fontWeight = "bold";
            span.style.color = "#000000";
            if (input.parentNode) {
              input.parentNode.replaceChild(span, input);
            }
          });
        },
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 5;
      const printWidth = pdfWidth - margin * 2;
      const printHeight = (canvas.height * printWidth) / canvas.width;

      if (printHeight <= pdfHeight - margin * 2) {
        pdf.addImage(imgData, "PNG", margin, margin, printWidth, printHeight);
      } else {
        let heightLeft = printHeight;
        let position = margin;

        pdf.addImage(imgData, "PNG", margin, position, printWidth, printHeight);
        heightLeft -= (pdfHeight - margin * 2);

        while (heightLeft > 0) {
          position -= (pdfHeight - margin * 2);
          pdf.addPage();
          pdf.addImage(imgData, "PNG", margin, position, printWidth, printHeight);
          heightLeft -= (pdfHeight - margin * 2);
        }
      }

      pdf.save(filename);
    } catch (err) {
      console.error("Error generating PHIL-IRI PDF:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Metadata resolutions
  const rawTeacher =
    classMeta?.teacher_name ||
    activeClass?.teacher_name ||
    activeClass?.teacherName ||
    activeClass?.adviser ||
    (currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}` : "Ma. Lycil B. Bucio");
  const teacherDisplay = String(rawTeacher).toUpperCase();

  const sectionName =
    activeClass?.section_name ||
    activeClass?.sectionName ||
    classMeta?.section_name ||
    "Luna";
  const gradeLevel = activeClass?.gradeLevel || activeClass?.grade || classMeta?.grade_level || "7";
  const cleanGrade = String(gradeLevel).replace(/^grade\s*/i, "").replace(/^g/i, "").trim();
  const cleanSectionName = String(sectionName).replace(/^g\d+\s*-\s*/i, "").trim();
  const sectionDisplay = `G${cleanGrade || "7"} - ${cleanSectionName}`;

  const schoolYear = classMeta?.school_year_label || activeClass?.school_year || "2025 - 2026";
  const totalBoys = maleStudents.length;
  const totalGirls = femaleStudents.length;
  const totalEnrolment = totalBoys + totalGirls;

  const renderStudentRow = (student, index) => {
    if (!student) return null;
    const secId = String(student.student_section_id || student.student_id);
    const fullName = `${student.lastName || student.last_name || ""}, ${student.firstName || student.first_name || ""} ${student.middleName || student.middle_name || ""}`.trim();
    const data = computedStudentData[secId] || {};

    return (
      <tr key={secId}>
        <td className="col-no">{index + 1}</td>
        <td className="col-learner-name">{fullName}</td>
        <td className="col-words-read">
          <input
            type="number"
            min="0"
            max={passageWordsCount}
            className="phil-iri-table-input"
            value={data.wordsCorrect}
            onChange={(e) => handleScoreChange(secId, "wordsCorrect", e.target.value)}
            onBlur={handleInputBlur}
          />
        </td>
        <td className="col-oral-pct">{data.oralPct}</td>
        <td className="col-oral-level">
          <span className={`reading-level-text ${(data.oralLevel || "").toLowerCase()}`}>
            {data.oralLevel}
          </span>
        </td>
        <td className="col-comp-score">
          <input
            type="number"
            min="0"
            max={totalCompItems}
            className="phil-iri-table-input"
            value={data.correctAnswers}
            onChange={(e) => handleScoreChange(secId, "correctAnswers", e.target.value)}
            onBlur={handleInputBlur}
          />
        </td>
        <td className="col-comp-pct">{data.compPct}</td>
        <td className="col-comp-level">
          <span className={`reading-level-text ${(data.compLevel || "").toLowerCase()}`}>
            {data.compLevel}
          </span>
        </td>
        <td className="col-overall-level">
          <span className={`reading-level-text ${(data.overallLevel || "").toLowerCase()}`}>
            {data.overallLevel}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div className="phil-iri-page-container">
      {/* 1. TOP HEADER (BACK BUTTON + TITLE + CLOUD STATUS) */}
      <div className="phil-iri-page-header">
        <button
          type="button"
          onClick={onBack ? onBack : () => navigate(-1)}
          className="phil-iri-back-btn"
          aria-label="Go Back"
        >
          <img src={backIconUrl} alt="Back" />
        </button>

        <div className="phil-iri-header-titles">
          <div className="phil-iri-page-title-row">
            <h1 className="phil-iri-page-title">PHIL-IRI (English)</h1>
            {syncStatus === "saving" && (
              <span className="phil-iri-sync-status saving">
                <RefreshCw size={14} className="spin-icon" />
                <span>Saving...</span>
              </span>
            )}
            {syncStatus === "saved" && (
              <span className="phil-iri-sync-status saved">
                <Cloud size={15} />
                <span>All changes saved to cloud</span>
              </span>
            )}
            {syncStatus === "offline" && (
              <span className="phil-iri-sync-status offline">
                <CloudOff size={15} />
                <span>Saved to device storage</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. SUBHEADER & ACTION CONTROLS */}
      <div className="phil-iri-subheader">
        <div className="phil-iri-subheader-info">
          <h2>Section: {sectionName}</h2>
          <p>Philippine Informal Reading Inventory Assessment</p>
        </div>

        <div className="phil-iri-controls-group">
          {/* CAPSULE-STYLE TOGGLE (MATCHING SF9 TAB DESIGN) */}
          <div className="phil-iri-tabs-outer" role="tablist">
            <button
              type="button"
              className={`phil-iri-tab-button ${testType === "PRE_TEST" ? "active" : ""}`}
              onClick={() => setTestType("PRE_TEST")}
            >
              Pre-Test
            </button>
            <button
              type="button"
              className={`phil-iri-tab-button ${testType === "POST_TEST" ? "active" : ""}`}
              onClick={() => setTestType("POST_TEST")}
            >
              Post-Test
            </button>
          </div>

          {/* PARAMETERS CONFIGURATION */}
          <div className="phil-iri-params-bar">
            <div className="phil-iri-param-field">
              <label>Passage Words:</label>
              <input
                type="number"
                min="1"
                value={passageWordsCount}
                onChange={(e) => setPassageWordsCount(Math.max(1, Number(e.target.value) || 70))}
                onBlur={handleInputBlur}
                title="Total words in test passage (e.g. 70 or 103)"
              />
            </div>
            <div className="phil-iri-param-field">
              <label>Total Items:</label>
              <input
                type="number"
                min="1"
                value={totalCompItems}
                onChange={(e) => setTotalCompItems(Math.max(1, Number(e.target.value) || 5))}
                onBlur={handleInputBlur}
                title="Total comprehension items"
              />
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="phil-iri-actions-cluster">
            <button
              type="button"
              className="phil-iri-action-btn download-btn"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              title="Download official PDF document"
            >
              <Download size={15} />
              {isDownloading ? "Generating..." : "Download PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* 3. DOCUMENT DISPLAY VIEWPORT */}
      <div className="phil-iri-document-scroll">
        <div className="phil-iri-sheet" ref={sheetRef}>
          {/* EXACT OFFICIAL DEPED HEADER */}
          <div className="phil-iri-sheet-header">
            <img src={depedLogoUrl} alt="DepEd Official Seal" className="phil-iri-sheet-seal" />
            <p className="phil-iri-sheet-dept">Republic of the Philippines</p>
            <p className="phil-iri-sheet-dept">Department of Education</p>
            <p className="phil-iri-sheet-dept">{classMeta?.region || "Region X"}</p>
            <p className="phil-iri-sheet-dept">{classMeta?.division ? `Division of ${classMeta.division}` : "Division of Gingoog City"}</p>
            <p className="phil-iri-sheet-school">{classMeta?.school_name || "Gingoog City Comprehensive National High School"}</p>

            <h2 className="phil-iri-sheet-title">Philippine - Informal Reading Inventory (PHIL - IRI)</h2>
            <h3 className="phil-iri-sheet-subject">ENGLISH</h3>
            <h4 className="phil-iri-sheet-test-label">
              {testType === "PRE_TEST" ? "PRE – TEST RESULT" : "POST – TEST RESULT"}
            </h4>
            <p className="phil-iri-sheet-sy">SY {schoolYear}</p>
          </div>

          {/* METADATA BAR */}
          <div className="phil-iri-sheet-meta-row">
            <span>Grade & Section: <strong>{sectionDisplay}</strong></span>
            <span>Teacher: <strong>{teacherDisplay}</strong></span>
          </div>
          <div className="phil-iri-sheet-meta-subrow">
            <span>
              Enrolment: M- <strong>{totalBoys}</strong>&nbsp;&nbsp;F- <strong>{totalGirls}</strong>&nbsp;&nbsp;T- <strong>{totalEnrolment}</strong>
            </span>
          </div>

          {/* 9-COLUMN EXACT REPLICA TABLE */}
          <table className="phil-iri-sheet-table">
            <thead>
              <tr>
                <th className="col-no">No</th>
                <th className="col-learner-name">Learner's Name</th>
                <th className="col-words-read">
                  No. of words<br />correctly read
                </th>
                <th className="col-oral-pct">
                  Oral<br />reading<br />in %
                </th>
                <th className="col-oral-level">Reading Level</th>
                <th className="col-comp-score">
                  No. of Correct<br />Answer
                </th>
                <th className="col-comp-pct">
                  Comprehensio<br />n Score (in %)
                </th>
                <th className="col-comp-level">Reading Level</th>
                <th className="col-overall-level">READING LEVEL</th>
              </tr>
            </thead>
            <tbody>
              {/* BOYS ROSTER */}
              {maleStudents.map((st, i) => renderStudentRow(st, i))}

              {/* DIVIDER ROW BETWEEN GENDERS */}
              <tr className="gender-divider-row">
                <td colSpan={9} />
              </tr>

              {/* GIRLS ROSTER */}
              {femaleStudents.map((st, i) => renderStudentRow(st, i))}
            </tbody>
          </table>

          {/* SUMMARY DISTRIBUTION BOX */}
          <div className="phil-iri-sheet-summary-box">
            <table className="phil-iri-sheet-summary-table">
              <thead>
                <tr>
                  <th>INDEPENDENT</th>
                  <th>INSTRUCTIONAL</th>
                  <th>FRUSTRATION</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    BOYS: <span className="phil-iri-underline-val">{summaryCounts.boys.INDEPENDENT}</span>
                  </td>
                  <td>
                    BOYS: <span className="phil-iri-underline-val">{summaryCounts.boys.INSTRUCTIONAL}</span>
                  </td>
                  <td>
                    BOYS: <span className="phil-iri-underline-val">{summaryCounts.boys.FRUSTRATION}</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    GIRLS: <span className="phil-iri-underline-val">{summaryCounts.girls.INDEPENDENT}</span>
                  </td>
                  <td>
                    GIRLS: <span className="phil-iri-underline-val">{summaryCounts.girls.INSTRUCTIONAL}</span>
                  </td>
                  <td>
                    GIRLS: <span className="phil-iri-underline-val">{summaryCounts.girls.FRUSTRATION}</span>
                  </td>
                </tr>
                <tr className="phil-iri-total-row">
                  <td>
                    TOTAL: <span className="phil-iri-underline-val">{summaryCounts.boys.INDEPENDENT + summaryCounts.girls.INDEPENDENT}</span>
                  </td>
                  <td>
                    TOTAL: <span className="phil-iri-underline-val">{summaryCounts.boys.INSTRUCTIONAL + summaryCounts.girls.INSTRUCTIONAL}</span>
                  </td>
                  <td>
                    TOTAL: <span className="phil-iri-underline-val">{summaryCounts.boys.FRUSTRATION + summaryCounts.girls.FRUSTRATION}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* SIGNATURES BLOCK */}
          <div className="phil-iri-sheet-signatures">
            <div className="phil-iri-sig-col">
              <p className="sig-title">Prepared by:</p>
              <div className="sig-person-block">
                <p className="sig-name">{teacherDisplay}</p>
                <p className="sig-role">Secondary School Teacher (English)</p>
              </div>
            </div>

            <div className="phil-iri-sig-col">
              <p className="sig-title" style={{ textAlign: "right" }}>Noted:</p>
              <div className="sig-person-block right-person">
                <p className="sig-name">{coordinatorInfo.name || ""}</p>
                <p className="sig-role">{coordinatorInfo.role || "English Department Coordinator"}</p>
              </div>
            </div>
          </div>

          {/* OFFICIAL FOOTER */}
          <div className="phil-iri-sheet-footer">
            <img src={gccnhsLogoUrl} alt="Seal" className="phil-iri-footer-logo-l" />

            <div className="phil-iri-footer-middle">
              <p style={{ margin: 0 }}>National Highway, Brgy 23, Gingoog City</p>
              <p style={{ margin: 0 }}>Tel. No. : 0926-482-5061</p>
              <p style={{ margin: 0 }}>Email: gingoog.city@deped.gov.ph</p>
            </div>

            <div className="phil-iri-gold-seal">
              <span>GINGOOG GOLD</span>
              <span className="phil-iri-gold-seal-sub">LEARNING • OUTSTANDING LEADERSHIP • DEPED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
