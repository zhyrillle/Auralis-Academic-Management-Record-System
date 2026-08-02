import { useState } from "react";
import "../../styles/performanceReport.css";

export default function PerformanceReport() {
  const [termOptions] = useState([]);
  const [sectionOptions] = useState([]);
  const [dataProvided] = useState(false);

  // (code)
  // useEffect(() => {
  //   async function loadFilters() {
  //     const response = await fetch("/api/adviser/performance/filters");
  //     const data = await response.json();
  //     setTermOptions(data.terms || []);
  //     setSectionOptions(data.sections || []);
  //   }
  //   loadFilters();
  // }, []);
  // (code)

  return (
    <div className="performance-page">
      <main className="performance-main">
        <div className="performance-content">
          <h1 className="page-title">Performance Report</h1>

          <div className="filters-row">
            <div className="filters-label">FILTERS:</div>
            <div className="filters">
              <label className="filter-control">
                <select defaultValue="" aria-label="Term">
                  <option value="">Term</option>
                  {termOptions.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-control">
                <select defaultValue="" aria-label="Section">
                  <option value="">Section</option>
                  {sectionOptions.map((section) => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="report-card">
          <h2>Mean and MPS</h2>
          <div className="table-wrap">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Total Score</th>
                  <th>Number of Takers</th>
                  <th>Score Mean</th>
                  <th>MPS</th>
                </tr>
              </thead>
              <tbody>
                {!dataProvided && (
                  <tr>
                    <td colSpan={5} className="no-data-row">
                      No data provided yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="report-card">
          <h2>Grade Range</h2>
          <div className="table-wrap">
            <table className="performance-table grade-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>No Grade</th>
                  <th>60-74</th>
                  <th>75-79</th>
                  <th>80-84</th>
                  <th>85-89</th>
                  <th>90-100</th>
                </tr>
              </thead>
              <tbody>
                {!dataProvided && (
                  <tr>
                    <td colSpan={7} className="no-data-row">
                      No data provided yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
