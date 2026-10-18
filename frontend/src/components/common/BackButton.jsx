import backIconUrl from '../../assets/backButton.svg';
import '../../styles/backButton.css';

export default function BackButton({ onClick, label = 'Back to sections' }) {
  return <button type="button" className="back-btn app-back-button" onClick={onClick} title={label} aria-label={label}>
    <img src={backIconUrl} alt="" aria-hidden="true" width={17} height={17} />
  </button>;
}
