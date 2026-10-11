import { Navigate, useLocation } from 'react-router-dom';

// Preserve old bookmarks without maintaining a second prediction page or data read.
export default function AtRiskBreakdown() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/principal/at-risk-students/prediction',
    search: location.search, hash: location.hash }} replace />;
}
