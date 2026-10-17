import { cachedApiFetch as fetch } from "../../services/navigationCache.js";
import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Cloud, CloudOff, RefreshCw, Pencil, Check } from "lucide-react";
import { createPortal } from "react-dom";
import backIconUrl from "../../assets/backButton.svg";
import depedLogoUrl from "../../assets/deped_logo.png";
import gccnhsLogoUrl from "../../assets/gccnhs_logo.png";
import { getClassRecord, API_BASE_URL } from "../../services/classRecordApi";
import { getPhilIriRecords, savePhilIriBatch } from "../../services/philIriApi";
import { getStoredUser } from "../../utils/auth";
import EmptyState from "../../components/common/EmptyState";
import {
  getScreeningRecords,
  saveScreeningRecords,
} from "../../services/philIriScreeningApi";
import {
  SCREENING_DEFAULTS,
  SCREENING_PARTS,
  screeningTotal,
} from "../../utils/philIriScreening";
import "../../styles/PhilIriPage.css";
import "../../styles/philIriPostTest.css";
import "../../styles/philIriScreening.css";
import screeningPrintStyles from "../../styles/philIriScreening.css?inline";

// DepEd PHIL-IRI Evaluation Functions
function computeOralReadingLevel(wordsCorrect, totalWords) {
  if (
    wordsCorrect === "" ||
    wordsCorrect === null ||
    wordsCorrect === undefined
  )
    return "";
  const num = Number(wordsCorrect);
  if (isNaN(num) || num < 0) return "";
  const pct = (num / totalWords) * 100;
  if (pct >= 97) return "INDEPENDENT";
  if (pct >= 90) return "INSTRUCTIONAL";
  return "FRUSTRATION";
}

function computeComprehensionLevel(correctAnswers, totalItems) {
  if (
    correctAnswers === "" ||
    correctAnswers === null ||
    correctAnswers === undefined
  )
    return "";
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
  if (o === "INDEPENDENT" && (c === "INSTRUCTIONAL" || c === "FRUSTRATION"))
    return "INSTRUCTIONAL";
  if (o === "INSTRUCTIONAL" && (c === "INDEPENDENT" || c === "INSTRUCTIONAL"))
    return "INSTRUCTIONAL";
  if (o === "INSTRUCTIONAL" && c === "FRUSTRATION") return "FRUSTRATION";
  if (o === "FRUSTRATION" && c === "INDEPENDENT") return "INSTRUCTIONAL";
  if (o === "FRUSTRATION" && (c === "INSTRUCTIONAL" || c === "FRUSTRATION"))
    return "FRUSTRATION";

  return o || c || "";
}

function formatPercent(num, denom) {
  if (num === "" || num === null || num === undefined) return "";
  const n = Number(num);
  if (isNaN(n) || n < 0 || !denom) return "";
  const pct = (n / denom) * 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`;
}

// Convert image asset to Base64 data URI to eliminate any cross-origin restrictions in canvas export
async function toBase64(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("[PhilIri] Could not convert image to base64:", err);
    return url;
  }
}

function PhilIriDocumentSkeleton({ label }) {
  return (
    <div className="phil-iri-document-skeleton" role="status" aria-label={`Loading ${label}`} aria-busy="true">
      <span className="screening-visually-hidden">Loading {label}…</span>
      <div aria-hidden="true">
        <div className="phil-iri-skeleton-heading">
          <span className="phil-iri-skeleton-block phil-iri-skeleton-seal" />
          <span className="phil-iri-skeleton-block phil-iri-skeleton-title" />
          <span className="phil-iri-skeleton-block phil-iri-skeleton-subtitle" />
        </div>
        <div className="phil-iri-skeleton-meta">
          <span className="phil-iri-skeleton-block" /><span className="phil-iri-skeleton-block" />
        </div>
        <div className="phil-iri-skeleton-table">
          {Array.from({ length: 9 }, (_, row) => (
            <div className="phil-iri-skeleton-row" key={row}>
              {Array.from({ length: 9 }, (_, column) => <span className="phil-iri-skeleton-block" key={column} />)}
            </div>
          ))}
        </div>
        <div className="phil-iri-skeleton-footer">
          {Array.from({ length: 3 }, (_, index) => <span className="phil-iri-skeleton-block" key={index} />)}
        </div>
      </div>
    </div>
  );
}

function ScreeningTest({
  active,
  sectionId,
  schoolYearId,
  maleStudents,
  femaleStudents,
  classMeta,
  sectionDisplay,
  schoolYear,
  teacherDisplay,
  coordinatorInfo,
  logo,
  onStatus,
  controlsTarget,
  rosterLoading = false,
  userId,
}) {
  const [config, setConfig] = useState(SCREENING_DEFAULTS);
  const [editing, setEditing] = useState(false);
  const [scores, setScores] = useState({});
  const [initialized, setInitialized] = useState(false);
  const loading = Boolean(active && (rosterLoading || (!initialized && sectionId && schoolYearId)));
  const [ready, setReady] = useState(false);
  const [editVersion, setEditVersion] = useState(0);
  const latestEdit = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const documentStorageKey = `phil_iri_screening_footer_${sectionId}_${schoolYearId}_${userId || "current"}`;
  const [documentDetails, setDocumentDetails] = useState(() => {
    const defaults = { checked_by: "", learner_names: {} };
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(documentStorageKey) || "{}") };
    } catch { return defaults; }
  });
  useEffect(() => {
    try { localStorage.setItem(documentStorageKey, JSON.stringify(documentDetails)); } catch { /* Document fields remain editable when device storage is unavailable. */ }
  }, [documentDetails, documentStorageKey]);
  const students = useMemo(
    () => [...maleStudents, ...femaleStudents],
    [maleStudents, femaleStudents],
  );

  useEffect(() => {
    if (!active || rosterLoading || initialized || !sectionId || !schoolYearId) return;
    let current = true;
    onStatus("Loading screening scores…");
    getScreeningRecords(sectionId, schoolYearId)
      .then((data) => {
        if (!current) return;
        const rows = data.records || [];
        if (rows.length) {
          const first = rows[0];
          setConfig(
            Object.fromEntries(
              Object.keys(SCREENING_DEFAULTS).map((key) => [
                key,
                key === "assessed_on"
                  ? String(first[key] || "").slice(0, 10)
                  : (first[key] ?? SCREENING_DEFAULTS[key]),
              ]),
            ),
          );
        }
        setScores(
          Object.fromEntries(
            rows.map((row) => [String(row.student_section_id), row]),
          ),
        );
        setReady(true);
        onStatus(
          rows.length ? "Screening scores saved" : "No screening scores yet",
        );
      })
      .catch((err) => {
        if (!current) return;
        console.warn("[PHIL-IRI screening]", err.message);
        onStatus("Screening scores unavailable");
      })
      .finally(() => {
        if (current) setInitialized(true);
      });
    return () => {
      current = false;
    };
  }, [active, rosterLoading, initialized, sectionId, schoolYearId, onStatus]);

  function changed() {
    latestEdit.current += 1;
    setEditVersion(latestEdit.current);
    onStatus(
      ready ? "Unsaved screening changes" : "Screening scores unavailable",
    );
  }
  function changeConfig(key, value) {
    if (!editing || loading || !sectionId || !schoolYearId) return;
    setConfig((previous) => ({ ...previous, [key]: value }));
    changed();
  }
  function changeScore(id, key, value) {
    if (loading || !sectionId || !schoolYearId) return;
    setScores((previous) => {
      const row = { ...previous[id], [key]: value };
      if (key.endsWith("_score") && value !== "") row.test_taken = 1;
      if (key === "test_taken" && value !== 1)
        SCREENING_PARTS.forEach((part) => {
          row[`${part}_score`] = null;
        });
      return { ...previous, [id]: row };
    });
    changed();
  }
  function changeDocumentDetail(key, value) {
    if (!editing || loading || !sectionId || !schoolYearId) return;
    setDocumentDetails((previous) => ({ ...previous, [key]: value }));
  }
  function changeLearnerName(id, value) {
    if (!editing || loading || !sectionId || !schoolYearId) return;
    setDocumentDetails((previous) => ({ ...previous, learner_names: { ...previous.learner_names, [id]: value } }));
  }

  // Debounce edits and serialize requests so older saves cannot overwrite newer edits.
  useEffect(() => {
    if (!ready || !editVersion || !students.length) return;
    const maxima = SCREENING_PARTS.map((part) => Number(config[`${part}_max`]));
    if (maxima.some((value) => !Number.isInteger(value) || value < 1 || value > 1000)) {
      onStatus("Enter whole-number item counts from 1 to 1000");
      return;
    }
    if (
      !Number.isInteger(Number(config.score_threshold)) ||
      Number(config.score_threshold) < 1 ||
      Number(config.score_threshold) > maxima.reduce((a, b) => a + b, 0)
    ) {
      onStatus(
        `Enter a score boundary from 1 to ${maxima.reduce((a, b) => a + b, 0)}`,
      );
      return;
    }
    const records = students.map((student) => {
      const row = scores[String(student.student_section_id)] || {};
      return {
        student_section_id: student.student_section_id,
        test_taken: row.test_taken ?? null,
        ...Object.fromEntries(
          SCREENING_PARTS.map((part) => [
            `${part}_score`,
            row[`${part}_score`] === "" || row[`${part}_score`] == null
              ? null
              : Number(row[`${part}_score`]),
          ]),
        ),
      };
    });
    if (records.some((row) => !row.student_section_id)) {
      onStatus("Screening scores unavailable");
      return;
    }
    const invalidScore = records.some((row) =>
      SCREENING_PARTS.some((part, index) => {
        const value = row[`${part}_score`];
        return (
          value !== null &&
          (!Number.isInteger(value) || value < 0 || value > maxima[index])
        );
      }),
    );
    if (invalidScore) {
      onStatus("Check the entered screening scores");
      return;
    }
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        if (latestEdit.current !== editVersion) return;
        onStatus("Saving screening scores…");
        try {
          await saveScreeningRecords(sectionId, schoolYearId, {
            config,
            records,
          });
          if (latestEdit.current === editVersion)
            onStatus("Screening scores saved");
        } catch (err) {
          console.warn("[PHIL-IRI screening]", err.message);
          if (latestEdit.current === editVersion)
            onStatus("Screening scores unavailable");
        }
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [
    ready,
    editVersion,
    config,
    scores,
    students,
    sectionId,
    schoolYearId,
    onStatus,
  ]);

  if (!active) return null;
  const unavailable = loading || !sectionId || !schoolYearId;
  const locked = unavailable || !editing;
  const displayedTeacher = documentDetails.teacher_name ?? teacherDisplay;
  const displayedSection = documentDetails.section_display ?? sectionDisplay;
  function boundaryInput(comparison) {
    return (
      <>
        Score
        <br />
        <span className="screening-boundary-value">
        {comparison}
        <input
          type="number"
          min="1"
          max={SCREENING_PARTS.reduce(
            (total, part) => total + Number(config[`${part}_max`]),
            0,
          )}
          step="1"
          className="screening-boundary-input"
          aria-label={`Score boundary for ${comparison}`}
          title="Edit the score boundary for both columns"
          disabled={locked}
          value={config.score_threshold}
          onChange={(event) =>
            changeConfig("score_threshold", event.target.value)
          }
        />
        </span>
      </>
    );
  }
  function rosterTable() {
    const complete = students
      .map((student) =>
        screeningTotal(
          scores[String(student.student_section_id)] || {},
          config,
        ),
      )
      .filter((total) => total !== null);
    const testedCount = students.filter((student) => scores[String(student.student_section_id)]?.test_taken === 1).length;
    const partTotals = SCREENING_PARTS.map((part) => students.reduce((sum, student) => {
      const row = scores[String(student.student_section_id)] || {};
      const value = row[`${part}_score`];
      return row.test_taken === 1 && value !== "" && value != null && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= Number(config[`${part}_max`])
        ? sum + Number(value) : sum;
    }, 0));
    return (
      <table className="screening-table">
        <caption className="screening-visually-hidden">Screening test learner record</caption>
        <thead>
          <tr>
            <th rowSpan={2} scope="col">
              No.
            </th>
            <th rowSpan={2} scope="col">
              Learner’s Name
            </th>
            <th rowSpan={2} scope="col">
              Test taken
              <br />√ / X
            </th>
            <th colSpan={3} scope="colgroup">
              Number of correct responses
            </th>
            <th rowSpan={2} scope="col">
              Total
              <br />
              score
            </th>
            <th rowSpan={2} scope="col">
              {boundaryInput("<")}
            </th>
            <th rowSpan={2} scope="col">
              {boundaryInput("≥")}
            </th>
          </tr>
          <tr>
            {SCREENING_PARTS.map((part) => (
              <th scope="col" key={part}>
                {part === "inferential"
                  ? "Inferential"
                  : part === "literal"
                    ? "Literal"
                    : "Critical"}
                <br />
                <span className="screening-item-count">
                  (
                  <input
                    type="number" min="1" max="1000" step="1"
                    className="screening-max-input"
                    aria-label={`${part} item count`}
                    title={`Edit the number of ${part} items`}
                    disabled={locked}
                    value={config[`${part}_max`]}
                    onChange={(event) => changeConfig(`${part}_max`, event.target.value)}
                  />
                  )
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => {
            const id = String(student.student_section_id);
            const row = scores[id] || {};
            const name =
              `${student.lastName || ""}, ${student.firstName || ""} ${student.middleName || ""}`.trim();
            const total = screeningTotal(row, config);
            return (
              <Fragment key={id}>
              {(index === 0 || index === maleStudents.length) && (
                <tr className="screening-gender-divider">
                  <th colSpan={9} scope="rowgroup">{index < maleStudents.length ? "MALES" : "FEMALES"}</th>
                </tr>
              )}
              <tr>
                <td>{index + 1}</td>
                <td className="screening-name">
                  <input
                    type="text" className="screening-name-input" maxLength={200}
                    aria-label={`Learner name for ${name}`} readOnly={locked}
                    value={documentDetails.learner_names?.[id] ?? name}
                    onChange={(event) => changeLearnerName(id, event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="phil-iri-table-input screening-mark screening-test-taken"
                    aria-label={`Test taken by ${name}`}
                    title="Type Y for √ or N for X. Delete to clear."
                    disabled={unavailable}
                    autoComplete="off"
                    value={row.test_taken === 1 ? "√" : row.test_taken === 0 ? "X" : ""}
                    onFocus={(event) => event.target.select()}
                    onKeyDown={(event) => {
                      if (event.ctrlKey || event.metaKey || event.altKey) return;
                      const key = event.key.toLowerCase();
                      if (["y", "n", "backspace", "delete"].includes(key)) {
                        event.preventDefault();
                        changeScore(id, "test_taken", key === "y" ? 1 : key === "n" ? 0 : null);
                      }
                    }}
                    onChange={(event) => {
                      const value = event.target.value.trim().toUpperCase();
                      if (["Y", "√", "N", "X", ""].includes(value))
                        changeScore(id, "test_taken", ["Y", "√"].includes(value) ? 1 : ["N", "X"].includes(value) ? 0 : null);
                    }}
                  />
                </td>
                {SCREENING_PARTS.map((part) => (
                  <td key={part}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      max={config[`${part}_max`]}
                      aria-label={`${part} score for ${name}`}
                      className="phil-iri-table-input screening-score"
                      disabled={unavailable || row.test_taken === 0}
                      value={row[`${part}_score`] ?? ""}
                      onChange={(event) =>
                        changeScore(id, `${part}_score`, event.target.value)
                      }
                    />
                  </td>
                ))}
                <td className="screening-score">{total ?? ""}</td>
                <td className="screening-mark">
                  {total !== null && total < Number(config.score_threshold)
                    ? "√"
                    : ""}
                </td>
                <td className="screening-mark">
                  {total !== null && total >= Number(config.score_threshold)
                    ? "√"
                    : ""}
                </td>
              </tr>
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2} scope="row">
              Total
            </th>
            <td aria-label="Total learners who took the test">{testedCount}</td>
            {partTotals.map((total, index) => <td key={SCREENING_PARTS[index]} aria-label={`Total ${SCREENING_PARTS[index]} scores`}>{total}</td>)}
            <td aria-label="Sum of complete total scores">{complete.reduce((sum, total) => sum + total, 0)}</td>
            <td>
              {
                complete.filter(
                  (total) => total < Number(config.score_threshold),
                ).length
              }
            </td>
            <td>
              {
                complete.filter(
                  (total) => total >= Number(config.score_threshold),
                ).length
              }
            </td>
          </tr>
        </tfoot>
      </table>
    );
  }

  return (
    <div className="screening-view" role="tabpanel" aria-label="Screening Test">
      {controlsTarget &&
        createPortal(
          <div className="screening-edit-controls">
          {editing && <span className="screening-edit-hint" role="status">Editing details</span>}
          <button
            type="button" className={`screening-edit-button ${editing ? "is-editing" : ""}`}
            aria-label={editing ? "Finish editing Screening Test" : "Edit Screening Test"}
            title={editing ? "Finish editing" : "Edit mode"}
            aria-pressed={editing}
            disabled={unavailable}
            onClick={() => setEditing((previous) => !previous)}
          >
            {editing ? <Check size={17} /> : <Pencil size={17} />}
          </button>
          </div>,
          controlsTarget,
        )}
      {loading ? <PhilIriDocumentSkeleton label="Screening Test" /> : <div className="phil-iri-document-scroll">
        <div
          className={`phil-iri-sheet screening-sheet ${editing ? "is-editing" : ""}`}
          id="philiri-pdf-container"
        >
          <div className="phil-iri-sheet-header">
            <img
              src={logo}
              alt="DepEd Official Seal"
              className="phil-iri-sheet-seal"
            />
            <p className="phil-iri-sheet-dept">
              Republic of the Philippines · Department of Education
            </p>
            <p className="phil-iri-sheet-school">
              {classMeta?.school_name ||
                "Gingoog City Comprehensive National High School"}
            </p>
            <h2 className="phil-iri-sheet-title">
              PHIL-IRI Screening Test Class Reading Record
            </h2>
            <h3 className="phil-iri-sheet-subject">ENGLISH</h3>
            <p className="phil-iri-sheet-sy">SY {schoolYear}</p>
          </div>
          <div className="phil-iri-sheet-meta-row">
            <span>
              Grade & Section: <input
                type="text" className="screening-metadata-input" aria-label="Grade and section"
                maxLength={150} readOnly={locked} value={displayedSection}
                onChange={(event) => changeDocumentDetail("section_display", event.target.value)}
              />
            </span>
            <span>
              Teacher: <input
                type="text" className="screening-metadata-input" aria-label="Teacher name"
                maxLength={150} readOnly={locked} value={displayedTeacher}
                onChange={(event) => changeDocumentDetail("teacher_name", event.target.value)}
              />
            </span>
          </div>
          <div className="phil-iri-sheet-meta-subrow">
            <span>Date: <input
              type={editing ? "date" : "text"}
              className="screening-metadata-input screening-date-input"
              aria-label="Screening test date" readOnly={locked} value={config.assessed_on}
              onChange={(event) => changeConfig("assessed_on", event.target.value)}
            /></span>
            <span>Screening Test Level: <input
              type="text" className="screening-metadata-input" aria-label="Screening test level"
              maxLength={100} readOnly={locked} value={config.test_level}
              onChange={(event) => changeConfig("test_level", event.target.value)}
            /></span>
          </div>
          <div className="screening-tables">
            {rosterTable()}
          </div>
          {!students.length && (
            <p className="screening-help">
              No learners are available in this class roster.
            </p>
          )}
          <footer className="screening-document-footer">
          <div className="screening-signature-grid">
            <div className="screening-signature">
              <p className="sig-title">Prepared by:</p>
              <div className="sig-person-block">
                <input
                  type="text" className="screening-footer-input screening-footer-name"
                  aria-label="Prepared by" maxLength={150} readOnly={locked} value={displayedTeacher}
                  onChange={(event) => changeDocumentDetail("teacher_name", event.target.value)}
                />
                <p className="sig-role">Secondary School Teacher (English)</p>
              </div>
            </div>
            <div className="screening-signature">
              <p className="sig-title">Checked:</p>
              <div className="sig-person-block">
                <input
                  type="text" className="screening-footer-input screening-footer-name"
                  aria-label="Checked by" maxLength={150} readOnly={locked} value={documentDetails.checked_by}
                  onChange={(event) => changeDocumentDetail("checked_by", event.target.value)}
                />
                <p className="sig-role">Master Teacher 1</p>
              </div>
            </div>
            <div className="screening-signature">
              <p className="sig-title">Noted:</p>
              <div className="sig-person-block">
                <input
                  type="text" className="screening-footer-input screening-footer-name"
                  aria-label="Noted by" maxLength={150} readOnly={locked} value={documentDetails.noted_by ?? coordinatorInfo.name ?? ""}
                  onChange={(event) => changeDocumentDetail("noted_by", event.target.value)}
                />
                <p className="sig-role">{coordinatorInfo.role}</p>
              </div>
            </div>
          </div>
          </footer>
        </div>
      </div>}
    </div>
  );
}

export default function PhilIri({ activeClass: propActiveClass, onBack }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = getStoredUser();

  const activeClass = useMemo(() => {
    return (
      propActiveClass ||
      location.state?.activeClass ||
      location.state?.activeSelectedClass ||
      {}
    );
  }, [propActiveClass, location.state]);

  const sectionId = useMemo(() => {
    return (
      activeClass?.section_id ||
      activeClass?.sectionId ||
      location.state?.section_id ||
      (typeof activeClass?.id === "number" ? activeClass.id : null) ||
      (typeof activeClass?.id === "string" && !isNaN(Number(activeClass.id))
        ? Number(activeClass.id)
        : null) ||
      (typeof activeClass?.id === "string" && activeClass.id.startsWith("sec-")
        ? Number(activeClass.id.replace("sec-", ""))
        : null) ||
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

  // Screening is the baseline; the oral reading assessment is Post-Test only.
  const testType = "POST_TEST";
  const [screeningActive, setScreeningActive] = useState(true);
  const [screeningControlsTarget, setScreeningControlsTarget] = useState(null);
  const [screeningStatus, setScreeningStatus] = useState(
    "No screening scores yet",
  );
  const [passageWordsCount, setPassageWordsCount] = useState(70);
  const [totalCompItems, setTotalCompItems] = useState(5);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [syncStatus, setSyncStatus] = useState("saved"); // 'saving' | 'saved' | 'offline'
  const [isDownloading, setIsDownloading] = useState(false);
  const [classMeta, setClassMeta] = useState(null);
  const [loadedRosterKey, setLoadedRosterKey] = useState(null);
  const [loadedAssessmentKey, setLoadedAssessmentKey] = useState(null);
  const rosterKey = `${sectionId}:${subjectOfferingId}`;
  const schoolYearId = classMeta?.school_year_id;
  const assessmentKey = `${rosterKey}:${schoolYearId || ""}:${testType}`;
  const rosterLoading = Boolean((sectionId || subjectOfferingId) && loadedRosterKey !== rosterKey);
  const assessmentLoading = Boolean(sectionId && loadedAssessmentKey !== assessmentKey);
  const documentLoading = rosterLoading || assessmentLoading;
  const [coordinatorInfo, setCoordinatorInfo] = useState({
    name: "",
    role: "Master Teacher II - English Department Coordinator",
  });
  const [depedLogoBase64, setDepedLogoBase64] = useState("");
  const [gccnhsLogoBase64, setGccnhsLogoBase64] = useState("");
  const pdfRef = useRef(null);
  const isLoadedRef = useRef(false);
  const debounceTimerRef = useRef(null);

  // Pre-load logos as Base64 data URIs for 100% CORS-safe canvas rendering
  useEffect(() => {
    let isCurrent = true;
    Promise.all([toBase64(depedLogoUrl), toBase64(gccnhsLogoUrl)]).then(
      ([d, g]) => {
        if (!isCurrent) return;
        if (d) setDepedLogoBase64(d);
        if (g) setGccnhsLogoBase64(g);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, []);

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
        console.warn(
          "Could not fetch English Department Coordinator from DB:",
          err,
        );
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
              })),
            );
          }
          if (data.class_context) {
            setClassMeta(data.class_context);
          }
        })
        .catch((err) => {
          console.warn(
            "Could not pre-populate student roster from class record API:",
            err,
          );
        })
        .finally(() => {
          if (isCurrent) setLoadedRosterKey(rosterKey);
        });
    }
    return () => {
      isCurrent = false;
    };
  }, [subjectOfferingId, sectionId, rosterKey]);

  // 2. Load Post-Test scores only after the enrollment year is known.
  useEffect(() => {
    let isCurrent = true;
    isLoadedRef.current = false;
    if (screeningActive || rosterLoading || !schoolYearId) return;
    if (loadedAssessmentKey === assessmentKey) {
      isLoadedRef.current = true;
      return;
    }
    if (sectionId) {
      getPhilIriRecords(sectionId, testType, subjectOfferingId, schoolYearId)
        .then((res) => {
          if (!isCurrent) return;
          if (res.passageWordsCount)
            setPassageWordsCount(res.passageWordsCount);
          if (res.totalCompItems) setTotalCompItems(res.totalCompItems);
          if (res.coordinator) {
            setCoordinatorInfo(res.coordinator);
          }

          const newScores = {};
          if (Array.isArray(res.records)) {
            res.records.forEach((r) => {
              const key = String(r.student_section_id || r.student_id);
              newScores[key] = {
                wordsCorrect:
                  r.words_correct !== undefined && r.words_correct !== null
                    ? r.words_correct
                    : "",
                correctAnswers:
                  r.comp_correct !== undefined && r.comp_correct !== null
                    ? r.comp_correct
                    : "",
              };
            });
          }
          setScores(newScores);
          setSyncStatus(res.tableReady ? "saved" : "offline");
          setTimeout(() => {
            if (isCurrent) isLoadedRef.current = true;
          }, 400);
        })
        .catch((err) => {
          console.warn("Error fetching PHIL-IRI scores:", err);
        })
        .finally(() => {
          if (isCurrent) setLoadedAssessmentKey(assessmentKey);
        });
    }
    return () => {
      isCurrent = false;
    };
  }, [sectionId, testType, subjectOfferingId, assessmentKey, screeningActive, rosterLoading, schoolYearId]);

  // Group and sort students safely
  const { maleStudents, femaleStudents } = useMemo(() => {
    if (!Array.isArray(students))
      return { maleStudents: [], femaleStudents: [] };
    const isMale = (s) =>
      Boolean(
        s &&
        String(s.sex || "M")
          .toUpperCase()
          .startsWith("M"),
      );
    const isFemale = (s) =>
      Boolean(
        s &&
        String(s.sex || "M")
          .toUpperCase()
          .startsWith("F"),
      );

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
        const oralLevel = computeOralReadingLevel(
          wordsCorrect,
          passageWordsCount,
        );

        const compPct = formatPercent(correctAnswers, totalCompItems);
        const compLevel = computeComprehensionLevel(
          correctAnswers,
          totalCompItems,
        );

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
    if (screeningActive || rosterLoading || !schoolYearId || !isLoadedRef.current) return;
    setSyncStatus("saving");

    const effectiveUserId = currentUser?.user_id || currentUser?.id || null;
    const effectiveSubjectOfferingId =
      classMeta?.subject_offering_id || subjectOfferingId || null;

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
          words_correct:
            computed.wordsCorrect !== "" ? Number(computed.wordsCorrect) : 0,
          oral_reading_percent:
            computed.wordsCorrect !== ""
              ? parseFloat(
                  (
                    (Number(computed.wordsCorrect) / passageWordsCount) *
                    100
                  ).toFixed(2),
                )
              : 0.0,
          oral_reading_level: computed.oralLevel || "FRUSTRATION",
          total_comp_items: Number(totalCompItems),
          comp_correct:
            computed.correctAnswers !== ""
              ? Number(computed.correctAnswers)
              : 0,
          comp_score_percent:
            computed.correctAnswers !== ""
              ? parseFloat(
                  (
                    (Number(computed.correctAnswers) / totalCompItems) *
                    100
                  ).toFixed(2),
                )
              : 0.0,
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
        schoolYearId,
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
    if (screeningActive || rosterLoading || !schoolYearId || !isLoadedRef.current || !sectionId) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      handleSave();
    }, 600);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [scores, passageWordsCount, totalCompItems, screeningActive, rosterLoading, schoolYearId]);

  // Metadata resolutions
  const rawTeacher =
    classMeta?.teacher_name ||
    activeClass?.teacher_name ||
    activeClass?.teacherName ||
    activeClass?.adviser ||
    (currentUser?.first_name
      ? `${currentUser.first_name} ${currentUser.last_name}`
      : "Ma. Lycil B. Bucio");
  const teacherDisplay = String(rawTeacher).toUpperCase();

  const sectionName =
    activeClass?.section_name ||
    activeClass?.sectionName ||
    classMeta?.section_name ||
    "Luna";
  const gradeLevel =
    activeClass?.gradeLevel ||
    activeClass?.grade ||
    classMeta?.grade_level ||
    "7";
  const cleanGrade = String(gradeLevel)
    .replace(/^grade\s*/i, "")
    .replace(/^g/i, "")
    .trim();
  const cleanSectionName = String(sectionName)
    .replace(/^g\d+\s*-\s*/i, "")
    .trim();
  const sectionDisplay = `G${cleanGrade || "7"} - ${cleanSectionName}`;

  const schoolYear =
    classMeta?.school_year_label || activeClass?.school_year || "2025 - 2026";
  const totalBoys = maleStudents.length;
  const totalGirls = femaleStudents.length;
  const totalEnrolment = totalBoys + totalGirls;

  // Print / Save as PDF using an isolated hidden iframe (zero page flicker, native vector output)
  const handleDownloadPDF = () => {
    const element = document.getElementById("philiri-pdf-container");
    if (!element) {
      alert("Error: PDF element container not found.");
      return;
    }

    const rawSec = cleanSectionName || sectionName || "Section";
    const secClean = String(rawSec).trim().replace(/\s+/g, "_");
    const testClean = screeningActive
      ? "SCREENING_TEST"
      : "POST_TEST";
    const defaultFileName = `${secClean}_PHILIRI_${testClean}`;

    const originalTitle = document.title;
    document.title = defaultFileName;

    setIsDownloading(true);

    try {
      // 1. Create a clone and preserve typed score inputs as clean text spans
      const clone = element.cloneNode(true);
      const originalInputs = element.querySelectorAll("input, select");
      const cloneInputs = clone.querySelectorAll("input, select");
      cloneInputs.forEach((cloneInput, index) => {
        const origInput = originalInputs[index];
        const val =
          origInput?.tagName === "SELECT"
            ? origInput.selectedOptions[0]?.textContent
            : origInput
              ? origInput.value
              : cloneInput.value;
        const span = document.createElement("span");
        span.textContent = val !== undefined && val !== null ? String(val) : "";
        if (screeningActive) span.className = origInput.className;
        span.style.fontWeight = "bold";
        span.style.display = "inline-block";
        span.style.width = screeningActive
          ? origInput.classList.contains("screening-score") || origInput.classList.contains("screening-test-taken") ? "100%" : ""
          : "100%";
        span.style.textAlign = "center";
        if (cloneInput.parentNode) {
          cloneInput.parentNode.replaceChild(span, cloneInput);
        }
      });

      // 2. Create invisible isolated iframe so the main page never changes or flickers
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${defaultFileName}</title>
          <style>
            @page {
              size: letter ${screeningActive ? "landscape" : "portrait"};
              margin: 0.35in 0.4in;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .screening-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 12px 0 20px; }
            .screening-visually-hidden { display: none; }
            .screening-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 7pt; }
            .screening-table th, .screening-table td { border: 1px solid #94a3b8; padding: 3px; text-align: center; overflow-wrap: anywhere; }
            .screening-table th { background: #fff2cc; }
            .screening-table th:first-child { width: 20px; }
            .screening-table thead tr:first-child th:nth-child(2) { width: 27%; }
            .screening-table .screening-name { text-align: left; }
            .screening-table caption { text-align: left; font-weight: bold; margin-bottom: 5px; }
            .screening-sheet { min-height: 0 !important; justify-content: flex-start !important; }
            html, body {
              height: 100%;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: Calibri, "Segoe UI", Arial, sans-serif;
              background: #ffffff;
              color: #000000;
            }
            .phil-iri-sheet {
              background: #ffffff;
              width: 100%;
              min-height: 10.1in;
              margin: 0 auto;
              color: #000000;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }
            .phil-iri-sheet-header {
              text-align: center;
              margin-bottom: 10px;
            }
            .phil-iri-sheet-seal {
              width: 58px;
              height: 58px;
              object-fit: contain;
              margin: 0 auto 4px auto;
              display: block;
            }
            .phil-iri-sheet-dept {
              font-family: "Century Gothic", "CenturyGothic", AppleGothic, sans-serif;
              font-size: 8.5pt;
              line-height: 1.3;
              margin: 0;
              color: #000000;
            }
            .phil-iri-sheet-school {
              font-family: "Century Gothic", "CenturyGothic", AppleGothic, sans-serif;
              font-size: 9.5pt;
              font-weight: 700;
              margin: 2px 0 6px 0;
            }
            .phil-iri-sheet-title {
              font-size: 11pt;
              font-weight: 800;
              margin: 0;
              background-color: #ffe598 !important;
              display: block;
              width: 100%;
              padding: 3px 0;
              text-align: center;
            }
            .phil-iri-sheet-subject {
              font-size: 10pt;
              font-weight: 800;
              margin: 2px 0 0 0;
              text-align: center;
            }
            .phil-iri-sheet-test-label {
              font-size: 9pt;
              font-weight: 800;
              margin: 2px 0 0 0;
              text-decoration: underline;
              text-align: center;
            }
            .phil-iri-sheet-sy {
              font-size: 8.5pt;
              font-weight: 700;
              margin: 2px 0 8px 0;
              text-align: center;
            }
            .phil-iri-sheet-meta-row, .phil-iri-sheet-meta-subrow {
              display: flex;
              justify-content: space-between;
              font-size: 8.5pt;
              font-weight: 600;
              margin-bottom: 3px;
            }
            .phil-iri-sheet-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 8pt;
              border: 1px solid #000000;
              margin-bottom: 12px;
            }
            .phil-iri-sheet-table th, .phil-iri-sheet-table td {
              border: 1px solid #000000;
              padding: 3px 2px;
              vertical-align: middle;
              text-align: center;
            }
            .phil-iri-sheet-table th {
              background: #ffffff;
              font-weight: 700;
              line-height: 1.15;
              font-size: 7.8pt;
            }
            .phil-iri-sheet-table th.col-no, .phil-iri-sheet-table td.col-no {
              width: 28px;
            }
            .phil-iri-sheet-table th.col-learner-name, .phil-iri-sheet-table td.col-learner-name {
              text-align: left;
              padding-left: 6px;
              white-space: nowrap;
            }
            .phil-iri-sheet-table tr.gender-divider-row td {
              height: 8px;
              background: #f1f5f9 !important;
              border-top: 1px solid #000000;
              border-bottom: 1px solid #000000;
            }
            .reading-level-text {
              font-weight: 700;
              font-size: 7.2pt;
              text-transform: uppercase;
            }
            .phil-iri-sheet-summary-box {
              display: flex;
              justify-content: center;
              margin-bottom: 14px;
              page-break-inside: avoid;
            }
            .phil-iri-sheet-summary-table {
              width: 85%;
              border-collapse: collapse;
              font-size: 8pt;
              font-weight: 700;
              border: none !important;
            }
            .phil-iri-sheet-summary-table th, .phil-iri-sheet-summary-table td {
              border: none !important;
              padding: 3px 6px;
              text-align: center;
            }
            .phil-iri-sheet-summary-table tr.phil-iri-total-row td {
              background-color: #ffe598 !important;
              font-weight: 700;
              border: none !important;
            }
            .phil-iri-underline-val {
              border-bottom: 1.5px solid #000000;
              display: inline-block;
              min-width: 60px;
              text-align: center;
              padding: 0 4px;
            }
            .phil-iri-sheet-bottom-block {
              margin-top: auto;
              width: 100%;
              page-break-inside: avoid;
              display: flex;
              flex-direction: column;
            }
            .phil-iri-sheet-signatures {
              display: flex;
              justify-content: space-between;
              margin-top: 10px;
              margin-bottom: 12px;
              padding: 0 16px;
              font-size: 8pt;
              page-break-inside: avoid;
            }
            .phil-iri-sig-col {
              width: 48%;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .phil-iri-sig-col .sig-title {
              width: 100%;
              max-width: 240px;
              text-align: left;
              margin-bottom: 18px;
              font-size: 7.5pt;
            }
            .sig-person-block {
              width: 100%;
              max-width: 240px;
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
            }
            .sig-person-block.right-person {
              margin-left: 0;
              width: 100%;
            }
            .phil-iri-sig-col .sig-name {
              font-weight: 800;
              font-size: 8.5pt;
              text-transform: uppercase;
              border-bottom: 1px solid #000000;
              display: inline-block;
              padding-bottom: 1px;
              margin-bottom: 2px;
              text-align: center;
              min-width: 180px;
            }
            .phil-iri-sig-col .sig-role {
              font-size: 7.2pt;
              color: #000000;
              text-align: center;
              margin: 0;
            }
            .phil-iri-sheet-footer {
              border-top: 1px solid #000000;
              padding-top: 5px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 7pt;
              line-height: 1.2;
              page-break-inside: avoid;
            }
            .phil-iri-footer-middle {
              text-align: center;
              flex: 1;
            }
            .phil-iri-footer-logo-l {
              width: 38px;
              height: 38px;
              object-fit: contain;
            }
            .phil-iri-gold-seal {
              font-family: Impact, "Arial Black", sans-serif;
              font-size: 11pt;
              color: #ca8a04;
              letter-spacing: 0.5px;
              font-style: italic;
              display: flex;
              flex-direction: column;
              align-items: center;
              line-height: 1;
            }
            .phil-iri-gold-seal-sub {
              font-size: 5pt;
              font-family: Arial, sans-serif;
              color: #334155;
              letter-spacing: 0.2px;
              margin-top: 1px;
            }
          </style>
          ${screeningActive ? `<style>${screeningPrintStyles}</style>` : ""}
        </head>
        <body class="${screeningActive ? "screening-print-document" : ""}">
          ${clone.outerHTML}
        </body>
        </html>
      `);
      doc.close();

      iframe.contentWindow.focus();
      const openPrint = () => {
        iframe.contentWindow.print();
        setIsDownloading(false);
        setTimeout(() => {
          document.title = originalTitle;
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 3000);
      };
      if (screeningActive) {
        doc.fonts
          .load("13pt Teko")
          .then(() => doc.fonts.ready)
          .then(openPrint)
          .catch(openPrint);
      } else {
        setTimeout(openPrint, 350);
      }
    } catch (error) {
      console.error("PDF Print Error:", error);
      setIsDownloading(false);
      document.title = originalTitle;
      alert(`Failed to open print preview: ${error.message || error}`);
    }
  };

  const renderStudentRow = (student, index) => {
    if (!student) return null;
    const secId = String(student.student_section_id || student.student_id);
    const fullName =
      `${student.lastName || student.last_name || ""}, ${student.firstName || student.first_name || ""} ${student.middleName || student.middle_name || ""}`.trim();
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
            step="1"
            aria-label={`Words correctly read by ${fullName}`}
            className="phil-iri-table-input"
            value={data.wordsCorrect}
            onChange={(e) =>
              handleScoreChange(secId, "wordsCorrect", e.target.value)
            }
            onBlur={handleInputBlur}
          />
        </td>
        <td className="col-oral-pct">{data.oralPct}</td>
        <td className="col-oral-level">
          <span
            className={`reading-level-text ${(data.oralLevel || "").toLowerCase()}`}
          >
            {data.oralLevel}
          </span>
        </td>
        <td className="col-comp-score">
          <input
            type="number"
            min="0"
            max={totalCompItems}
            step="1"
            aria-label={`Correct comprehension answers by ${fullName}`}
            className="phil-iri-table-input"
            value={data.correctAnswers}
            onChange={(e) =>
              handleScoreChange(secId, "correctAnswers", e.target.value)
            }
            onBlur={handleInputBlur}
          />
        </td>
        <td className="col-comp-pct">{data.compPct}</td>
        <td className="col-comp-level">
          <span
            className={`reading-level-text ${(data.compLevel || "").toLowerCase()}`}
          >
            {data.compLevel}
          </span>
        </td>
        <td className="col-overall-level">
          <span
            className={`reading-level-text ${(data.overallLevel || "").toLowerCase()}`}
          >
            {data.overallLevel}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div className={`phil-iri-page-container ${screeningActive ? "screening-page" : "post-test-page"}`}>
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
            {screeningActive && (
              <span className="phil-iri-sync-status" role="status">
                {screeningStatus}
              </span>
            )}
            {!screeningActive && documentLoading && (
              <span className="phil-iri-sync-status" role="status">Loading assessment records…</span>
            )}
            {!screeningActive && !documentLoading && syncStatus === "saving" && (
              <span className="phil-iri-sync-status saving">
                <RefreshCw size={14} className="spin-icon" />
                <span>Saving...</span>
              </span>
            )}
            {!screeningActive && !documentLoading && syncStatus === "saved" && (
              <span className="phil-iri-sync-status saved">
                <Cloud size={15} />
                <span>All changes saved to cloud</span>
              </span>
            )}
            {!screeningActive && !documentLoading && syncStatus === "offline" && (
              <span className="phil-iri-sync-status offline">
                <CloudOff size={15} />
                <span>Saved to device storage</span>
              </span>
            )}
          </div>
        </div>
        <div className="phil-iri-tabs-outer phil-iri-header-tabs" role="tablist" aria-label="PHIL-IRI test type">
          <button
            type="button" role="tab" aria-selected={screeningActive}
            className={`phil-iri-tab-button ${screeningActive ? "active" : ""}`}
            onClick={() => setScreeningActive(true)}
          >Screening Test</button>
          <button
            type="button" role="tab"
            aria-selected={!screeningActive}
            className={`phil-iri-tab-button ${!screeningActive ? "active" : ""}`}
            onClick={() => setScreeningActive(false)}
          >Post-Test</button>
        </div>
      </div>

      {/* 2. SUBHEADER & ACTION CONTROLS */}
      <div className="phil-iri-subheader">
        <div className="phil-iri-subheader-info">
          <h2>Section: {sectionName}</h2>
          <p>Philippine Informal Reading Inventory Assessment</p>
        </div>

        <div className="phil-iri-controls-group">
          {/* PARAMETERS & DOWNLOAD ACTIONS SUBROW */}
          <div className="phil-iri-controls-subrow">
            {/* PARAMETERS CONFIGURATION */}
            {!screeningActive && (
              <div className="phil-iri-params-bar">
                <div className="phil-iri-param-field">
                  <label htmlFor="post-test-passage-words">Passage words</label>
                  <input
                    id="post-test-passage-words"
                    type="number"
                    min="1"
                    value={passageWordsCount}
                    disabled={documentLoading}
                    onChange={(e) =>
                      setPassageWordsCount(
                        Math.max(1, Number(e.target.value) || 70),
                      )
                    }
                    onBlur={handleInputBlur}
                    title="Total words in test passage (e.g. 70 or 103)"
                  />
                </div>
                <div className="phil-iri-param-field">
                  <label htmlFor="post-test-total-items">Comprehension items</label>
                  <input
                    id="post-test-total-items"
                    type="number"
                    min="1"
                    value={totalCompItems}
                    disabled={documentLoading}
                    onChange={(e) =>
                      setTotalCompItems(
                        Math.max(1, Number(e.target.value) || 5),
                      )
                    }
                    onBlur={handleInputBlur}
                    title="Total comprehension items"
                  />
                </div>
              </div>
            )}
            {screeningActive && (
              <div
                className="screening-details-slot"
                ref={setScreeningControlsTarget}
              />
            )}

            {/* ACTION BUTTONS */}
            <div className="phil-iri-actions-cluster">
              <button
                type="button"
                className="phil-iri-action-btn download-btn"
                onClick={handleDownloadPDF}
                disabled={isDownloading || rosterLoading || (screeningActive ? screeningStatus === "Loading screening scores…" : assessmentLoading)}
                title="Download official PDF document"
              >
                <Download size={15} />
                {isDownloading ? "Preparing PDF…" : "Download PDF"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. DOCUMENT DISPLAY VIEWPORT */}
      <ScreeningTest
        key={`${sectionId}:${classMeta?.school_year_id || ""}`}
        active={screeningActive}
        sectionId={sectionId}
        schoolYearId={classMeta?.school_year_id}
        maleStudents={maleStudents}
        femaleStudents={femaleStudents}
        classMeta={classMeta}
        sectionDisplay={sectionDisplay}
        schoolYear={schoolYear}
        teacherDisplay={teacherDisplay}
        coordinatorInfo={coordinatorInfo}
        logo={depedLogoBase64 || depedLogoUrl}
        onStatus={setScreeningStatus}
        controlsTarget={screeningControlsTarget}
        rosterLoading={rosterLoading}
        userId={currentUser?.user_id || currentUser?.id}
      />
      {!screeningActive && documentLoading && <PhilIriDocumentSkeleton label="Post-Test" />}
      {!screeningActive && !documentLoading && (
        <div className="phil-iri-document-scroll">
          <div
            className="phil-iri-sheet"
            ref={pdfRef}
            id="philiri-pdf-container"
          >
            {/* EXACT OFFICIAL DEPED HEADER */}
            <div className="phil-iri-sheet-header">
              <img
                src={depedLogoBase64 || depedLogoUrl}
                alt="DepEd Official Seal"
                className="phil-iri-sheet-seal"
                crossOrigin="anonymous"
              />
              <p className="phil-iri-sheet-dept">Republic of the Philippines</p>
              <p className="phil-iri-sheet-dept">Department of Education</p>
              <p className="phil-iri-sheet-dept">
                {classMeta?.region || "Region X"}
              </p>
              <p className="phil-iri-sheet-dept">
                {classMeta?.division
                  ? `Division of ${classMeta.division}`
                  : "Division of Gingoog City"}
              </p>
              <p className="phil-iri-sheet-school">
                {classMeta?.school_name ||
                  "Gingoog City Comprehensive National High School"}
              </p>

              <h2 className="phil-iri-sheet-title">
                Philippine - Informal Reading Inventory (PHIL - IRI)
              </h2>
              <h3 className="phil-iri-sheet-subject">ENGLISH</h3>
              <h4 className="phil-iri-sheet-test-label">
                POST – TEST RESULT
              </h4>
              <p className="phil-iri-sheet-sy">SY {schoolYear}</p>
            </div>

            {/* METADATA BAR */}
            <div className="phil-iri-sheet-meta-row">
              <span>
                Grade & Section: <strong>{sectionDisplay}</strong>
              </span>
              <span>
                Teacher: <strong>{teacherDisplay}</strong>
              </span>
            </div>
            <div className="phil-iri-sheet-meta-subrow">
              <span>
                Enrolment: M- <strong>{totalBoys}</strong>&nbsp;&nbsp;F-{" "}
                <strong>{totalGirls}</strong>&nbsp;&nbsp;T-{" "}
                <strong>{totalEnrolment}</strong>
              </span>
            </div>

            {/* 9-COLUMN EXACT REPLICA TABLE */}
            <div className="post-test-table-scroll" role="region" aria-label="Post-Test scores; scroll horizontally to see all columns" tabIndex={0}>
            <table className="phil-iri-sheet-table">
              <caption className="screening-visually-hidden">Post-Test learner scores and calculated reading levels</caption>
              <thead>
                <tr>
                  <th className="col-no" rowSpan={2} scope="col">No.</th>
                  <th className="col-learner-name" rowSpan={2} scope="col">Learner's Name</th>
                  <th colSpan={3} scope="colgroup">Oral Reading</th>
                  <th colSpan={3} scope="colgroup">Comprehension</th>
                  <th className="col-overall-level" rowSpan={2} scope="col">Overall Reading Level</th>
                </tr>
                <tr>
                  <th className="col-words-read" scope="col">
                    No. of words
                    <br />
                    correctly read
                  </th>
                  <th className="col-oral-pct" scope="col">
                    Accuracy (%)
                  </th>
                  <th className="col-oral-level" scope="col">Reading Level</th>
                  <th className="col-comp-score" scope="col">
                    No. of Correct
                    <br />
                    Answers
                  </th>
                  <th className="col-comp-pct" scope="col">
                    Score (%)
                  </th>
                  <th className="col-comp-level" scope="col">Reading Level</th>
                </tr>
              </thead>
              <tbody>
                {/* BOYS ROSTER */}
                {maleStudents.length > 0 && (
                  <tr className="post-test-gender-row"><th colSpan={9} scope="rowgroup">MALES · {totalBoys} learners</th></tr>
                )}
                {maleStudents.map((st, i) => renderStudentRow(st, i))}

                {/* DIVIDER ROW BETWEEN GENDERS */}
                {femaleStudents.length > 0 && (
                  <tr className="post-test-gender-row"><th colSpan={9} scope="rowgroup">FEMALES · {totalGirls} learners</th></tr>
                )}

                {/* GIRLS ROSTER */}
                {femaleStudents.map((st, i) => renderStudentRow(st, totalBoys + i))}
                {totalEnrolment === 0 && (
                  <tr><td colSpan={9}>
                    <EmptyState className="post-test-empty" title="No learners to display" description="Learners enrolled in this section will appear here." />
                  </td></tr>
                )}
              </tbody>
            </table>
            </div>

            {/* SUMMARY DISTRIBUTION BOX */}
            <div className="phil-iri-sheet-summary-box">
              <table className="phil-iri-sheet-summary-table">
                <caption>Overall Reading Level Summary</caption>
                <thead>
                  <tr>
                    <th scope="col">Learners</th>
                    <th scope="col">INDEPENDENT</th>
                    <th scope="col">INSTRUCTIONAL</th>
                    <th scope="col">FRUSTRATION</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Males</th>
                    <td>
                      <span className="phil-iri-underline-val">
                        {summaryCounts.boys.INDEPENDENT}
                      </span>
                    </td>
                    <td>
                      <span className="phil-iri-underline-val">
                        {summaryCounts.boys.INSTRUCTIONAL}
                      </span>
                    </td>
                    <td>
                      <span className="phil-iri-underline-val">
                        {summaryCounts.boys.FRUSTRATION}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Females</th>
                    <td>
                      <span className="phil-iri-underline-val">
                        {summaryCounts.girls.INDEPENDENT}
                      </span>
                    </td>
                    <td>
                      <span className="phil-iri-underline-val">
                        {summaryCounts.girls.INSTRUCTIONAL}
                      </span>
                    </td>
                    <td>
                      <span className="phil-iri-underline-val">
                        {summaryCounts.girls.FRUSTRATION}
                      </span>
                    </td>
                  </tr>
                  <tr className="phil-iri-total-row">
                    <th scope="row">Total</th>
                    <td>
                      <span className="phil-iri-underline-val">
                        {summaryCounts.boys.INDEPENDENT +
                          summaryCounts.girls.INDEPENDENT}
                      </span>
                    </td>
                    <td>
                      <span className="phil-iri-underline-val">
                        {summaryCounts.boys.INSTRUCTIONAL +
                          summaryCounts.girls.INSTRUCTIONAL}
                      </span>
                    </td>
                    <td>
                      <span className="phil-iri-underline-val">
                        {summaryCounts.boys.FRUSTRATION +
                          summaryCounts.girls.FRUSTRATION}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* BOTTOM BLOCK: SIGNATURES & OFFICIAL FOOTER */}
            <div className="phil-iri-sheet-bottom-block">
              {/* SIGNATURES BLOCK */}
              <div className="phil-iri-sheet-signatures">
                <div className="phil-iri-sig-col">
                  <p className="sig-title">Prepared by:</p>
                  <div className="sig-person-block">
                    <p className="sig-name">{teacherDisplay}</p>
                    <p className="sig-role">
                      Secondary School Teacher (English)
                    </p>
                  </div>
                </div>

                <div className="phil-iri-sig-col">
                  <p className="sig-title">
                    Noted:
                  </p>
                  <div className="sig-person-block right-person">
                    <p className="sig-name">{coordinatorInfo.name || ""}</p>
                    <p className="sig-role">
                      {coordinatorInfo.role || "English Department Coordinator"}
                    </p>
                  </div>
                </div>
              </div>

              {/* OFFICIAL FOOTER */}
              <div className="phil-iri-sheet-footer">
                <img
                  src={gccnhsLogoBase64 || gccnhsLogoUrl}
                  alt="Seal"
                  className="phil-iri-footer-logo-l"
                  crossOrigin="anonymous"
                />

                <div className="phil-iri-footer-middle">
                  <p style={{ margin: 0 }}>
                    National Highway, Brgy 23, Gingoog City
                  </p>
                  <p style={{ margin: 0 }}>Tel. No. : 0926-482-5061</p>
                  <p style={{ margin: 0 }}>Email: gingoog.city@deped.gov.ph</p>
                </div>

                <div className="phil-iri-gold-seal">
                  <span>GINGOOG GOLD</span>
                  <span className="phil-iri-gold-seal-sub">
                    LEARNING • OUTSTANDING LEADERSHIP • DEPED
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
