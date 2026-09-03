import { Fragment } from "react";

const SUBJECT_COUNT = 8;
const GRADE_CELL_COUNT = SUBJECT_COUNT * 4;

const renderLearnerRows = (count, group) =>
  Array.from({ length: count }, (_, rowIndex) => (
    <tr
      className="ms-student-row ms-skeleton-student-row"
      key={`${group}-learner-skeleton-${rowIndex}`}
    >
      <td className="ms-name-cell">
        <span className="ms-skeleton-block ms-skeleton-block--student-name" />
        <span className="ms-skeleton-block ms-skeleton-block--student-lrn" />
      </td>
      {Array.from({ length: GRADE_CELL_COUNT }, (_, cellIndex) => (
        <td
          className={cellIndex % 4 === 3 ? "ms-final-cell" : "ms-grade-cell"}
          key={`${group}-grade-skeleton-${rowIndex}-${cellIndex}`}
        >
          <span className="ms-skeleton-block ms-skeleton-block--grade" />
        </td>
      ))}
      <td className="ms-gen-avg-cell">
        <span className="ms-skeleton-block ms-skeleton-block--grade" />
      </td>
    </tr>
  ));

const renderGroupRow = (tone) => (
  <tr className={`ms-sex-header-row ms-sex-header-row--${tone}`}>
    <th scope="rowgroup" className="ms-sex-header-cell">
      <span className="ms-skeleton-block ms-skeleton-block--group" />
    </th>
    <td className="ms-sex-header-fill" colSpan={GRADE_CELL_COUNT + 1} />
  </tr>
);

export default function MasterSheetSkeleton() {
  return (
    <div className="ms-skeleton" role="status" aria-live="polite">
      <span className="ms-sr-only">Loading Master Sheet data.</span>
      <div aria-hidden="true">
        <div className="ms-page-header ms-skeleton-page-header">
          <div className="ms-skeleton-heading">
            <span className="ms-skeleton-block ms-skeleton-block--eyebrow" />
            <span className="ms-skeleton-block ms-skeleton-block--title" />
            <span className="ms-skeleton-block ms-skeleton-block--subtitle" />
          </div>
          <div className="ms-selectors ms-skeleton-selectors">
            {Array.from({ length: 2 }, (_, index) => (
              <div className="ms-selector-field" key={`selector-skeleton-${index}`}>
                <span className="ms-skeleton-block ms-skeleton-block--selector-label" />
                <span className="ms-skeleton-block ms-skeleton-block--selector" />
              </div>
            ))}
          </div>
        </div>

        <div className="ms-controls-row ms-skeleton-controls">
          <div className="ms-summary">
            <span className="ms-summary__metric ms-skeleton-metric">
              <span className="ms-skeleton-block ms-skeleton-block--metric-value" />
              <span className="ms-skeleton-block ms-skeleton-block--metric-label" />
            </span>
            <span className="ms-summary__metric ms-skeleton-metric ms-skeleton-metric--wide">
              <span className="ms-skeleton-block ms-skeleton-block--metric-value" />
              <span className="ms-skeleton-block ms-skeleton-block--metric-label-wide" />
            </span>
          </div>
          <div className="ms-control-actions ms-skeleton-control-actions">
            <span className="ms-skeleton-block ms-skeleton-block--search" />
            <span className="ms-skeleton-block ms-skeleton-block--button" />
          </div>
        </div>

        <div className="ms-table-wrapper ms-skeleton-table-wrapper">
          <table className="ms-table ms-skeleton-grade-table">
            <thead>
              <tr className="ms-header-row-1">
                <th className="ms-name-header-cell" rowSpan={3}>
                  <span className="ms-skeleton-block ms-skeleton-block--name-header" />
                </th>
                {Array.from({ length: SUBJECT_COUNT }, (_, index) => (
                  <th
                    className="ms-subject-header"
                    colSpan={4}
                    key={`subject-skeleton-${index}`}
                  >
                    <span className="ms-skeleton-block ms-skeleton-block--subject-header" />
                  </th>
                ))}
                <th className="ms-gen-avg-header" rowSpan={3}>
                  <span className="ms-skeleton-block ms-skeleton-block--general-average" />
                </th>
              </tr>
              <tr className="ms-header-row-2">
                {Array.from({ length: SUBJECT_COUNT }, (_, index) => (
                  <Fragment key={`term-header-skeleton-${index}`}>
                    <th className="ms-term-group-header" colSpan={3}>
                      <span className="ms-skeleton-block ms-skeleton-block--term-header" />
                    </th>
                    <th className="ms-fg-header-cell" rowSpan={2}>
                      <span className="ms-skeleton-block ms-skeleton-block--final-header" />
                    </th>
                  </Fragment>
                ))}
              </tr>
              <tr className="ms-header-row-3">
                {Array.from({ length: SUBJECT_COUNT * 3 }, (_, index) => (
                  <th className="ms-term-cell" key={`term-cell-skeleton-${index}`}>
                    <span className="ms-skeleton-block ms-skeleton-block--term-number" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderGroupRow("male")}
              {renderLearnerRows(3, "male")}
              {renderGroupRow("female")}
              {renderLearnerRows(2, "female")}
            </tbody>
          </table>
        </div>

        <footer className="ms-submission-footer ms-skeleton-footer">
          <div className="ms-submission-footer__copy">
            <span className="ms-skeleton-block ms-skeleton-block--footer-icon" />
            <span className="ms-skeleton-block ms-skeleton-block--deadline" />
          </div>
          <span className="ms-skeleton-block ms-skeleton-block--submit" />
        </footer>
      </div>
    </div>
  );
}
