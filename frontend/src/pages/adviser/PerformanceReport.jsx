import { cachedApiFetch as fetch } from "../../services/navigationCache.js";
import { useState, useEffect, useMemo } from "react";
import "../../styles/performanceReport.css";
import { getStoredUser } from "../../utils/auth";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export default function PerformanceReport() {
  const user = getStoredUser();
  const effectiveUserId = user?.user_id || user?.id || user?.user?.user_id || user?.user?.id || 3;

  const [selectedSchoolYear, setSelectedSchoolYear] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");

  const [schoolYearOptions, setSchoolYearOptions] = useState([]);
  const [termOptions, setTermOptions] = useState([
    { id: "1", label: "Term 1" },
    { id: "2", label: "Term 2" },
    { id: "3", label: "Term 3" },
  ]);
  const [subjectOptions, setSubjectOptions] = useState([]);

  const [sectionsData, setSectionsData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load school year, term, and subject filters dynamically from MySQL database
  useEffect(() => {
    async function loadFilters() {
      try {
        const queryParams = new URLSearchParams();
        if (effectiveUserId) queryParams.set("userId", String(effectiveUserId));
        if (selectedSchoolYear) queryParams.set("schoolYearId", String(selectedSchoolYear));

        const res = await fetch(`${API_BASE_URL}/adviser/dashboard/performance-filters?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.schoolYears && data.schoolYears.length > 0) {
            const mappedSY = data.schoolYears.map((sy) => ({
              id: String(sy.school_year_id),
              label: sy.label || `S.Y. ${sy.starts_on}-${sy.ends_on}`,
              is_active: Boolean(sy.is_active),
            }));
            setSchoolYearOptions(mappedSY);
            setSelectedSchoolYear((prev) => {
              if (prev && mappedSY.some((sy) => sy.id === prev)) return prev;
              const active = mappedSY.find((sy) => sy.is_active);
              const defaultSy = data.currentSchoolYearId ? String(data.currentSchoolYearId) : (active ? active.id : mappedSY[0].id);
              return defaultSy;
            });
          }
          if (data.terms && data.terms.length > 0) {
            const formattedTerms = data.terms.map((t) => {
              if (typeof t === "object") {
                return {
                  id: String(t.value || t.id),
                  label: t.label || `Term ${t.value || t.id}`,
                  is_active: Boolean(t.is_active || t.is_current),
                };
              }
              return { id: String(t), label: `Term ${t}`, is_active: false };
            });
            setTermOptions(formattedTerms);
            const activeTermObj = formattedTerms.find((t) => t.is_active);
            const targetDefaultTerm = data.currentTerm ? String(data.currentTerm) : (activeTermObj ? activeTermObj.id : formattedTerms[0].id);
            setSelectedTerm((prev) => {
              if (prev && formattedTerms.some((t) => t.id === prev)) return prev;
              return targetDefaultTerm;
            });
          }
          if (data.subjects && data.subjects.length > 0) {
            const mappedSubjects = data.subjects.map((s) => ({
              id: String(s.subject_id),
              label: s.label || s.subject_name,
            }));
            setSubjectOptions(mappedSubjects);
            setSelectedSubject((prev) => {
              if (prev && (prev === "all" || mappedSubjects.some((sub) => sub.id === prev))) return prev;
              return "all";
            });
          } else {
            setSubjectOptions([]);
            setSelectedSubject("all");
          }
        }
      } catch (err) {
        console.warn("Failed to load performance filters:", err);
      }
    }
    loadFilters();
  }, [effectiveUserId, selectedSchoolYear]);

  // Fetch dynamic Performance report data from database based on quarterly_grade
  useEffect(() => {
    async function fetchGradeRangeData() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          term: selectedTerm || "1",
          subjectId: selectedSubject || "all",
        });

        if (selectedSchoolYear) {
          params.append("schoolYearId", String(selectedSchoolYear));
        }

        if (effectiveUserId) {
          params.append("userId", String(effectiveUserId));
        }

        const res = await fetch(`${API_BASE_URL}/adviser/dashboard/grade-range-report?${params.toString()}`, { force: true });
        if (res.ok) {
          const data = await res.json();
          setSectionsData(data.sections || []);
        } else {
          setSectionsData([]);
        }
      } catch (err) {
        console.error("Error fetching performance report:", err);
        setSectionsData([]);
      } finally {
        setLoading(false);
      }
    }

    fetchGradeRangeData();
  }, [selectedSchoolYear, selectedTerm, selectedSubject, effectiveUserId]);

  // Calculate totals and averages across all handled sections dynamically
  const summaryRow = useMemo(() => {
    if (!sectionsData || sectionsData.length === 0) return null;

    const submittedSections = sectionsData.filter((r) => r.is_submitted);
    const hasSubmitted = submittedSections.length > 0;

    const sumNoGrade = submittedSections.reduce((acc, r) => acc + (Number(r.no_grade) || 0), 0);
    const sum60_74 = submittedSections.reduce((acc, r) => acc + (Number(r.r60_74) || 0), 0);
    const sum75_79 = submittedSections.reduce((acc, r) => acc + (Number(r.r75_79) || 0), 0);
    const sum80_84 = submittedSections.reduce((acc, r) => acc + (Number(r.r80_84) || 0), 0);
    const sum85_89 = submittedSections.reduce((acc, r) => acc + (Number(r.r85_89) || 0), 0);
    const sum90_100 = submittedSections.reduce((acc, r) => acc + (Number(r.r90_100) || 0), 0);

    // Calculate Average of Score Mean and MPS
    // Prioritize sections with test takers / valid scores, or fall back to all sections
    const sectionsWithScores = sectionsData.filter((r) => (Number(r.num_takers) || 0) > 0 || (Number(r.score_mean) || 0) > 0);
    const meanTargetList = sectionsWithScores.length > 0 ? sectionsWithScores : sectionsData;
    const avgScoreMean = meanTargetList.length > 0
      ? Math.round((meanTargetList.reduce((acc, r) => acc + (Number(r.score_mean) || 0), 0) / meanTargetList.length) * 100) / 100
      : 0;
    const avgMps = meanTargetList.length > 0
      ? Math.round((meanTargetList.reduce((acc, r) => acc + (Number(r.mps) || 0), 0) / meanTargetList.length) * 100) / 100
      : 0;

    return {
      section_name: submittedSections.length === sectionsData.length ? "Total" : "Total (Submitted)",
      has_submitted_data: hasSubmitted,
      submitted_count: submittedSections.length,
      total_count: sectionsData.length,
      no_grade: sumNoGrade,
      r60_74: sum60_74,
      r75_79: sum75_79,
      r80_84: sum80_84,
      r85_89: sum85_89,
      r90_100: sum90_100,
      avg_score_mean: avgScoreMean,
      avg_mps: avgMps,
    };
  }, [sectionsData]);

  return (
    <div className="performance-page">
      <main className="performance-main">
        <div className="performance-content">
          <h1 className="page-title">Performance Report</h1>

          <div className="filters-row">
            <div className="filters-label">FILTERS:</div>
            <div className="filters">
              {schoolYearOptions.length > 0 && (
                <label className="filter-control">
                  <select
                    value={selectedSchoolYear}
                    onChange={(e) => setSelectedSchoolYear(e.target.value)}
                    aria-label="School Year"
                  >
                    {schoolYearOptions.map((sy) => (
                      <option key={sy.id} value={sy.id}>
                        {sy.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="filter-control">
                <select
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                  aria-label="Term"
                >
                  {termOptions.map((t) => {
                    const val = typeof t === "object" ? t.id || t.value : String(t);
                    const lbl = typeof t === "object" ? t.label : `Term ${t}`;
                    return (
                      <option key={val} value={val}>
                        {lbl}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="filter-control">
                <select
                  value={selectedSubject || "all"}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  aria-label="Subject"
                >
                  <option value="all">All Subjects</option>
                  {subjectOptions.map((subj) => (
                    <option key={subj.id} value={subj.id}>
                      {subj.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* 1. Mean and MPS Table */}
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
                {loading ? (
                  <tr>
                    <td colSpan={5} className="no-data-row">
                      Loading report data...
                    </td>
                  </tr>
                ) : sectionsData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="no-data-row">
                      No data provided yet
                    </td>
                  </tr>
                ) : (
                  <>
                    {sectionsData.map((row, idx) => (
                      <tr key={row.section_id || idx}>
                        <td>{row.section_name}</td>
                        <td>{row.total_score ?? 0}</td>
                        <td>{row.num_takers ?? 0}</td>
                        <td>{row.score_mean !== undefined ? Number(row.score_mean).toFixed(2) : "0.00"}</td>
                        <td>{row.mps !== undefined ? `${Number(row.mps).toFixed(2)}%` : "0.00%"}</td>
                      </tr>
                    ))}

                    {summaryRow && (
                      <tr className="average-row">
                        <td colSpan={3} className="average-label-cell">
                          <strong>Average</strong>
                        </td>
                        <td>
                          <strong>{Number(summaryRow.avg_score_mean || 0).toFixed(2)}</strong>
                        </td>
                        <td>
                          <strong>{Number(summaryRow.avg_mps || 0).toFixed(2)}%</strong>
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Grade Range Table */}
        <div className="report-card">
          <div className="report-card-header">
            <h2>Grade Range</h2>
            <span className="report-card-hint">
              Distribution data is displayed only for sections with officially submitted grades.
            </span>
          </div>
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
                {loading ? (
                  <tr>
                    <td colSpan={7} className="no-data-row">
                      Loading grade range data...
                    </td>
                  </tr>
                ) : sectionsData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="no-data-row">
                      No data provided yet
                    </td>
                  </tr>
                ) : (
                  <>
                    {sectionsData.map((row, idx) => (
                      <tr key={row.section_id || idx} className={row.is_submitted ? "row-submitted" : "row-unsubmitted"}>
                        <td className="section-name-td">
                          <div className="section-cell-inner">
                            <span className="section-name-text">{row.section_name}</span>
                            {row.is_submitted ? (
                              <span className="status-pill status-pill-submitted" title="Grades officially submitted">
                                Submitted
                              </span>
                            ) : (
                              <span className="status-pill status-pill-pending" title="Grades pending submission">
                                Pending
                              </span>
                            )}
                          </div>
                        </td>
                        {row.is_submitted ? (
                          <>
                            <td>{row.no_grade ?? 0}</td>
                            <td>{row.r60_74 ?? 0}</td>
                            <td>{row.r75_79 ?? 0}</td>
                            <td>{row.r80_84 ?? 0}</td>
                            <td>{row.r85_89 ?? 0}</td>
                            <td>{row.r90_100 ?? 0}</td>
                          </>
                        ) : (
                          <td colSpan={6} className="unsubmitted-notice-cell">
                            <div className="unsubmitted-notice-box">
                              <span className="unsubmitted-notice-icon" aria-hidden="true">⚠️</span>
                              <span className="unsubmitted-notice-text">
                                Grades not yet submitted for this section. Distribution will display once submitted.
                              </span>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}

                    {summaryRow && summaryRow.has_submitted_data && (
                      <tr className="average-row">
                        <td>
                          <strong>{summaryRow.section_name}</strong>
                        </td>
                        <td>
                          <strong>{summaryRow.no_grade}</strong>
                        </td>
                        <td>
                          <strong>{summaryRow.r60_74}</strong>
                        </td>
                        <td>
                          <strong>{summaryRow.r75_79}</strong>
                        </td>
                        <td>
                          <strong>{summaryRow.r80_84}</strong>
                        </td>
                        <td>
                          <strong>{summaryRow.r85_89}</strong>
                        </td>
                        <td>
                          <strong>{summaryRow.r90_100}</strong>
                        </td>
                      </tr>
                    )}

                    {summaryRow && !summaryRow.has_submitted_data && (
                      <tr className="average-row">
                        <td>
                          <strong>Total</strong>
                        </td>
                        <td colSpan={6} className="no-submitted-summary-cell">
                          No submitted section grades for this term yet.
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
