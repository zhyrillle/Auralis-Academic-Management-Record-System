import { useState } from 'react';
import { SearchX } from 'lucide-react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import SearchBar from '../../components/common/SearchBar';
import EmptyState from '../../components/common/EmptyState';
import StudentRiskCard from '../../components/at-risk/StudentRiskCard';
import LearnerPredictionDialog from '../../components/at-risk/LearnerPredictionDialog';
import LearnerFilterPanel from '../../components/at-risk/LearnerFilterPanel';
import { AtRiskFilters } from '../../components/at-risk/AtRiskOverview';
import { RISK_BANDS, sortByRisk, filterLearners } from '../../utils/riskPresentation';
import useAtRiskPreview from '../../services/useAtRiskPreview';
import backIconUrl from '../../assets/backButton.svg';
import '../../styles/atRiskPrediction.css';
import '../../styles/modelPreview.css';

const PAGE_SIZE = 20;

function LearnerList({ level }) {
  const preview = useAtRiskPreview({ allGrades: true });
  const { data, loading, error, filterQuery } = preview;
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [page, setPage] = useState(1);
  const [section, setSection] = useState('all');
  const [adviser, setAdviser] = useState('all');
  const unavailable = level === 'unavailable';
  const title = unavailable ? 'Learners Awaiting Records' : level === 'all' ? 'Learner Predictions' : RISK_BANDS.find(band => band.level === level).label;
  const source = unavailable ? data?.unavailable || []
    : sortByRisk((data?.students || []).filter(student => level === 'all' || student.riskLevel === level));
  const matching = filterLearners(source, { gradeLevel: preview.gradeLevel, section, adviser, search });
  const allLearners = [...(data?.students || []), ...(data?.unavailable || [])];
  const changePeriod = (setter, current) => value => {
    if (value === current) return;
    setSection('all'); setAdviser('all'); setPage(1); setter(value);
  };
  const filterPreview = { ...preview, setTerm: changePeriod(preview.setTerm, preview.term), setSchoolYear: changePeriod(preview.setSchoolYear, preview.schoolYear) };
  const clearFilters = () => { preview.setGradeLevel('all'); setSection('all'); setAdviser('all'); setPage(1); };
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = matching.slice(start, start + PAGE_SIZE);
  const backQuery = new URLSearchParams(filterQuery);
  if (!unavailable) backQuery.set('risk', level);
  if (search) backQuery.set('search', search);

  return <div className="ar-page ar-learner-page">
    <div className="ar-list-heading">
      <Link className="back-btn ar-list-back" title="Back to overview" aria-label="Back to overview" to={`/principal/at-risk-students/prediction?${backQuery}`}>
        <img src={backIconUrl} alt="" width={17} height={17} />
      </Link>
      <div><h1 className="ar-title">{title}</h1>
        <p className="ar-subtitle">{loading ? 'Loading English learners…' : `${matching.length} English learners · ${unavailable ? 'No prediction assigned' : 'Preliminary predictions'}`}</p>
      </div>
    </div>
    <AtRiskFilters preview={filterPreview}>
      <LearnerFilterPanel preview={preview} learners={allLearners} section={section} adviser={adviser}
        onGradeChange={value => { if (value === preview.gradeLevel) return; preview.setGradeLevel(value); setSection('all'); setAdviser('all'); setPage(1); }}
        onSectionChange={value => { setSection(value); setPage(1); }}
        onAdviserChange={value => { setAdviser(value); setPage(1); }} onClear={clearFilters} />
    </AtRiskFilters>
    {[preview.gradeLevel, section, adviser].some(value => value !== 'all') && <div className="ar-active-filters">
      {preview.gradeLevel !== 'all' && <span>Grade {preview.gradeLevel}</span>}
      {section !== 'all' && <span>Section {section.split('|')[1]}</span>}
      {adviser !== 'all' && <span>Adviser: {adviser}</span>}
      <button type="button" onClick={clearFilters}>Clear filters</button>
    </div>}
    <SearchBar query={search} setQuery={value => { setSearch(value); setPage(1); }} placeholder="Search name, grade, section or adviser…" />
    {error ? <div className="ar-preview-error" role="alert"><strong>Unable to load learners</strong>
      <p>{error}</p><button type="button" onClick={preview.retry}>Retry</button></div>
      : loading ? <StudentRiskCard riskLevel={level} loading />
        : !matching.length ? <EmptyState className="ar-preview-empty pa-empty-state" icon={SearchX}
          title="No learners found" description="Try a different search or adjust the selected filters." />
          : <>
            <div className="ar-full-learner-list">{visible.map((student, index) => unavailable
              ? <article className="ar-awaiting-card" key={`${student.id}-${index}`}>
                <div><h2>{student.name}</h2><p>Grade {student.grade} · Section {student.section}{student.adviser ? ` · Adviser: ${student.adviser}` : ''}</p></div>
                <p className="ar-awaiting-reason">{student.reason}</p>
              </article>
              : <StudentRiskCard key={student.id} {...student} onView={() => setSelectedStudent(student)} />)}</div>
            <nav className="ar-list-pagination" aria-label="Learner list pages">
              <span>{start + 1}–{Math.min(start + PAGE_SIZE, matching.length)} of {matching.length} learners</span>
              <div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
                <span>Page {currentPage} of {pageCount}</span>
                <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
            </nav>
          </>}
    <LearnerPredictionDialog student={selectedStudent} onClose={() => setSelectedStudent(null)} />
  </div>;
}

export default function AtRiskLearners() {
  const { origin, level } = useParams();
  if (!['prediction', 'breakdown'].includes(origin) || !['all', 'low', 'medium', 'high', 'unavailable'].includes(level)) {
    return <Navigate to="/principal/at-risk-students/prediction" replace />;
  }
  return <LearnerList key={`${origin}-${level}`} level={level} />;
}
