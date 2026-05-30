export function ImportsView() {
  return (
    <section className="panel">
      <h1>Imports</h1>
      <div className="toolbar">
        <button className="primary-action" type="button">
          Upload CSV
        </button>
      </div>
      <div className="empty-state">No import jobs loaded.</div>
    </section>
  );
}
