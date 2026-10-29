export default function PreviewNotice({ data }) {
  return (
    <aside className="ar-preview-notice" aria-label="Research preview limitations">
      <strong>English only · Research preview · No automatic alerts</strong>
      <p>Predicts next-term English failure from completed previous-term records, not a weekly or mid-term warning.</p>
      <p>Risk labels require complete English academic records, source-term attendance and valid PHIL-IRI screening. Incomplete attendance or screening shows “Insufficient data” with no prediction assigned.</p>
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
