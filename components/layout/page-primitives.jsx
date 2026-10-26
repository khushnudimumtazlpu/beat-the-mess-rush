export function PageContainer({ as: Element = "div", className = "", children, ...props }) {
  return (
    <Element className={`page-container ${className}`.trim()} {...props}>
      {children}
    </Element>
  );
}

export function PageSection({ as: Element = "section", className = "", children, ...props }) {
  return (
    <Element className={`page-section ${className}`.trim()} {...props}>
      {children}
    </Element>
  );
}

export function SectionHeading({ eyebrow, title, description, className = "" }) {
  return (
    <div className={`section-heading ${className}`.trim()}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2 className="section-heading__title">{title}</h2>
      {description ? <p className="section-heading__description">{description}</p> : null}
    </div>
  );
}
