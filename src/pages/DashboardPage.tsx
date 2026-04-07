import { Link } from 'react-router-dom';
import { SERVICES } from '../data/services';

const workflowSteps = [
  {
    title: '1. Pick the service',
    body: 'Each service keeps its own logic, terminology, and ordering structure so estimators are not forced through one generic spreadsheet flow.',
  },
  {
    title: '2. Draw or define the layout',
    body: 'Decks now start with an editable footprint so custom turns, cut-ins, and irregular shapes can be mapped before materials are counted.',
  },
  {
    title: '3. Review grouped materials',
    body: 'Outputs are organized by family and board length so ordering is faster and easier to review with field crews and suppliers.',
  },
];

const roadmap = [
  'Move service logic into configurable rule tables so your build methods can be updated without rewriting the UI.',
  'Save projects by customer and job status with Supabase once you are ready for multi-user workflows.',
  'Add PDF order sheets, vendor SKU mapping, and richer door/opening layout tools as the next layer.',
];

export function DashboardPage() {
  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <p className="eyebrow">S&amp;S estimator workspace</p>
          <h2>Built to replace spreadsheet take-offs with faster, cleaner job planning.</h2>
          <p className="hero-copy">
            This version leans into your brand, supports light and dark views, and starts shaping the deck workflow around the rules you shared:
            drawn footprints, 12 in O.C. framing, grouped board lengths, and order-ready hardware bundles.
          </p>
          <div className="hero-actions">
            <Link to="/service/decks" className="primary-btn">
              Open deck workflow
            </Link>
            <Link to="/architecture" className="secondary-btn">
              Review architecture
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <span>What changed in this pass</span>
          <ul>
            <li>Real S&amp;S logo added to the shell</li>
            <li>Light and dark theme toggle</li>
            <li>Interactive deck footprint editor</li>
            <li>Grouped board-length output for deck orders</li>
          </ul>
        </div>
      </section>

      <section className="grid-section two-col">
        <article className="content-card">
          <div className="section-heading">
            <p className="eyebrow">Service workspaces</p>
            <h3>Launch the estimator by service type</h3>
          </div>
          <div className="service-grid">
            {SERVICES.map((service) => (
              <Link key={service.slug} to={`/service/${service.slug}`} className="service-card">
                <div>
                  <h4>{service.label}</h4>
                  <p>{service.intro}</p>
                </div>
                <ul>
                  {service.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Link>
            ))}
          </div>
        </article>

        <article className="content-card">
          <div className="section-heading">
            <p className="eyebrow">Workflow</p>
            <h3>How estimators move through the app</h3>
          </div>
          <div className="stack-list">
            {workflowSteps.map((step) => (
              <div key={step.title} className="step-card">
                <h4>{step.title}</h4>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid-section two-col">
        <article className="content-card">
          <div className="section-heading">
            <p className="eyebrow">Next refinements</p>
            <h3>Ready for your construction logic</h3>
          </div>
          <ul className="plain-list">
            {roadmap.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="content-card accent-card">
          <div className="section-heading">
            <p className="eyebrow">Deck logic in this pass</p>
            <h3>Focused on the details you called out first</h3>
          </div>
          <ol className="ordered-list">
            <li>Deck boards are grouped by run direction and stock length.</li>
            <li>Beam, post, joist, border, hardware, and stair logic follows your current framing notes.</li>
            <li>Brick-wall projects automatically switch to freestanding behavior.</li>
            <li>Railing output now changes based on aluminum vs wood/vinyl-composite systems.</li>
          </ol>
        </article>
      </section>
    </div>
  );
}
