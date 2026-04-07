import { Link } from 'react-router-dom';
import { SERVICES } from '../data/services';

const workflowSteps = [
  {
    title: '1. Start from the right service',
    body: 'Decks, screen rooms, patio covers, and Renaissance screen rooms each have their own workflow and estimating rules.',
  },
  {
    title: '2. Enter dimensions and build conditions',
    body: 'Capture project width, height, openings, door conditions, cut-ins, and structural assumptions in one place.',
  },
  {
    title: '3. Review layout + order summary',
    body: 'See the footprint, validate take-off metrics, and hand off a material order list instead of rebuilding spreadsheets.',
  },
];

const roadmap = [
  'Rules engine can move from hard-coded demo formulas to a Supabase-backed product and logic table.',
  'Project records can be saved by customer, estimator, and job stage once authentication is enabled.',
  'PDF / CSV exports, purchase orders, and vendor-specific SKU mapping can be added without changing the UI shell.',
];

export function DashboardPage() {
  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Estimator workspace</p>
          <h2>Take-offs built for field speed and office accuracy.</h2>
          <p className="hero-copy">
            This prototype turns S&S estimating into a service-based workflow with built-in layout previews,
            quantity summaries, and order-ready material groupings.
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
          <span>Why this structure works</span>
          <ul>
            <li>Simple enough for non-technical team members</li>
            <li>Fast inputs with saved local state</li>
            <li>Scalable rule engine by service</li>
            <li>Netlify-ready front end with room for Supabase</li>
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
            <p className="eyebrow">Roadmap</p>
            <h3>Designed to grow with your logic and product data</h3>
          </div>
          <ul className="plain-list">
            {roadmap.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="content-card accent-card">
          <div className="section-heading">
            <p className="eyebrow">Deployment</p>
            <h3>Quick path to GitHub and Netlify</h3>
          </div>
          <ol className="ordered-list">
            <li>Unzip the project and push the folder to a new GitHub repo.</li>
            <li>Connect the repo to Netlify.</li>
            <li>Use the default build command from <code>netlify.toml</code>.</li>
            <li>When ready, layer in Supabase for auth, saved projects, and rule tables.</li>
          </ol>
        </article>
      </section>
    </div>
  );
}
