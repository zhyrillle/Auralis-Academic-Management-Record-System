import { RISK_BANDS } from '../../utils/riskPresentation';

export default function RiskLevelCard({ riskLevel }) {
  const band = RISK_BANDS.find(item => item.level === riskLevel);
  if (!band) return null;
  const Icon = band.icon;
  return <article className="ar-risk-bottom-card ar-risk-information-card" style={{ borderTopColor: band.color }}>
    <h2 style={{ color: band.color }}><Icon size={20} aria-hidden="true" />{band.label}</h2>
    <p>{band.meaning}</p>
    <h3>How it is assigned</h3>
    <p>The model combines previous-term English grades and assessment percentages, screening sub-scores, and an absence-rate input. Its internal output is grouped into this risk label—not a grade cutoff.</p>
    <h3>Suggested follow-up</h3>
    <p>{band.action}</p>
    <p className="ar-risk-card-caution">Missing screening inputs and unverified attendance use typical training values. Review the learner’s input details before drawing conclusions.</p>
  </article>;
}

