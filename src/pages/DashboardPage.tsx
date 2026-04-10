import { Link } from 'react-router-dom';
import { SERVICES } from '../data/services';

export function DashboardPage() {
  return (
    <div className="page-stack">
      <section className="content-card">
        <div className="section-heading">
          <p className="eyebrow">Service workspaces</p>
          <h2>Choose a workflow</h2>
        </div>
        <div className="service-grid">
          {SERVICES.map((service) => (
            <Link key={service.slug} to={`/service/${service.slug}`} className="service-card">
              <div>
                <h4>{service.label}</h4>
                <p>{service.intro}</p>
              </div>
              <ul>
                {service.highlights.map((item) => (<li key={item}>{item}</li>))}
              </ul>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
