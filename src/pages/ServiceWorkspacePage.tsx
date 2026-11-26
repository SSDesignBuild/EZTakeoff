import { useEffect,useMemo,useState,type Dispatch,type SetStateAction } from 'react';
import { Link,useParams,useSearchParams } from 'react-router-dom';
import { FieldRenderer } from '../components/FieldRenderer';
import { LayoutPreview } from '../components/LayoutPreview';
import { MaterialTable } from '../components/MaterialTable';
import { MetricCard } from '../components/MetricCard';
import { DeckWorkspaceFlow } from '../components/DeckWorkspaceFlow';
import { SectionEditor } from '../components/SectionEditor';
import { SunroomSectionEditor } from '../components/SunroomSectionEditor';
import { WoodenStructureEditor } from '../components/WoodenStructureEditor';
import { getServiceBySlug,type ServiceDefinition } from '../data/services';
import { useLocalProjectState } from '../hooks/useLocalProjectState';
import { calculateEstimate } from '../lib/estimate';
import { readConsultationTakeoff,saveConsultationTakeoffValues,consultationTakeoffEstimate,
  consultationTakeoffReturnHref,type ConsultationTakeoffSnapshot } from '../lib/consultationTakeoffBridge';

type Values=Record<string,string|number|boolean>;

export function ServiceWorkspacePage() {
  const { serviceSlug } = useParams();
  const [search]=useSearchParams();
  const service = getServiceBySlug(serviceSlug);
  const copyId=service.slug==='decks'?search.get('studioTakeoff'):null;
  return copyId?<StudioTakeoffWorkspace key={'copy-'+copyId} service={service} copyId={copyId}/>:
    <LocalServiceWorkspace key={service.slug} service={service}/>;
}

function LocalServiceWorkspace({service}:{service:ServiceDefinition}){
  const { values, setValues } = useLocalProjectState(service);
  return <ServiceWorkspaceContent service={service} values={values} setValues={setValues}/>;
}

function StudioTakeoffWorkspace({service,copyId}:{service:ServiceDefinition;copyId:string}){
  const [snapshot]=useState(()=>readConsultationTakeoff(copyId));
  const [values,setValues]=useState<Values>(()=>snapshot?{...snapshot.values}:{});
  const [saveError,setSaveError]=useState('');
  useEffect(()=>{
    if(!snapshot)return;
    try{saveConsultationTakeoffValues(snapshot,values);setSaveError('');}
    catch{setSaveError('This takeoff copy could not be saved on this device. Keep the page open and free browser storage before leaving.');}
  },[snapshot,values]);
  if(!snapshot)return <section className="content-card page-stack" role="alert">
    <h2>Studio takeoff copy is unavailable</h2>
    <p>Open the current design in Studio and choose its takeoff button again.</p>
    <div><Link className="secondary-btn" to="/consultation">Open Studio</Link>{' '}
      <Link className="ghost-btn" to="/service/decks">Open saved Admin deck</Link></div>
  </section>;
  return <>{saveError&&<div className="content-card" role="alert">{saveError}</div>}
    <ServiceWorkspaceContent service={service} values={values} setValues={setValues} snapshot={snapshot}/>
  </>;
}

function ServiceWorkspaceContent({service,values,setValues,snapshot}:{service:ServiceDefinition;
  values:Values;setValues:Dispatch<SetStateAction<Values>>;snapshot?:ConsultationTakeoffSnapshot}){
  const estimate = useMemo(() => snapshot?consultationTakeoffEstimate(snapshot,values):
    calculateEstimate(service.slug, values), [service.slug, values,snapshot]);
  const visibleFields = service.fields.filter((field) => {
    if (service.slug === 'decks') {
      const lowerEnabled = values.multiTierEnabled === true || String(values.multiTierEnabled ?? 'false') === 'true';
      if (field.key.startsWith('lower') && field.key !== 'lowerDeckShape' && !lowerEnabled) return false;

      const breakerCount = Math.max(0, Math.round(Number(values.breakerBoardCount ?? 0)));
      if (field.key === 'breakerBoardMaterial' && breakerCount < 1) return false;
      if (field.key === 'breakerBoardMaterial2' && breakerCount < 2) return false;
      if (field.key === 'breakerBoardMaterial3' && breakerCount < 3) return false;

      const pictureFrameCount = Math.max(0, Math.round(Number(values.pictureFrameCount ?? 0)));
      if (field.key === 'pictureFrameMaterial' && pictureFrameCount < 1) return false;
      if (field.key === 'pictureFrameMaterial2' && pictureFrameCount < 2) return false;
      if (field.key === 'pictureFrameMaterial3' && pictureFrameCount < 3) return false;
      if (field.key === 'borderSameBoard' && pictureFrameCount < 1) return false;

      const stairCount = Math.max(0, Math.round(Number(values.stairCount ?? 0)));
      if (['stairWidth', 'stairRise', 'stairRailingLeft', 'stairRailingRight'].includes(field.key) && stairCount < 1) return false;

      const drinkRailEnabled = values.drinkRail === true || String(values.drinkRail ?? 'false') === 'true';
      if (field.key === 'drinkRailMaterial' && !drinkRailEnabled) return false;
      if (field.key === 'woodDrinkRailSize' && (!drinkRailEnabled || String(values.railingSystem ?? 'standard') !== 'standard' || String(values.railingType ?? 'aluminum') !== 'wood')) return false;
      if (field.key === 'pictureFrameHouseSide' && Number(values.pictureFrameCount ?? 0) <= 0) return false;
    }
    if (!field.showIf) return true;
    const actual = values[field.showIf.key];
    const expected = field.showIf.equals;
    if (expected === undefined) return Boolean(actual);
    if (typeof expected === 'boolean') return Boolean(actual) === expected || String(actual) === String(expected);
    return String(actual) === String(expected);
  });

  if (service.slug === 'decks') return (
    <DeckWorkspaceFlow values={values} onValuesChange={setValues} estimate={estimate} visibleFields={visibleFields}
      initialStep={snapshot?'review':undefined}
      studioContext={snapshot?{title:snapshot.title,revision:snapshot.sourceRevision,
        returnHref:consultationTakeoffReturnHref(snapshot),coverFamily:snapshot.project.coverFamily}:undefined}/>
  );

  return (
    <div className="page-stack">
      {(service.slug === 'screen-rooms' || service.slug === 'renaissance-screen-rooms') && (
        <SectionEditor renaissance={service.slug === 'renaissance-screen-rooms'} values={values} onValuesChange={setValues} />
      )}
      {service.slug === 'sunrooms' && <SunroomSectionEditor values={values} onValuesChange={setValues} />}
      {service.slug === 'wooden-structures' && <WoodenStructureEditor values={values} onValuesChange={setValues} />}

      <section className="workspace-grid compact-workspace-grid single-column-workspace">
        <article className="content-card project-config-card full-width-card">
          <div className="section-heading">
            <p className="eyebrow">Inputs</p>
            <h3>Project configuration</h3>
          </div>
          <div className="form-grid organized-config-grid">
            {visibleFields.map((field) => (
              <FieldRenderer key={field.key} field={field} value={values[field.key]} onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} />
            ))}
          </div>
        </article>

        <div className="workspace-right-col full-width-card" id="service-export-root">
          <LayoutPreview serviceSlug={service.slug} values={values} onValuesChange={setValues} />
          <div className="metrics-grid">
            {estimate.summary.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} />)}
          </div>
          <MaterialTable items={estimate.materials} values={values} onValuesChange={setValues} validationIssues={estimate.validationIssues ?? []} orderNotes={estimate.orderNotes} />
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
