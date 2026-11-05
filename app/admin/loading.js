export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Loading Super Admin workspace">
      <div className="admin-skeleton" style={{ width: "9rem", height: "0.8rem" }} />
      <div className="admin-skeleton" style={{ width: "min(28rem, 80%)", height: "2.7rem", marginTop: "1rem" }} />
      <div className="admin-skeleton" style={{ width: "min(37rem, 90%)", height: "1rem", marginTop: "0.8rem" }} />
      <div className="admin-skeleton" style={{ width: "100%", height: "13rem", marginTop: "2rem" }} />
      <div className="admin-module-grid" style={{ marginTop: "1.5rem" }}>
        {[0, 1, 2].map((item) => (
          <div className="admin-skeleton" key={item} style={{ height: "10rem" }} />
        ))}
      </div>
    </div>
  );
}
