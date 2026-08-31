import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

const statusClass = (status) => status.toLowerCase().replaceAll(" ", "-");

export default function HistoricalComparisonTable({ rows, primaryLabel, comparisonLabel }) {
  return (
    <div className="pa-table-scroll-shell">
      <div className="pa-comparison-table-wrap" tabIndex="0" aria-label="Scrollable subject comparison table">
        <table className="pa-comparison-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>{primaryLabel}<span>Average Grade</span></th>
            <th>{comparisonLabel}<span>Average Grade</span></th>
            <th>Difference</th>
            <th>Pass Rate</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const DifferenceIcon = row.difference > 0 ? ArrowUpRight : row.difference < 0 ? ArrowDownRight : ArrowRight;
            return (
              <tr key={row.id}>
                <th scope="row">{row.label}<span>{row.code}</span></th>
                <td>{row.primaryAverage}</td>
                <td>{row.comparisonAverage}</td>
                <td>
                  <span className={`pa-difference ${row.difference > 0 ? "is-positive" : row.difference < 0 ? "is-negative" : ""}`}>
                    <DifferenceIcon size={15} aria-hidden="true" />
                    {row.difference > 0 ? "+" : ""}{row.difference}
                  </span>
                </td>
                <td>{row.passRate}%</td>
                <td><span className={`pa-status pa-status--${statusClass(row.status)}`}>{row.status}</span></td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
      <span className="pa-table-scroll-hint" aria-hidden="true">
        Swipe or scroll to view all columns
      </span>
    </div>
  );
}
