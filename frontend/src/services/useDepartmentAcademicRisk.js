import useCachedQuery from './useCachedQuery';
import { cacheKey } from './navigationCache';
import { getDepartmentAcademicRisk } from './monitoringOverviewApi';
import { getStoredUser } from '../utils/auth';

export default function useDepartmentAcademicRisk(filters) {
  const user = getStoredUser();
  const term = filters.quarter ? `T${filters.quarter}` : 'ALL';
  const params = { schoolYear: filters.schoolYear, gradeLevel: filters.gradeLevel, term };
  const query = useCachedQuery(cacheKey('department-academic-risk-v2', { ...params, userId: user?.user_id || user?.id }),
    () => getDepartmentAcademicRisk(params), { enabled: Boolean(filters.schoolYear), keepPreviousData: true });
  return { ...query, term };
}
