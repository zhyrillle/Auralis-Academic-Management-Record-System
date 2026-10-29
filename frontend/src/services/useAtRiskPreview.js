import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAtRiskOptions, getAtRiskPreview } from './atRiskPredictionApi';
import useCachedQuery from './useCachedQuery';
import { cacheKey } from './navigationCache';
import { filterRiskPreview } from '../utils/filterRiskPreview';
import { RISK_PREVIEW_CACHE } from './riskInputPolicy.js';

export default function useAtRiskPreview({ allGrades = false } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const optionsQuery = useCachedQuery(cacheKey('risk:options'), () => getAtRiskOptions());
  const options = optionsQuery.data;
  const schoolYear = searchParams.get('schoolYear') || options?.schoolYears[0]?.value || '';
  const term = searchParams.get('term') === 'T3' ? 'T3' : 'T2';
  const gradeLevel = searchParams.get('gradeLevel') || 'all';
  // Share a single all-grade prediction batch across overview, breakdown and learner lists.
  const query = useCachedQuery(cacheKey(RISK_PREVIEW_CACHE, { schoolYear, term }),
    () => getAtRiskPreview({ schoolYear, term, gradeLevel: 'all' }), { enabled: Boolean(schoolYear) });
  const data = useMemo(() => allGrades ? query.data : filterRiskPreview(query.data, gradeLevel),
    [allGrades, query.data, gradeLevel]);
  const filterQuery = new URLSearchParams({ schoolYear, term, gradeLevel }).toString();
  const change = (current, key) => value => {
    if (value !== current) {
      const next = new URLSearchParams(searchParams);
      Object.entries({ schoolYear, term, gradeLevel, [key]: value }).forEach(([name, item]) => next.set(name, item));
      setSearchParams(next, { replace: true });
    }
  };
  return { options, schoolYear, term, gradeLevel, data,
    loading: optionsQuery.loading || query.loading,
    refreshing: query.refreshing,
    error: optionsQuery.error || query.error || (options && !options.schoolYears.length ? 'No school years are available.' : ''),
    filterQuery,
    setSchoolYear: change(schoolYear, 'schoolYear'),
    setTerm: change(term, 'term'),
    setGradeLevel: change(gradeLevel, 'gradeLevel'),
    retry: () => { optionsQuery.refresh(); if (schoolYear) query.refresh(); },
  };
}
