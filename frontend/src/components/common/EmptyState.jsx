export default function EmptyState({
  icon: Icon,
  title,
  description,
  inline = false,
  className = "",
}) {
  const classes = [className, inline ? `${className}--inline` : ""]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </>
  );

  return (
    <div className={classes}>
      {Icon && <Icon size={inline ? 22 : 25} aria-hidden="true" />}
      {inline ? <div>{content}</div> : content}
    </div>
  );
}


