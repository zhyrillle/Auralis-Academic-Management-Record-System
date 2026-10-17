export default function Badge({ children, variant = "default", className = "", title }) {
  const classes = ["badge", `badge--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return <span className={classes} title={title}>{children}</span>;
}
