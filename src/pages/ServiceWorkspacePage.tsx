import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { FieldRenderer } from '../components/FieldRenderer';
import { LayoutPreview } from '../components/LayoutPreview';
import { MaterialTable } from '../components/MaterialTable';
import { MetricCard } from '../components/MetricCard';
import { DeckDesigner } from '../components/DeckDesigner';
import { SectionEditor } from '../components/SectionEditor';
import { SunroomSectionEditor } from '../components/SunroomSectionEditor';
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
      {service.slug === 'decks' && <DeckDesigner values={values} onValuesChange={setValues} />}
      {(service.slug === 'screen-rooms' || service.slug === 'renaissance-screen-rooms') && (
        <SectionEditor renaissance={service.slug === 'renaissance-screen-rooms'} values={values} onValuesChange={setValues} />
      )}
      {service.slug === 'sunrooms' && <SunroomSectionEditor values={values} onValuesChange={setValues} />}

      <section className="workspace-grid compact-workspace-grid single-column-workspace">
        <article className="content-card project-config-card full-width-card">
          <div className="section-heading">
            <p className="eyebrow">Inputs</p>
            <h3>Project configuration</h3>
          </div>
          <div className="form-grid organized-config-grid">
            {service.fields.map((field) => (
              <FieldRenderer key={field.key} field={field} value={values[field.key]} onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} />
            ))}
          </div>
        </article>

        <div className="workspace-right-col full-width-card" id="service-export-root">
          <LayoutPreview serviceSlug={service.slug} values={values} onValuesChange={setValues} />
          <div className="metrics-grid">
            {estimate.summary.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} />)}
          </div>
          <MaterialTable items={estimate.materials} values={values} onValuesChange={setValues} />
          {estimate.orderNotes.length > 0 && (
            <article className="content-card order-notes-card">
              <div className="section-heading">
                <p className="eyebrow">Scope output</p>
                <h3>Assumptions & engineer notes</h3>
              </div>
              <ul className="order-notes-list">
                {estimate.orderNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
              </ul>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
