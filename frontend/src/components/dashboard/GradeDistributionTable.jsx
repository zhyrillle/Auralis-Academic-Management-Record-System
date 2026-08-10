/**
 * @typedef {Object} GradeDistributionItem
 * @property {string} gradeLevel
 * @property {number|null} term1Mean
 * @property {number|null} term2Mean
 * @property {number|null} term3Mean
 * @property {number|null} term1Mps
 * @property {number|null} term2Mps
 * @property {number|null} term3Mps
 */

/**
 * @typedef {Object} GradeDistributionTableProps
 * @property {GradeDistributionItem[]} data
 * @property {string} [schoolYear]
 * @property {boolean} [loading]
 */

export default function GradeDistributionTable({ data, schoolYear, loading }) {
  let averageRow = null;

  if (!loading && data.length > 0) {
    const sum = (arr, key) =>
      arr.reduce((acc, item) => {
        if (item[key] == null) return acc;
        return acc + item[key];
      }, 0);

    const count = (arr, key) =>
      arr.reduce((acc, item) => {
        if (item[key] == null) return acc;
        return acc + 1;
      }, 0);

    const avg = (arr, key) => {
      const c = count(arr, key);
      return c > 0 ? Math.round((sum(arr, key) / c) * 100) / 100 : null;
    };

    averageRow = {
      gradeLevel: "Average",
      term1Mean: avg(data, "term1Mean"),
      term2Mean: avg(data, "term2Mean"),
      term3Mean: avg(data, "term3Mean"),
      term1Mps: avg(data, "term1Mps"),
      term2Mps: avg(data, "term2Mps"),
      term3Mps: avg(data, "term3Mps"),
    };
  }

  const formatValue = (val) => (val == null ? "—" : val.toFixed(2));

  return (
    <div className="dept-card">
      <div className="dept-card-header-row">
        <h2 className="dept-card-title">Grade Distribution CMSS</h2>
        <select
          className="dept-filter-select dept-distribution-sy"
          value={schoolYear}
          onChange={() => {}}
          disabled
        >
          <option value="">School Year</option>
        </select>
      </div>
      <div className="dept-table-wrap">
        <table className="dept-table dept-grade-table">
          <thead>
            <tr>
              <th rowSpan={2} className="dept-grade-row-header">Grade Level</th>
              <th colSpan={3} className="dept-grade-super-header">Score Mean</th>
              <th colSpan={3} className="dept-grade-super-header">MPS</th>
            </tr>
            <tr>
              <th>Term 1</th>
              <th>Term 2</th>
              <th>Term 3</th>
              <th>Term 1</th>
              <th>Term 2</th>
              <th>Term 3</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="dept-no-data-row">
                  No data provided yet
                </td>
              </tr>
            )}
            {data.map((row, idx) => (
              <tr key={idx}>
                <td>{row.gradeLevel}</td>
                <td>{formatValue(row.term1Mean)}</td>
                <td>{formatValue(row.term2Mean)}</td>
                <td>{formatValue(row.term3Mean)}</td>
                <td>{formatValue(row.term1Mps)}</td>
                <td>{formatValue(row.term2Mps)}</td>
                <td>{formatValue(row.term3Mps)}</td>
              </tr>
            ))}
            {averageRow && (
              <tr className="dept-average-row">
                <td><strong>{averageRow.gradeLevel}</strong></td>
                <td><strong>{formatValue(averageRow.term1Mean)}</strong></td>
                <td><strong>{formatValue(averageRow.term2Mean)}</strong></td>
                <td><strong>{formatValue(averageRow.term3Mean)}</strong></td>
                <td><strong>{formatValue(averageRow.term1Mps)}</strong></td>
                <td><strong>{formatValue(averageRow.term2Mps)}</strong></td>
                <td><strong>{formatValue(averageRow.term3Mps)}</strong></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="dept-card-footer">
        <button className="dept-link-btn" type="button">View Details →</button>
      </div>
    </div>
  );
}


