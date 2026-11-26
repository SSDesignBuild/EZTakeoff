import { useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { FieldRenderer } from './FieldRenderer';
import { DeckDesigner } from './DeckDesigner';
import { DeckSkirtingEditor } from './DeckSkirtingEditor';
import { DeckRailingElevation } from './DeckRailingElevation';
import { DeckGateEditor } from './DeckGateEditor';
import { LayoutPreview } from './LayoutPreview';
import { MaterialTable } from './MaterialTable';
import { MetricCard } from './MetricCard';
import { SiteConcretePlanSheet } from './SiteConcretePlanSheet';
import type { ServiceField } from '../data/services';
import type { EstimateResult } from '../lib/types';

type Values = Record<string, string | number | boolean>;
type ChangeValues = Dispatch<SetStateAction<Values>>;
type StepId = 'structure' | 'layout' | 'finishes' | 'stairs-railing' | 'review';
interface Props {
  values: Values;
  onValuesChange: ChangeValues;
  estimate: EstimateResult;
  visibleFields: ServiceField[];
  initialStep?:StepId;
  studioContext?:{title:string;revision:number;returnHref:string;coverFamily:string};
}

const steps: { id: StepId; title: string; subtitle: string }[] = [
  { id: 'structure', title: 'Structure & site', subtitle: 'Joists, beams, posts, footings & attachment' },
  { id: 'layout', title: 'Draw & position', subtitle: 'Footprint, house edges, beams, posts & railing locations' },
  { id: 'finishes', title: 'Deck boards & trim', subtitle: 'Decking, picture frame, breakers, fascia & skirting' },
  { id: 'stairs-railing', title: 'Stairs & railing', subtitle: 'Stairs, rail system, drink rail & hardware' },
  { id: 'review', title: 'Customer & takeoff', subtitle: 'Client information, extras, drawings & material order' },
];

const sections: Record<Exclude<StepId, 'layout' | 'review'>, { title: string; note: string; keys: string[] }[]> = {
  structure: [
    { title: '1 · Framing members', note: 'Start with joist, post and beam sizes. Auto sizes are preliminary, not engineered approval.',
      keys: ['joistSizeChoice', 'postSizeChoice', 'beamSizeChoice', 'framingWoodGrade', 'beamCantilever'] },
    { title: '2 · Footings & fasteners', note: 'Concrete quantities follow the chosen round pier width/depth. Use approved connector nails or rated screws.',
      keys: ['footingDiameterIn', 'footingDepthIn', 'connectorFastenerChoice', 'frameFastenerChoice'] },
    { title: '3 · Site, attachment & elevation', note: 'A masonry/brick wall requires independent gravity support. Choose how the joists run before drawing.',
      keys: ['attachment', 'boardRun', 'deckHeight', 'multiTierEnabled', 'lowerDeckHeight', 'lowerDeckWidth', 'lowerDeckProjection', 'lowerUseCustomSettings'] },
  ],
  finishes: [
    { title: '1 · Decking selection', note: 'Choose stock family, product/profile and surface before laying out decorative boards.',
      keys: ['deckingSurface', 'deckingType', 'deckingMaterial', 'lowerDeckingType'] },
    { title: '2 · Border and breaker boards', note: 'Picture framing can include or exclude the house edge. Composite/PVC stock remains limited to 16/20 ft.',
      keys: ['pictureFrameCount', 'pictureFrameHouseSide', 'pictureFrameMaterial', 'pictureFrameMaterial2', 'pictureFrameMaterial3', 'borderSameBoard', 'lowerPictureFrameCount', 'lowerPictureFrameHouseSide', 'breakerBoardCount', 'breakerBoardMaterial', 'breakerBoardMaterial2', 'breakerBoardMaterial3'] },
    { title: '3 · Fascia, trim & skirting', note: 'Select fascia finish and fastening method; configure skirting side elevations below.',
      keys: ['fasciaMaterial', 'trimFastenerChoice',
        'skirtingEnabled', 'skirtingStairsEnabled', 'skirtingMaterial', 'skirtingColor', 'skirtingOrientation', 'skirtingFaceIn', 'skirtingGapIn', 'skirtingKerfIn', 'skirtingTrimIn', 'skirtingGradeConfirmed',
        'lowerSkirtingEnabled', 'lowerSkirtingStairsEnabled', 'lowerSkirtingMaterial', 'lowerSkirtingColor', 'lowerSkirtingOrientation', 'lowerSkirtingFaceIn', 'lowerSkirtingGapIn', 'lowerSkirtingGradeConfirmed'] },
  ],
  'stairs-railing': [
    { title: '1 · Stair geometry and railing', note: 'Place stairs in the drawing step, then set widths, rises and left/right railing.',
      keys: ['stairCount', 'stairWidth', 'stairRise', 'stairTreadStyle', 'stairRiserStyle', 'stairFasciaStyle', 'stairFasciaMaterial', 'stairRailingLeft', 'stairRailingRight', 'lowerStairRailingLeft', 'lowerStairRailingRight'] },
    { title: '2 · Railing system', note: 'Choose standard or TimberTech and configure compatible profiles, infill and posts.',
      keys: ['railingType', 'lowerRailingType', 'spindleType', 'railingSystem', 'railingTopProfile', 'railingColor', 'railingInfill', 'railingHeightIn', 'railingPostSize', 'railingPostTermination', 'railingPostCap', 'railingManufacturerConfirmed'] },
    { title: '3 · Drink rail and railing lumber', note: 'Pressure-treated wood drink rails can use 5/4×6, 2×6, 2×8, 2×10 or 2×12 stock.',
      keys: ['drinkRail', 'woodDrinkRailSize', 'drinkRailMaterial', 'railingWoodGrade'] },
  ],
};

const knownKeys = new Set(Object.values(sections).flatMap((sectionsForStep) => sectionsForStep.flatMap((section) => section.keys)));
const goTop = () => {
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
};

export function DeckWorkspaceFlow({ values, onValuesChange, estimate, visibleFields,initialStep,studioContext }: Props) {
  const [step, setStep] = useState<StepId>(initialStep??'structure');
  const stepIndex = steps.findIndex((item) => item.id === step);
  const active = steps[stepIndex];
  const available = new Map(visibleFields.map((field) => [field.key, field]));
  const select = (id: StepId) => { setStep(id); goTop(); };
  const update = (key: string, value: string | number | boolean) => onValuesChange((current) => ({
    ...current,
    [key]: value,
    ...(key === 'railingPostTermination'
      ? { railingPostCap: value === 'flush-top' || value === 'flush-drink'
          ? 'none' : current.railingPostCap === 'none' ? 'standard' : current.railingPostCap }
      : {}),
  }));
  const renderInputs = (keys: string[]) => keys.map((key) => available.get(key))
    .filter((field): field is ServiceField => Boolean(field))
    .map((field) => <FieldRenderer key={field.key} field={field} value={values[field.key]} onChange={update}/>);
  const otherFields = visibleFields.filter((field) => !knownKeys.has(field.key));
  const hasSkirting = values.skirtingEnabled === true || String(values.skirtingEnabled) === 'true'
    || values.lowerSkirtingEnabled === true || String(values.lowerSkirtingEnabled) === 'true';

  return <div className="page-stack deck-workflow-shell">
    <header className="content-card deck-workflow-overview">
      <div>
        <p className="eyebrow">S&S Design Build · EZTakeoff</p>
        <h2>{studioContext?'Studio design · takeoff copy':'Deck takeoff builder'}</h2>
        <p className="muted">{studioContext?
          studioContext.title+' · Studio revision '+studioContext.revision+'. Edits are saved in this separate takeoff copy. Return to Studio to keep designing the original.':
          'Work in order from structural setup through the drawing and finish selections. Your project is saved automatically in this browser.'}</p>
        {studioContext&&studioContext.coverFamily!=='none'&&<p className="muted">
          {studioContext.coverFamily} cover and enclosure selections remain in Studio. The sheets below cover the deck, stairs, railing and drawn concrete.
        </p>}
      </div>
      <div className="deck-workflow-overview-actions">
        {studioContext&&<Link className="secondary-btn small-btn" to={studioContext.returnHref}>Return to Studio</Link>}
        <span className="deck-workflow-status">{estimate.summary.find((s) => s.label === 'Deck area')?.value ?? 'Draw a footprint'}</span>
        {estimate.validationIssues?.length ? <span className="deck-workflow-warning">{estimate.validationIssues.length} issue(s) to resolve before exporting</span> : <span className="deck-workflow-status">Ready for review</span>}
        {step !== 'review' && <button type="button" className="secondary-btn small-btn" onClick={() => select('review')}>Review takeoff</button>}
      </div>
    </header>

    <nav className="deck-workflow-steps" aria-label="Deck takeoff workflow">
      {steps.map((item, index) => <button key={item.id} type="button"
        aria-current={step === item.id ? 'step' : undefined}
        className={'deck-workflow-step' + (step === item.id ? ' is-active' : '') + (index < stepIndex ? ' is-previous' : '')}
        onClick={() => select(item.id)}>
        <span className="deck-workflow-step-number">{index + 1}</span>
        <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
      </button>)}
    </nav>

    <section className="deck-workflow-panel" aria-labelledby="deck-current-step">
      <div className="deck-workflow-panel-heading">
        <div>
          <p className="eyebrow">Step {stepIndex + 1} of {steps.length}</p>
          <h3 id="deck-current-step">{active.title}</h3>
          <p className="muted">{active.subtitle}</p>
        </div>
        <span className="deck-workflow-step-pill">{Math.round(100 * (stepIndex + 1) / steps.length)}% through workflow</span>
      </div>
      {step === 'layout' && <div className="deck-workflow-canvas-stage">
        <div className="deck-layout-step-hint">
          <strong>Build the shape, then edit the supports.</strong>
          <span>Use Edit points to draw. Switch to Move beams to drag or enter the exact beam position, then Edit posts and choose the railing or stairs placement modes.</span>
        </div>
        <DeckDesigner values={values} onValuesChange={onValuesChange}/>
      </div>}

      {(step === 'structure' || step === 'finishes' || step === 'stairs-railing') && sections[step].map((section) => {
        const fields = section.keys.filter((key) => available.has(key));
        if (!fields.length) return null;
        return <article className="content-card deck-workflow-form-section" key={section.title}>
          <div className="deck-workflow-section-heading">
            <h4>{section.title}</h4>
            <p className="muted">{section.note}</p>
          </div>
          <div className="deck-workflow-form-grid">{renderInputs(section.keys)}</div>
        </article>;
      })}
      {step === 'finishes' && hasSkirting && <DeckSkirtingEditor values={values} onValuesChange={onValuesChange}/>}
      {step === 'stairs-railing' && <>
        <DeckRailingElevation values={values}/>
        <DeckGateEditor values={values} onValuesChange={onValuesChange}/>
      </>}

      {step === 'review' && <div className="deck-workflow-review" id="service-export-root">
        {otherFields.length > 0 && <article className="content-card deck-workflow-form-section">
          <div className="deck-workflow-section-heading">
            <h4>Additional project settings</h4>
            <p className="muted">Other job-specific selections not covered in the main building steps.</p>
          </div>
          <div className="deck-workflow-form-grid">{renderInputs(otherFields.map((field) => field.key))}</div>
        </article>}
        <div className="deck-workflow-metrics metrics-grid">{estimate.summary.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value}/>)}</div>
        <div className="deck-workflow-review-intro">
          <h4>Customer, extra materials & supplier order</h4>
          <p className="muted">Complete the client information and any additional items, then review the printable plan and elevations beneath the material list.</p>
        </div>
        <MaterialTable items={estimate.materials} values={values} onValuesChange={onValuesChange} validationIssues={estimate.validationIssues ?? []} orderNotes={estimate.orderNotes}/>
        <LayoutPreview serviceSlug="decks" values={values} onValuesChange={onValuesChange}/>
        <SiteConcretePlanSheet values={values}/>
        <div className="deck-workflow-export-elevations">
          {hasSkirting && <DeckSkirtingEditor values={values} onValuesChange={onValuesChange}/>}
          <DeckRailingElevation values={values}/>
        </div>
        {!!estimate.orderNotes.length && <article className="content-card order-notes-card">
          <div className="section-heading"><p className="eyebrow">Scope output</p><h3>Assumptions and engineer notes</h3></div>
          <ul className="order-notes-list">{estimate.orderNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </article>}
      </div>}
    </section>

    <footer className="deck-workflow-footer">
      <button type="button" className="ghost-btn" disabled={stepIndex === 0} onClick={() => select(steps[stepIndex - 1].id)}>Previous step</button>
      <span className="muted">Step {stepIndex + 1} · {active.title}</span>
      {stepIndex < steps.length - 1
        ? <button type="button" className="secondary-btn" onClick={() => select(steps[stepIndex + 1].id)}>Next: {steps[stepIndex + 1].title}</button>
        : <button type="button" className="secondary-btn" onClick={() => select('structure')}>Start another pass</button>}
    </footer>
  </div>;
}
