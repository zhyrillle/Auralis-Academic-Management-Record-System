export default function ProgressBar({
  value,
  ariaLabel,
  className = "",
}) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue)
    ? Math.min(100, Math.max(0, numericValue))
    : 0;

  return (
    <div
      className={className}
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={safeValue}
      aria-label={ariaLabel}
    >
      <span style={{ width: `${safeValue}%` }} />
    </div>
  );
}


