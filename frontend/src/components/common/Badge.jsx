export default function Badge({ children, variant = "default", className = "" }) {
  const classes = ["badge", `badge--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return <span className={classes}>{children}</span>;
}
