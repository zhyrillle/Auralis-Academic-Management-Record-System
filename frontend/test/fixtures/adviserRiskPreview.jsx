// Browser test entry only; never imported by the application.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RiskCarouselCard from '../../src/components/adviser/RiskCarouselCard';
import AtRiskStudentsModal from '../../src/components/adviser/AtRiskStudentsModal';
import PhilIri from '../../src/pages/adviser/PhilIri';
import AdviserDashboard from '../../src/pages/adviser/AdviserDashboard';
import '../../src/styles/AdviserDashboard.css';
import '../../src/index.css';
import '../../src/styles/sidebar.css';
// Include the same global styles loaded by the full application.
import '../../src/App';

function Preview() {
  const [band, setBand] = useState(null);
  const params = new URLSearchParams(location.search);
  const zero = params.has('zero');
  if (params.has('dashboard')) return <MemoryRouter><AdviserDashboard /></MemoryRouter>;
  return params.has('phil') ? <MemoryRouter><main style={{ width: '100%', boxSizing: 'border-box', padding: 12, fontFamily: 'var(--font-family)' }}>
    <PhilIri activeClass={{ section_id: 7, subject_offering_id: 101, school_year_id: 3, sectionName: 'Demo Section' }} />
  </main></MemoryRouter> : <main style={{ padding: 20, fontFamily: 'var(--font-family)' }}>
    <div className="adviser-dashboard__stat-row">
      <div>Other stat</div><div>Other stat</div>
      <RiskCarouselCard high={zero ? 0 : 2} medium={zero ? 0 : 3} low={zero ? 0 : 4} loading={params.has('loading')} onSelect={setBand} />
    </div>
    <AtRiskStudentsModal isOpen={Boolean(band)} initialBand={band} userId={10} onClose={() => setBand(null)} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
