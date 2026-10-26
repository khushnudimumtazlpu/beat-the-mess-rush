const toneClasses = {
  neutral: "ui-badge--neutral",
  teal: "ui-badge--teal",
  lime: "ui-badge--lime",
  coral: "ui-badge--coral",
  lavender: "ui-badge--lavender",
};

export function Badge({ children, tone = "neutral", dot = false, className = "" }) {
  const classes = ["ui-badge", toneClasses[tone] ?? toneClasses.neutral, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {dot ? <span className="ui-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
