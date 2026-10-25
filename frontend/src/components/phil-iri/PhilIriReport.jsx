import { SCREENING_PARTS } from "../../utils/philIriScreening";
import depedLogoUrl from "../../assets/deped_logo.png";
import "../../styles/PhilIriPage.css";
import "../../styles/philIriPostTest.css";
import "../../styles/philIriScreening.css";

// Presentation only: these components never fetch, save, or read device drafts.
export function PhilIriInstitutionalHeader({
  logo = depedLogoUrl,
  compact = false,
  schoolName = "Gingoog City Comprehensive National High School",
  region = "Region X",
  division = "Gingoog City",
}) {
  return (
    <>
      <img
        src={logo}
        alt="DepEd Official Seal"
        className="phil-iri-sheet-seal"
        crossOrigin="anonymous"
      />
      {compact ? (
        <p className="phil-iri-sheet-dept">
          Republic of the Philippines · Department of Education
        </p>
      ) : (
        <>
          <p className="phil-iri-sheet-dept">Republic of the Philippines</p>
          <p className="phil-iri-sheet-dept">Department of Education</p>
          <p className="phil-iri-sheet-dept">{region}</p>
          <p className="phil-iri-sheet-dept">Division of {division}</p>
        </>
      )}
      <p className="phil-iri-sheet-school">{schoolName}</p>
    </>
  );
}

export function PhilIriReportHeader({
  children,
  schoolYear,
  testLabel,
  title = "Philippine - Informal Reading Inventory (PHIL - IRI)",
}) {
  return (
    <div className="phil-iri-sheet-header">
      {children}
      <h2 className="phil-iri-sheet-title">{title}</h2>
      <h3 className="phil-iri-sheet-subject">ENGLISH</h3>
      {testLabel && <h4 className="phil-iri-sheet-test-label">{testLabel}</h4>}
      <p className="phil-iri-sheet-sy">SY {schoolYear}</p>
    </div>
  );
}

export function PhilIriScreeningTable({
  children,
  footer,
  renderMaximum,
  renderBoundary,
  maxima = {},
  showLrn = false,
  showStatus = false,
  className = "",
}) {
  return (
    <table className={"screening-table " + className}>
      <caption className="screening-visually-hidden">
        Screening test learner record
      </caption>
      <thead>
        <tr>
          <th rowSpan={2} scope="col">
            No.
          </th>
          <th rowSpan={2} scope="col">
            Learner’s Name
          </th>
          {showLrn && (
            <th className="col-lrn" rowSpan={2} scope="col">
              LRN
            </th>
          )}
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
            {renderBoundary("<")}
          </th>
          <th rowSpan={2} scope="col">
            {renderBoundary("≥")}
          </th>
          {showStatus && (
            <th rowSpan={2} scope="col">
              Status
            </th>
          )}
        </tr>
        <tr>
          {SCREENING_PARTS.map((part) => (
            <th scope="col" key={part}>
              {part[0].toUpperCase() + part.slice(1)}
              <br />
              {renderMaximum ? (
                renderMaximum(part)
              ) : (
                <span
                  className="screening-item-count phil-iri-score-max"
                  aria-label={
                    maxima[part] === ""
                      ? "Highest possible score not recorded"
                      : "Highest possible score: " + (maxima[part] ?? "—")
                  }
                  title={
                    maxima[part] === "Varies"
                      ? "Each learner’s score shows its applicable maximum."
                      : "Highest possible score from saved assessment settings"
                  }
                >
                  {maxima[part] === "" ? "" : "(" + (maxima[part] ?? "—") + ")"}
                </span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
      {footer && <tfoot>{footer}</tfoot>}
    </table>
  );
}

export function PhilIriPostTestTable({
  children,
  showLrn = false,
  showStatus = false,
  className = "",
}) {
  return (
    <table className={"phil-iri-sheet-table " + className}>
      <caption className="screening-visually-hidden">
        Post-Test learner scores and calculated reading levels
      </caption>
      <thead>
        <tr>
          <th className="col-no" rowSpan={2} scope="col">
            No.
          </th>
          <th className="col-learner-name" rowSpan={2} scope="col">
            Learner's Name
          </th>
          {showLrn && (
            <th className="col-lrn" rowSpan={2} scope="col">
              LRN
            </th>
          )}
          <th colSpan={3} scope="colgroup">
            Oral Reading
          </th>
          <th colSpan={3} scope="colgroup">
            Comprehension
          </th>
          <th className="col-overall-level" rowSpan={2} scope="col">
            Overall Reading Level
          </th>
          {showStatus && (
            <th rowSpan={2} scope="col">
              Status
            </th>
          )}
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
          <th className="col-oral-level" scope="col">
            Reading Level
          </th>
          <th className="col-comp-score" scope="col">
            No. of Correct
            <br />
            Answers
          </th>
          <th className="col-comp-pct" scope="col">
            Score (%)
          </th>
          <th className="col-comp-level" scope="col">
            Reading Level
          </th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

const LEVELS = ["INDEPENDENT", "INSTRUCTIONAL", "FRUSTRATION"];
export function PhilIriReadingSummary({ counts }) {
  const rows = [
    { key: "boys", label: "Males" },
    { key: "girls", label: "Females" },
  ];
  if (counts.unknown) rows.push({ key: "unknown", label: "Sex not recorded" });
  const total = Object.fromEntries(
    LEVELS.map((level) => [
      level,
      rows.reduce((sum, row) => sum + (counts[row.key]?.[level] ?? 0), 0),
    ]),
  );
  return (
    <div className="phil-iri-sheet-summary-box">
      <table className="phil-iri-sheet-summary-table">
        <caption>Overall Reading Level Summary</caption>
        <thead>
          <tr>
            <th scope="col">Learners</th>
            {LEVELS.map((level) => (
              <th scope="col" key={level}>
                {level}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows, { key: "total", label: "Total" }].map((row) => (
            <tr
              key={row.key}
              className={row.key === "total" ? "phil-iri-total-row" : undefined}
            >
              <th scope="row">{row.label}</th>
              {LEVELS.map((level) => (
                <td key={level}>
                  <span className="phil-iri-underline-val">
                    {(row.key === "total"
                      ? total[level]
                      : counts[row.key]?.[level]) ?? 0}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
