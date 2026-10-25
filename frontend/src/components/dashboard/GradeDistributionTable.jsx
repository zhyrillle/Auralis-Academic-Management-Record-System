import { useState, useEffect, useMemo } from 'react';
import { Eye, ArrowLeft } from 'lucide-react';
import { getDeptGradeDistributionReport } from '../../services/dashboardApi';
import '../../styles/performanceReport.css';

export default function GradeDistributionTable({ schoolYear }) {
  const [selectedSchoolYear, setSelectedSchoolYear] = useState(schoolYear || '2026-2027');
  const [selectedTerm, setSelectedTerm] = useState('1');
  const [schoolYearOptions, setSchoolYearOptions] = useState([
    { id: '2026-2027', label: 'S.Y. 2026-2027' }
  ]);
  const termOptions = [
    { id: '1', label: 'Term 1' },
    { id: '2', label: 'Term 2' },
    { id: '3', label: 'Term 3' }
  ];

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Drill-down navigation state:
  // Level 1: { level: 'grade' }
  // Level 2: { level: 'teacher', gradeId: 'G8', gradeName: 'Grade 8' }
  // Level 3: { level: 'section', gradeId: 'G8', gradeName: 'Grade 8', teacherId: 3, teacherName: 'Harvey Babia' }
  const [drillDown, setDrillDown] = useState({ level: 'grade' });

  // Update schoolYear if prop changes
  useEffect(() => {
    if (schoolYear && schoolYear !== selectedSchoolYear) {
      setSelectedSchoolYear(schoolYear);
    }
  }, [schoolYear]);

  // Fetch report data whenever school year or term changes
  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      setLoading(true);
      setError(null);
      try {
        const data = await getDeptGradeDistributionReport({
          schoolYear: selectedSchoolYear,
          term: selectedTerm
        });
        if (cancelled) return;
        setReportData(data);
        if (data.schoolYears && data.schoolYears.length > 0) {
          setSchoolYearOptions(
            data.schoolYears.map(sy => ({
              id: `${sy.starts_on}-${sy.ends_on}`,
              label: sy.label || `S.Y. ${sy.starts_on}-${sy.ends_on}`
            }))
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load grade distribution report:', err);
          setError(err.message || 'Failed to load report data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReport();
    return () => {
      cancelled = true;
    };
  }, [selectedSchoolYear, selectedTerm]);

  // Reset drilldown to grade level if filter changes
  useEffect(() => {
    setDrillDown({ level: 'grade' });
  }, [selectedSchoolYear, selectedTerm]);

  // Resolve active rows and summary based on drill-down level
  const { currentRows, currentSummary, levelTitle, parentName } = useMemo(() => {
    if (!reportData || !reportData.grades) {
      return { currentRows: [], currentSummary: null, levelTitle: 'Grade Levels', parentName: '' };
    }

    if (drillDown.level === 'grade') {
      return {
        currentRows: reportData.grades.map(g => ({
          id: g.id,
          name: g.name,
          canDrillDown: g.teachers && g.teachers.length > 0,
          total_score: g.total_score,
          num_takers: g.num_takers,
          score_mean: g.score_mean,
          mps: g.mps,
          no_grade: g.no_grade,
          r60_74: g.r60_74,
          r75_79: g.r75_79,
          r80_84: g.r80_84,
          r85_89: g.r85_89,
          r90_100: g.r90_100,
          rawObj: g
        })),
        currentSummary: reportData.summary,
        levelTitle: 'Grade Levels',
        parentName: ''
      };
    }

    if (drillDown.level === 'teacher') {
      const selectedGrade = reportData.grades.find(g => g.id === drillDown.gradeId);
      const teachers = selectedGrade?.teachers || [];

      // Summary row for this grade level
      const gradeSummary = selectedGrade ? {
        name: 'Total',
        total_score: selectedGrade.total_score,
        num_takers: selectedGrade.num_takers,
        score_mean: selectedGrade.score_mean,
        mps: selectedGrade.mps,
        no_grade: selectedGrade.no_grade,
        r60_74: selectedGrade.r60_74,
        r75_79: selectedGrade.r75_79,
        r80_84: selectedGrade.r80_84,
        r85_89: selectedGrade.r85_89,
        r90_100: selectedGrade.r90_100,
      } : null;

      return {
        currentRows: teachers.map(t => ({
          id: t.id,
          name: t.name,
          canDrillDown: t.sections && t.sections.length > 0,
          total_score: t.total_score,
          num_takers: t.num_takers,
          score_mean: t.score_mean,
          mps: t.mps,
          no_grade: t.no_grade,
          r60_74: t.r60_74,
          r75_79: t.r75_79,
          r80_84: t.r80_84,
          r85_89: t.r85_89,
          r90_100: t.r90_100,
          rawObj: t
        })),
        currentSummary: gradeSummary,
        levelTitle: 'Teachers',
        parentName: drillDown.gradeName
      };
    }

    if (drillDown.level === 'section') {
      const selectedGrade = reportData.grades.find(g => g.id === drillDown.gradeId);
      const selectedTeacher = selectedGrade?.teachers?.find(t => String(t.id) === String(drillDown.teacherId));
      const sections = selectedTeacher?.sections || [];

      // Summary row for this teacher
      const teacherSummary = selectedTeacher ? {
        name: 'Total',
        total_score: selectedTeacher.total_score,
        num_takers: selectedTeacher.num_takers,
        score_mean: selectedTeacher.score_mean,
        mps: selectedTeacher.mps,
        no_grade: selectedTeacher.no_grade,
        r60_74: selectedTeacher.r60_74,
        r75_79: selectedTeacher.r75_79,
        r80_84: selectedTeacher.r80_84,
        r85_89: selectedTeacher.r85_89,
        r90_100: selectedTeacher.r90_100,
      } : null;

      return {
        currentRows: sections.map(s => ({
          id: s.id,
          name: s.name,
          canDrillDown: false,
          total_score: s.total_score,
          num_takers: s.num_takers,
          score_mean: s.score_mean,
          mps: s.mps,
          no_grade: s.no_grade,
          r60_74: s.r60_74,
          r75_79: s.r75_79,
          r80_84: s.r80_84,
          r85_89: s.r85_89,
          r90_100: s.r90_100,
          rawObj: s
        })),
        currentSummary: teacherSummary,
        levelTitle: 'Sections',
        parentName: `${drillDown.gradeName} > ${drillDown.teacherName}`
      };
    }

    return { currentRows: [], currentSummary: null, levelTitle: '', parentName: '' };
  }, [reportData, drillDown]);

  // Drill down handler
  const handleDrillDown = (row) => {
    if (drillDown.level === 'grade') {
      setDrillDown({
        level: 'teacher',
        gradeId: row.id,
        gradeName: row.name
      });
    } else if (drillDown.level === 'teacher') {
      setDrillDown({
        level: 'section',
        gradeId: drillDown.gradeId,
        gradeName: drillDown.gradeName,
        teacherId: row.id,
        teacherName: row.name
      });
    }
  };

  // Back button handler
  const handleBack = () => {
    if (drillDown.level === 'section') {
      setDrillDown({
        level: 'teacher',
        gradeId: drillDown.gradeId,
        gradeName: drillDown.gradeName
      });
    } else if (drillDown.level === 'teacher') {
      setDrillDown({ level: 'grade' });
    }
  };

  const departmentSubject = reportData?.departmentName ? `${reportData.departmentName} Department` : 'Grade Distribution CMSS';

  return (
    <div className="dept-grade-distribution-container" style={{ width: '100%', marginTop: '24px' }}>
      {/* 1. Header & Filters Row */}
      <div className="performance-content" style={{ marginBottom: '20px' }}>
        <h1 className="page-title" style={{ fontSize: '24px', marginBottom: '16px' }}>
          Grade Distribution CMSS — {departmentSubject}
        </h1>

        <div className="filters-row" style={{ marginBottom: '0' }}>
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
                {termOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {error && <div className="dept-error-banner" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* 2. Drilldown Navigation Bar (Breadcrumbs & Back button) */}
      <div className="dept-drilldown-bar">
        <div className="dept-breadcrumbs">
          <span>Viewing:</span>
          {drillDown.level === 'grade' ? (
            <span className="dept-breadcrumb-current">All Grade Levels</span>
          ) : (
            <button
              type="button"
              className="dept-breadcrumb-crumb"
              onClick={() => setDrillDown({ level: 'grade' })}
            >
              All Grade Levels
            </button>
          )}

          {drillDown.level !== 'grade' && (
            <>
              <span style={{ color: '#94a3b8' }}>/</span>
              {drillDown.level === 'teacher' ? (
                <span className="dept-breadcrumb-current">{drillDown.gradeName}</span>
              ) : (
                <button
                  type="button"
                  className="dept-breadcrumb-crumb"
                  onClick={() => setDrillDown({ level: 'teacher', gradeId: drillDown.gradeId, gradeName: drillDown.gradeName })}
                >
                  {drillDown.gradeName}
                </button>
              )}
            </>
          )}

          {drillDown.level === 'section' && (
            <>
              <span style={{ color: '#94a3b8' }}>/</span>
              <span className="dept-breadcrumb-current">{drillDown.teacherName}</span>
            </>
          )}
        </div>

        {drillDown.level !== 'grade' && (
          <button type="button" className="dept-back-btn" onClick={handleBack}>
            <ArrowLeft size={14} /> Back to {drillDown.level === 'section' ? 'Teachers' : 'Grade Levels'}
          </button>
        )}
      </div>

      {/* 3. Mean and MPS Table */}
      <div className="report-card">
        <h2>Mean and MPS {parentName ? `— ${parentName}` : ''}</h2>
        <div className="table-wrap">
          <table className="performance-table">
            <thead>
              <tr>
                <th style={{ minWidth: '220px' }}>
                  {drillDown.level === 'grade' ? 'Grade Level' : drillDown.level === 'teacher' ? 'Teacher' : 'Section'}
                </th>
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
              ) : currentRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="no-data-row">
                    No data provided yet
                  </td>
                </tr>
              ) : (
                <>
                  {currentRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="dept-name-cell">
                          <span>{row.name}</span>
                          {row.canDrillDown ? (
                            <button
                              type="button"
                              className="dept-eye-btn"
                              title={`View ${drillDown.level === 'grade' ? 'teachers' : 'sections'} for ${row.name}`}
                              aria-label={`View ${drillDown.level === 'grade' ? 'teachers' : 'sections'} for ${row.name}`}
                              onClick={() => handleDrillDown(row)}
                            >
                              <Eye size={16} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="dept-eye-btn disabled"
                              disabled
                              title={drillDown.level === 'section' ? 'End of breakdown' : 'No data available'}
                              aria-label="No data available"
                              tabIndex={-1}
                            >
                              <Eye size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td>{row.total_score !== undefined ? Number(row.total_score).toFixed(2) : '0.00'}</td>
                      <td>{row.num_takers ?? 0}</td>
                      <td>{row.score_mean !== undefined ? Number(row.score_mean).toFixed(2) : '0.00'}</td>
                      <td>{row.mps !== undefined ? `${Number(row.mps).toFixed(2)}%` : '0.00%'}</td>
                    </tr>
                  ))}

                  {currentSummary && (
                    <tr className="average-row">
                      <td>
                        <strong>{currentSummary.name}</strong>
                      </td>
                      <td>
                        <strong>{Number(currentSummary.total_score || 0).toFixed(2)}</strong>
                      </td>
                      <td>
                        <strong>{currentSummary.num_takers || 0}</strong>
                      </td>
                      <td>
                        <strong>{Number(currentSummary.score_mean || 0).toFixed(2)}</strong>
                      </td>
                      <td>
                        <strong>{Number(currentSummary.mps || 0).toFixed(2)}%</strong>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Grade Range Table */}
      <div className="report-card">
        <h2>Grade Range {parentName ? `— ${parentName}` : ''}</h2>
        <div className="table-wrap">
          <table className="performance-table grade-table">
            <thead>
              <tr>
                <th style={{ minWidth: '220px', textAlign: 'left' }}>
                  {drillDown.level === 'grade' ? 'Grade Level' : drillDown.level === 'teacher' ? 'Teacher' : 'Section'}
                </th>
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
              ) : currentRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="no-data-row">
                    No data provided yet
                  </td>
                </tr>
              ) : (
                <>
                  {currentRows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ textAlign: 'left' }}>
                        <div className="dept-name-cell">
                          <span>{row.name}</span>
                          {row.canDrillDown ? (
                            <button
                              type="button"
                              className="dept-eye-btn"
                              title={`View ${drillDown.level === 'grade' ? 'teachers' : 'sections'} for ${row.name}`}
                              aria-label={`View ${drillDown.level === 'grade' ? 'teachers' : 'sections'} for ${row.name}`}
                              onClick={() => handleDrillDown(row)}
                            >
                              <Eye size={16} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="dept-eye-btn disabled"
                              disabled
                              title={drillDown.level === 'section' ? 'End of breakdown' : 'No data available'}
                              aria-label="No data available"
                              tabIndex={-1}
                            >
                              <Eye size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td>{row.no_grade ?? 0}</td>
                      <td>{row.r60_74 ?? 0}</td>
                      <td>{row.r75_79 ?? 0}</td>
                      <td>{row.r80_84 ?? 0}</td>
                      <td>{row.r85_89 ?? 0}</td>
                      <td>{row.r90_100 ?? 0}</td>
                    </tr>
                  ))}

                  {currentSummary && (
                    <tr className="average-row">
                      <td style={{ textAlign: 'left' }}>
                        <strong>{currentSummary.name}</strong>
                      </td>
                      <td>
                        <strong>{currentSummary.no_grade || 0}</strong>
                      </td>
                      <td>
                        <strong>{currentSummary.r60_74 || 0}</strong>
                      </td>
                      <td>
                        <strong>{currentSummary.r75_79 || 0}</strong>
                      </td>
                      <td>
                        <strong>{currentSummary.r80_84 || 0}</strong>
                      </td>
                      <td>
                        <strong>{currentSummary.r85_89 || 0}</strong>
                      </td>
                      <td>
                        <strong>{currentSummary.r90_100 || 0}</strong>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
