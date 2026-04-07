import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { FieldRenderer } from '../components/FieldRenderer';
import { LayoutPreview } from '../components/LayoutPreview';
import { MaterialTable } from '../components/MaterialTable';
import { MetricCard } from '../components/MetricCard';
import { DeckDesigner } from '../components/DeckDesigner';
import { getServiceBySlug } from '../data/services';
import { useLocalProjectState } from '../hooks/useLocalProjectState';
import { calculateEstimate } from '../lib/estimate';

export function ServiceWorkspacePage() {
  const { serviceSlug } = useParams();
  const service = getServiceBySlug(serviceSlug);
  const { values, setValues } = useLocalProjectState(service);

  const estimate = useMemo(() => calculateEstimate(service.slug, values), [service.slug, values]);

  return (
    <div className="page-stack">
      <section className="content-card workspace-header">
        <div>
          <p className="eyebrow">{service.label}</p>
          <h2>{service.intro}</h2>
        </div>
        <div className="tag-row">
          {service.highlights.map((item) => (
            <span key={item} className="tag">{item}</span>
          ))}
        </div>
      </section>

      {service.slug === 'decks' && (
        <DeckDesigner
          value={values.deckShape}
          onChange={(next) => setValues((current) => ({ ...current, deckShape: next }))}
        />
      )}

      <section className="workspace-grid">
        <article className="content-card">
          <div className="section-heading">
            <p className="eyebrow">Inputs</p>
            <h3>Project configuration</h3>
          </div>
          <div className="form-grid">
            {service.fields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={values[field.key]}
                onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
              />
            ))}
          </div>
          <div className="callout-box">
            <h4>Formula notes</h4>
            <ul className="plain-list compact">
              {service.formulaNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </article>

        <div className="workspace-right-col">
          <LayoutPreview serviceSlug={service.slug} values={values} />
          <div className="metrics-grid">
            {estimate.summary.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>
        </div>
      </section>

      <MaterialTable items={estimate.materials} />

      <section className="content-card">
        <div className="section-heading">
          <p className="eyebrow">Estimator notes</p>
          <h3>Order prep guidance</h3>
        </div>
        <ul className="plain-list">
          {estimate.orderNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
