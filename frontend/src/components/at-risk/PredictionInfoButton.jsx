import { useRef } from 'react';
import { Info, X } from 'lucide-react';

export default function PredictionInfoButton() {
  const dialog = useRef(null);
  const trigger = useRef(null);
  return <>
    <button type="button" className="ar-prediction-info-button" ref={trigger}
      onClick={() => dialog.current.showModal()} aria-haspopup="dialog">
      <Info size={16} aria-hidden="true" />About these predictions
    </button>
    <dialog className="ar-prediction-info-dialog" ref={dialog} aria-labelledby="prediction-info-title"
      onClose={() => trigger.current?.focus()}
      onClick={event => { if (event.target === event.currentTarget) dialog.current.close(); }}>
      <div className="ar-prediction-info-content">
        <header><h2 id="prediction-info-title">How predictions work</h2>
          <button type="button" aria-label="Close prediction information" onClick={() => dialog.current.close()}><X size={20} /></button>
        </header>
        <section><h3>English only · Next-term risk</h3>
          <p>Uses the completed previous term’s English grade and assessment percentages, eligible screening sub-scores, and an absence-rate input. Term 2 uses Term 1 records; Term 3 uses Term 2 records.</p></section>
        <section><h3>Still preliminary</h3>
          <p>Trained on historical quarterly English records from 84 learners. Performance on the current three-term calendar has not yet been validated.</p>
          <p>Complete screening sub-scores are used when dated within the school year and before the predicted term. Complete previous-term attendance is used, excluding marked holidays and suspensions. Missing or incomplete inputs use training-data medians. These substitutes are not verified learner records.</p></section>
        <section><h3>What the labels mean</h3>
          <p>Low, Medium and High summarize the model’s internal output. They are not verified probabilities or official grades. Low risk does not guarantee a passing grade, and High risk does not confirm failure.</p>
          <p>Review available learner records to support professional judgment; they are not an exact explanation of the model’s decision. Incomplete English records receive no prediction—not a Low label. No automatic alerts are sent.</p></section>
        <button type="button" className="ar-prediction-info-done" onClick={() => dialog.current.close()}>Got it</button>
      </div>
    </dialog>
  </>;
}
