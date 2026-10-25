import { Fragment, useState } from 'react';
import { BookOpen, RefreshCw, CheckCircle2, ClipboardList, Users } from 'lucide-react';
import BackButton from '../../components/common/BackButton';
import FilterToolbar from '../../components/common/FilterToolbar';
import SearchBar from '../../components/common/SearchBar';
import SegmentedControl from '../../components/common/SegmentedControl';
import StatCard from '../../components/common/StatCard';
import EmptyState from '../../components/common/EmptyState';
import { PhilIriInstitutionalHeader, PhilIriReportHeader, PhilIriScreeningTable, PhilIriPostTestTable, PhilIriReadingSummary } from '../../components/phil-iri/PhilIriReport';
import useCachedQuery from '../../services/useCachedQuery';
import { cacheKey } from '../../services/navigationCache';
import { getDepartmentPhilIri, PHIL_IRI_REPORT_VERSION } from '../../services/deptHeadMonitoringApi';
import { SCREENING_PARTS, screeningTotal } from '../../utils/philIriScreening';

const score = value => value ?? '';
const percent = value => value == null || value === '' ? '' : (Number.isInteger(Number(value)) ? Number(value) : Number(value).toFixed(2)) + '%';
const readingLevel = value => value ? String(value).toLowerCase().replaceAll('_', ' ') : '';
const sexGroup = value => ['M', 'MALE'].includes(String(value || '').trim().toUpperCase()) ? 'boys'
  : ['F', 'FEMALE'].includes(String(value || '').trim().toUpperCase()) ? 'girls' : 'unknown';
const GROUPS = [{ key: 'boys', label: 'MALES' }, { key: 'girls', label: 'FEMALES' }, { key: 'unknown', label: 'SEX NOT RECORDED' }];
const LEVELS = ['INDEPENDENT', 'INSTRUCTIONAL', 'FRUSTRATION'];
const totalScore = assessment => assessment ? screeningTotal({ ...assessment, test_taken: Number(assessment.test_taken) }, assessment) : null;

function savedSettingLabel(learners, field, numeric = false) {
  const values = [...new Set(learners.map(learner => learner.screening?.[field])
    .filter(value => value != null && String(value).trim() !== '' && (!numeric || (Number.isInteger(Number(value)) && Number(value) > 0)))
    .map(value => numeric ? Number(value) : String(value).slice(0, field === 'assessed_on' ? 10 : undefined)))];
  return values.length === 1 ? values[0] : values.length ? 'Varies' : '';
}

export default function DeptPhilIriDetail({ section, schoolYearId, context, onBack }) {
  const [tab, setTab] = useState('screening');
  const [search, setSearch] = useState('');
  const query = useCachedQuery(cacheKey('department-phil-iri-detail', { schoolYearId, sectionId: section.sectionId, version: PHIL_IRI_REPORT_VERSION }),
    () => getDepartmentPhilIri(schoolYearId, section.sectionId));
  const available = query.data?.availability?.[tab];
  const learners = query.data?.learners || [];
  const screeningMaxima = Object.fromEntries(SCREENING_PARTS.map(part => [part, savedSettingLabel(learners, part + '_max', true)]));
  const thresholdLabel = savedSettingLabel(learners, 'score_threshold', true);
  const statusKey = tab === 'screening' ? 'screeningStatus' : 'postTestStatus';
  const filtered = GROUPS.flatMap(group => learners.filter(learner => sexGroup(learner.sex) === group.key
    && (learner.name + ' ' + learner.lrn).toLowerCase().includes(search.trim().toLowerCase())));
  const yearLabel = context.schoolYears.find(year => String(year.id) === String(schoolYearId))?.label;
  const screening = tab === 'screening';
  const enrollment = Object.fromEntries(GROUPS.map(group => [group.key, learners.filter(learner => sexGroup(learner.sex) === group.key).length]));
  const counts = { boys: {}, girls: {} };
  for (const learner of learners) {
    const level = String(learner.postTest?.overall_reading_level || '').toUpperCase();
    if (!LEVELS.includes(level)) continue;
    const group = sexGroup(learner.sex);
    counts[group] ??= {};
    counts[group][level] = (counts[group][level] || 0) + 1;
  }
  const totals = { tested: 0, parts: [0, 0, 0], score: 0, below: 0, above: 0 };
  for (const learner of learners) {
    const assessment = learner.screening;
    if (Number(assessment?.test_taken) !== 1) continue;
    totals.tested++;
    SCREENING_PARTS.forEach((part, index) => {
      const value = assessment[part + '_score'];
      if (value != null && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= Number(assessment[part + '_max'])) totals.parts[index] += Number(value);
    });
    const total = totalScore(assessment);
    if (total === null) continue;
    totals.score += total;
    const threshold = Number(assessment.score_threshold);
    if (Number.isInteger(threshold) && threshold > 0) totals[total < threshold ? 'below' : 'above']++;
  }
  const rows = filtered.map((learner, index) => {
    const assessment = learner.screening;
    const post = learner.postTest;
    const total = totalScore(assessment);
    const threshold = Number(assessment?.score_threshold);
    const hasBoundary = total !== null && Number.isInteger(threshold) && threshold > 0;
    const group = GROUPS.find(group => group.key === sexGroup(learner.sex));
    return <Fragment key={learner.enrollmentId}>
      {(index === 0 || sexGroup(filtered[index - 1].sex) !== group.key) && <tr className={screening ? 'screening-gender-divider' : 'post-test-gender-row'}>
        <th colSpan={9} scope="rowgroup">{group.label}{!screening && <> · {filtered.filter(row => sexGroup(row.sex) === group.key).length} learners</>}</th>
      </tr>}
      <tr className="dept-phil-learner-row">
        <td className="col-no">{index + 1}</td>
        <td className={screening ? 'screening-name' : 'col-learner-name'}>{learner.name}</td>
        {screening ? <>
          <td className="screening-mark">{assessment?.test_taken == null ? '' : Number(assessment.test_taken) === 1 ? '√' : 'X'}</td>
          {SCREENING_PARTS.map(part => <td className="screening-score" key={part}>{score(assessment?.[part + '_score'])}</td>)}
          <td className="screening-score">{score(total)}</td>
          <td className="screening-mark">{hasBoundary && total < threshold ? '√' : ''}</td>
          <td className="screening-mark">{hasBoundary && total >= threshold ? '√' : ''}</td>
        </> : <>
          <td className="col-words-read">{score(post?.words_correct)}</td>
          <td className="col-oral-pct">{percent(post?.oral_reading_percent)}</td>
          <td className="col-oral-level"><span className={'reading-level-text ' + readingLevel(post?.oral_reading_level)}>{readingLevel(post?.oral_reading_level)}</span></td>
          <td className="col-comp-score">{score(post?.comp_correct)}</td>
          <td className="col-comp-pct">{percent(post?.comp_score_percent)}</td>
          <td className="col-comp-level"><span className={'reading-level-text ' + readingLevel(post?.comp_reading_level)}>{readingLevel(post?.comp_reading_level)}</span></td>
          <td className="col-overall-level"><span className={'reading-level-text ' + readingLevel(post?.overall_reading_level)}>{readingLevel(post?.overall_reading_level)}</span></td>
        </>}
      </tr>
    </Fragment>;
  });
  if (!rows.length) rows.push(<tr key="empty"><td colSpan={9} className="dept-monitor-empty-cell">No learners match this search.</td></tr>);

  return <div className="dept-monitor-page">
    <header className="dept-monitor-header"><div className="dept-monitor-heading-with-back"><BackButton onClick={onBack} /><div><p className="dept-monitor-eyebrow">READING ASSESSMENT RECORDS</p><h1>{section.sectionName}</h1>
      <p>{section.gradeLevelName} · SY {yearLabel} · English PHIL-IRI</p></div></div></header>
    <FilterToolbar className="dept-phil-navigation" label="Assessment navigation" end={<SearchBar query={search} setQuery={setSearch} placeholder="Search learner name…" />}>
      <SegmentedControl label="Assessment stage" value={tab} options={[{ value: 'screening', label: 'Screening' }, { value: 'postTest', label: 'Post-Test' }]}
        onChange={setTab} />
    </FilterToolbar>
    {query.loading ? <div className="dept-monitor-state" role="status"><RefreshCw className="dept-monitor-spin" />Loading assessment records…</div> : query.error ?
      <div className="dept-monitor-state" role="alert"><strong>Results could not be loaded</strong><p>{query.error}</p><button className="dept-monitor-button" onClick={query.refresh}>Try again</button></div> : !available ?
      <EmptyState className="dept-monitor-state" icon={BookOpen} title="Assessment records are unavailable" description="This assessment stage is not available on the server yet." /> : <>
      <div className="dept-monitor-stats">
        <StatCard title="Complete records" value={learners.filter(learner => learner[statusKey] === 'Complete').length} description={'Of ' + learners.length + ' enrolled learners'} icon={CheckCircle2} variant="success" />
        <StatCard title="Incomplete records" value={learners.filter(learner => learner[statusKey] === 'Incomplete').length} description="Some assessment details are missing" icon={ClipboardList} variant="warning" />
        <StatCard title="Not assessed" value={learners.filter(learner => learner[statusKey] === 'Not assessed').length} description="No completed assessment recorded" icon={Users} variant="info" />
      </div>
      <section className={'dept-monitor-panel dept-phil-adviser-report ' + (screening ? 'screening-page' : 'post-test-page')}>
        <div className={'phil-iri-sheet ' + (screening ? 'screening-sheet' : '')}>
          <PhilIriReportHeader schoolYear={yearLabel} testLabel={screening ? 'SCREENING TEST CLASS READING RECORD' : 'POST – TEST RESULT'}>
            <PhilIriInstitutionalHeader schoolName={context.school?.name || undefined}
              region={context.school?.region || undefined} division={context.school?.division || undefined} />
          </PhilIriReportHeader>
          <div className="phil-iri-sheet-meta-row">
            <span>Grade &amp; Section: <strong>{section.gradeLevelName} · {section.sectionName}</strong></span>
            <span>Teacher: <strong>{section.teacherName || 'Not assigned'}</strong></span>
          </div>
          <div className="phil-iri-sheet-meta-subrow">
            {screening ? <><span>Date: <strong>{savedSettingLabel(learners, 'assessed_on')}</strong></span>
              <span>Screening Test Level: <strong>{savedSettingLabel(learners, 'test_level')}</strong></span></>
              : <span>Enrolment: M- <strong>{enrollment.boys}</strong> · F- <strong>{enrollment.girls}</strong>
                {enrollment.unknown > 0 && <> · Not recorded: <strong>{enrollment.unknown}</strong></>} · T- <strong>{learners.length}</strong></span>}
          </div>
          <div className="dept-monitor-table-wrap" role="region" aria-label="PHIL-IRI assessment results; scroll horizontally for all columns" tabIndex={0}>
            {screening ? <PhilIriScreeningTable maxima={screeningMaxima} className="dept-phil-screening-table"
              renderBoundary={comparison => <>Score<br />{comparison} {thresholdLabel}</>}
              footer={learners.length > 0 && <tr><th colSpan={2} scope="row" title="All section learners, regardless of the current search">Section total</th>
                <td>{totals.tested}</td>{totals.parts.map((value, index) => <td key={index}>{value}</td>)}
                <td>{totals.score}</td><td>{totals.below}</td><td>{totals.above}</td></tr>}>
              {rows}
            </PhilIriScreeningTable> : <PhilIriPostTestTable className="dept-phil-post-table">{rows}</PhilIriPostTestTable>}
          </div>
          {!screening && <PhilIriReadingSummary counts={counts} />}
        </div>
      </section>
    </>}
  </div>;
}
