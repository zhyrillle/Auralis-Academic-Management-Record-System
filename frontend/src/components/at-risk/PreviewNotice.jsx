export default function PreviewNotice({ data }) {
  return (
    <aside className="ar-preview-notice" aria-label="Research preview limitations">
      <strong>English only · Research preview · No automatic alerts</strong>
      <p>Predicts next-term English failure from completed previous-term records, not a weekly or mid-term warning.</p>
      <p>PHIL-IRI sub-scores are unavailable and attendance rates are unverified. Preview scores use training medians for these missing inputs.</p>
      {data && <>
        <p>{data.sourceTerm || 'No previous term'} → {data.targetTerm} · Model: {data.modelVersion} · Threshold: {data.threshold.toFixed(2)}</p>
        <details><summary>Missing data and model limitations</summary>
          <ul>{data.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
          <p>Low: score ≤ 30 · Moderate: 30 &lt; score &lt; 70 · High: score ≥ 70. Risk bands are separate from the {data.threshold.toFixed(2)} classification threshold. Scores are not percentages of certainty.</p>
        </details>
      </>}
    </aside>
  );
}
