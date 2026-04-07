const architectureLayers = [
  {
    title: 'Presentation layer',
    body: 'React + TypeScript + Vite front end, optimized for Netlify. Service workspaces, layout previews, and order tables live here.',
  },
  {
    title: 'Rules layer',
    body: 'A service-specific rules module turns user inputs into quantities, stock suggestions, and take-off summaries. In production, this should read from versioned rule data instead of fixed formulas.',
  },
  {
    title: 'Data layer',
    body: 'Supabase is the recommended next step for authentication, projects, customers, product tables, stock lengths, calculation rules, and generated orders.',
  },
];

const supabaseTables = [
  'services',
  'products',
  'stock_lengths',
  'rule_sets',
  'projects',
  'project_inputs',
  'material_orders',
];

export function ArchitecturePage() {
  return (
    <div className="page-stack">
      <section className="content-card">
        <div className="section-heading">
          <p className="eyebrow">Architecture</p>
          <h2>Recommended build approach</h2>
        </div>
        <div className="stack-list">
          {architectureLayers.map((layer) => (
            <div key={layer.title} className="step-card">
              <h4>{layer.title}</h4>
              <p>{layer.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid-section two-col">
        <article className="content-card">
          <div className="section-heading">
            <p className="eyebrow">Supabase expansion</p>
            <h3>Suggested tables</h3>
          </div>
          <ul className="plain-list">
            {supabaseTables.map((table) => (
              <li key={table}><code>{table}</code></li>
            ))}
          </ul>
        </article>

        <article className="content-card">
          <div className="section-heading">
            <p className="eyebrow">Next features</p>
            <h3>Highest-value follow-ons</h3>
          </div>
          <ul className="plain-list">
            <li>Per-opening editing and door placement on the canvas</li>
            <li>Vendor SKU mapping and exact stock cut optimization</li>
            <li>Saved customers, jobs, and revision history</li>
            <li>Order export to PDF, CSV, or vendor email</li>
          </ul>
        </article>
      </section>
    </div>
  );
}
