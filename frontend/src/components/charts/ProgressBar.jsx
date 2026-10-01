import "../../styles/charts.css";

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(Number(value) || 0, minimum), maximum);

export default function ProgressBar({
  value,
  maximum = 100,
  tone = "blue",
  animationDelay = 0,
  animationDuration = 650,
  ariaLabel,
  ariaHidden = false,
}) {
  const safeMaximum = Math.max(Number(maximum) || 100, 1);
  const safeValue = clamp(value, 0, safeMaximum);
  const percentage = (safeValue / safeMaximum) * 100;
  const accessibilityProps = ariaHidden
    ? { "aria-hidden": true }
    : {
        role: "progressbar",
        "aria-label": ariaLabel || `${safeValue} of ${safeMaximum}`,
        "aria-valuemin": 0,
        "aria-valuemax": safeMaximum,
        "aria-valuenow": safeValue,
      };

  return (
    <span className="progress-bar" {...accessibilityProps}>
      <span
        className={`progress-bar__fill progress-bar__fill--${tone}`}
        style={{
          width: `${percentage}%`,
          animationDelay: `${animationDelay}ms`,
          animationDuration: `${animationDuration}ms`,
        }}
      />
    </span>
  );
}
