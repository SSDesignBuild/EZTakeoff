import { SERVICES } from '../data/services';
type V=Record<string,string|number|boolean>;
const defs=SERVICES.find(s=>s.slug==='decks')?.defaults??{};
const FIELDS=[
  ['joistSizeChoice','Joist size','auto','2x8','2x10','2x12'],
  ['beamSizeChoice','Beam member size','auto','2x10','2x12','PSL'],
  ['postSizeChoice','Deck support post size','6x6','8x8'],
  ['frameFastenerChoice','Framing fasteners','framing-screws','collated-nails'],
  ['connectorFastenerChoice','Connector installation','hanger-nails','connector-screws'],
] as const;
const friendly:Record<string,string>={
  auto:'S&S automatic / span review',PSL:'Engineered PSL (requires design approval)',
  'framing-screws':'3″ structural-rated framing screws',
  'collated-nails':'3″ exterior ring-shank nails',
  'hanger-nails':'Approved joist-hanger nails',
  'connector-screws':'Manufacturer-approved connector screws',
};
export function ConsultationTechnicalSettings({values,onValuesChange}:{
  values:V;onValuesChange:(fn:(current:V)=>V)=>void;
}){
  const set=(key:string,val:string|number|boolean)=>onValuesChange(v=>({...v,[key]:val}));
  return <details className="consultation-technical-settings">
    <summary><span aria-hidden="true">⚙</span> S&S construction standards & engineering settings
      <small>Preconfigured · expand only when a job needs different framing</small></summary>
    <div className="consultation-technical-body">
      <p className="consultation-visual-note">These choices determine the takeoff and framing preview. They default to S&S standards; a custom preference is not proof of engineering or local code approval.</p>
      <div className="consultation-quick-inputs">
        {FIELDS.map(([key,label,...opts])=><label key={key}>{label}
          <select value={String(values[key]??defs[key]??opts[0])} onChange={e=>set(key,e.target.value)}>
            {opts.map(option=><option key={option} value={option}>{friendly[option]??option}</option>)}
          </select></label>)}
        <label>Footing diameter (inches)<input type="number" min={8} max={60} step={1}
          value={Number(values.footingDiameterIn??defs.footingDiameterIn??12)}
          onChange={e=>set('footingDiameterIn',Number(e.target.value))}/></label>
        <label>Footing depth (inches)<input type="number" min={8} max={120} step={1}
          value={Number(values.footingDepthIn??defs.footingDepthIn??24)}
          onChange={e=>set('footingDepthIn',Number(e.target.value))}/></label>
        <label>Beam cantilever (feet)<input type="number" min={0} max={5} step={1/12}
          value={Number(values.beamCantilever??defs.beamCantilever??2)}
          onChange={e=>set('beamCantilever',Number(e.target.value))}/></label>
      </div>
      <p className="consultation-engineering-note">All posts, joists, beams, foundations, connectors and rail heights must be checked against actual spans, loads, house attachment, soil and permit requirements before ordering or construction.</p>
    </div>
  </details>;
}
