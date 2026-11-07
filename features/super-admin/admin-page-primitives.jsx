import { Badge } from "../../components/ui/badge.jsx";

export function AdminPageHeading({ eyebrow = "SUPER ADMIN", title, description }) {
  return (
    <header className="admin-page-heading">
      <div>
        <span className="admin-overline">{eyebrow}</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
    </header>
  );
}

export function AdminEmptyState({ icon: Icon, title, description }) {
  return (
    <section className="admin-data-empty" aria-label={title}>
      <span className="admin-data-empty__icon"><Icon size={20} aria-hidden="true" /></span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </section>
  );
}

export function AdminSectionPlaceholder({ icon: Icon, title, description }) {
  return (
    <div className="admin-placeholder">
      <AdminPageHeading title={title} description={description} />
      <section className="admin-placeholder__panel" aria-labelledby="admin-placeholder-title">
        <span className="admin-placeholder__icon"><Icon size={22} aria-hidden="true" /></span>
        <Badge tone="lavender" dot>Not connected</Badge>
        <h2 id="admin-placeholder-title">This workspace is being prepared</h2>
        <p>
          This section is a UI placeholder. It will use the shared campus data contracts when they are ready;
          no records or actions are available in this phase.
        </p>
      </section>
    </div>
  );
}
