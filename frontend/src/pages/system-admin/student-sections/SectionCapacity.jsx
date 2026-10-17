import ProgressBar from "../../../components/common/ProgressBar";
import { sectionCapacity } from "../../../utils/studentSections";
export default function SectionCapacity({ count }) {
  const capacity = sectionCapacity(count);
  return (
    <div className={`section-capacity section-capacity--${capacity.tone}`}>
      <div>
        <span>{count} / 45 students</span>
      </div>
      <ProgressBar
        value={capacity.percent}
        ariaLabel={`${count} students; target capacity 40 to 45`}
        className="section-capacity__bar"
      />
    </div>
  );
}
