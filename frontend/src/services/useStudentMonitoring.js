import { useSearchParams } from 'react-router-dom';
import useCachedQuery from './useCachedQuery';
import { cacheKey } from './navigationCache';
import { getMonitoringOptions, getMonitoringPreview } from './studentMonitoringApi';

export default function useStudentMonitoring() {
  const [params, setParams] = useSearchParams();
  const optionsQuery = useCachedQuery(cacheKey('monitoring:options:v1'), getMonitoringOptions);
  const options = optionsQuery.data;
  const schoolYear = options?.schoolYears.find(row => row.value === params.get('schoolYear'))
    || options?.schoolYears.find(row => row.value === options.defaultSchoolYear);
  const subjects = options?.subjects.filter(row => row.schoolYearId === schoolYear?.value) || [];
  const subject = subjects.find(row => row.value === params.get('subject'))
    || subjects.find(row => /^(ENG|ENGLISH)$/i.test(row.code) || /^English$/i.test(row.label)) || subjects[0];
  const terms = schoolYear?.terms || [];
  const term = terms.find(row => row.value === params.get('term'))
    || terms.find(row => row.startsOn <= options.today && row.endsOn >= options.today)
    || [...terms].reverse().find(row => row.startsOn <= options.today) || terms[0];
  const filters = { schoolYear: schoolYear?.value || '', subject: subject?.value || '', term: term?.value || '' };
  const key = cacheKey('monitoring:preview:v1', filters);
  const query = useCachedQuery(key, () => getMonitoringPreview(filters), {
    enabled: Boolean(filters.schoolYear && filters.subject && filters.term), keepPreviousData: false,
  });
  const change = (name, value) => {
    const next = new URLSearchParams(params);
    Object.entries(filters).forEach(([key, item]) => next.set(key, item));
    next.set(name, value);
    if (['schoolYear', 'subject', 'term'].includes(name)) {
      ['grade', 'section', 'band', 'search', 'page'].forEach(key => next.delete(key));
      if (name === 'schoolYear') { next.delete('subject'); next.delete('term'); }
    }
    if (name !== 'page') next.delete('page');
    if (name === 'grade') next.delete('section');
    setParams(next, { replace: true });
  };
  return { ...query, key, options, subjects, terms, filters, params, change,
    loading: optionsQuery.loading || query.loading,
    error: optionsQuery.error || query.error,
    optionsEmpty: Boolean(options && (!schoolYear || !subject || !term)),
    retry: () => { optionsQuery.refresh(); if (filters.term && filters.subject) query.refresh(); },
  };
}
