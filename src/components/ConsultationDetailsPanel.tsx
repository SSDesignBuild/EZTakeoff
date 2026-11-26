import { useMemo } from 'react';
import type { ConsultationProject } from '../lib/consultationProject';
import { buildDeckModel } from '../lib/deckModel';
import { ManufacturerBoardPicker, ManufacturerRailPicker, ManufacturerCoverPicker } from './ConsultationVisualPickers';
import { ConsultationDeckFinishes, StairFasciaFinishSelect } from './ConsultationDeckFinishes';
import { ConsultationSkirtingOptions } from './ConsultationSkirtingOptions';
import { EliteSunroomStudioOptions } from './EliteSunroomStudioOptions';
import { DeckGateEditor } from './DeckGateEditor';
import { deckVisualProducts } from '../data/visualCatalog';

export type ConsultationDetailSection='deck'|'railing'|'stairs'|'skirting'|'cover'|'sunroom'|'gates';
const sections:{id:ConsultationDetailSection;label:string}[]=[
  {id:'deck',label:'Deck & trim'},{id:'railing',label:'Railing'},
  {id:'stairs',label:'Stairs'},{id:'skirting',label:'Skirting'},
  {id:'cover',label:'Cover & screens'},{id:'sunroom',label:'Sunroom'},
  {id:'gates',label:'Gates'},
];
const number=(value:unknown,fall:number)=>Number.isFinite(Number(value))?Number(value):fall;
export function ConsultationDetailsPanel({project,onChange,section,onSectionChange,onClose,onEditLayout}:{
  project:ConsultationProject;
  onChange:(patch:Partial<ConsultationProject>)=>void;
  section:ConsultationDetailSection;
  onSectionChange:(section:ConsultationDetailSection)=>void;
  onClose:()=>void;
  onEditLayout:(mode:'stairs'|'railing')=>void;
}){
  const model=useMemo(()=>buildDeckModel(project.values),[project.values]);
  const setValue=(key:string,value:string|number|boolean)=>onChange({values:{...project.values,[key]:value}});
  const updateValues=(updater:(current:ConsultationProject['values'])=>ConsultationProject['values'])=>onChange({values:updater(project.values)});
  return <aside className="studio-inspector" aria-label="Detailed design options">
    <header className="studio-inspector-heading"><div><span className="eyebrow">Design details</span><h3>Make it yours</h3></div>
      <button type="button" className="ghost-btn small-btn" aria-label="Close detailed options" onClick={onClose}>Close ×</button>
    </header>
    <nav className="studio-inspector-sections" aria-label="Detailed option sections">
      {sections.filter(item=>item.id!=='sunroom'||project.coverScreenStyle==='elite-add-a-room').map(item=><button
        type="button" key={item.id} aria-pressed={section===item.id} onClick={()=>onSectionChange(item.id)}>{item.label}</button>)}
    </nav>
    <div className="studio-inspector-body">
      {section==='deck'&&<><ManufacturerBoardPicker values={project.values} onValues={values=>onChange({values})}/>
        <ConsultationDeckFinishes values={project.values} onValues={values=>onChange({values})}/></>}
      {section==='railing'&&<><button type="button" className="studio-draw-link" onClick={()=>onEditLayout('railing')}>Edit railing sides on the plan →</button>
        <ManufacturerRailPicker values={project.values} onValues={values=>onChange({values})}/></>}
      {section==='stairs'&&<><button type="button" className="studio-draw-link" onClick={()=>onEditLayout('stairs')}>Edit stair locations & railing sides →</button>
        <article className="consultation-option-card">
          <h4>Stair options</h4>
          <label>Stair width (ft)<input type="number" min={2} step={.5}
            value={number(project.values.stairWidth,4)} onChange={(e)=>setValue('stairWidth',Number(e.target.value))}/></label>
          <label>Stair landing at grade
            <select value={String(project.values.stairLandingSurface??'unknown')}
              onChange={e=>setValue('stairLandingSurface',e.target.value)}>
              <option value="unknown">Not verified — no pad added</option>
              <option value="existing">Existing suitable concrete landing</option>
              <option value="site-plan">Included in drawn concrete area</option>
              <option value="bare-ground">No existing concrete — include landing pad</option>
            </select>
          </label>
          {project.values.stairLandingSurface==='bare-ground'&&<>
            <label>Concrete pad depth (ft)
              <input type="number" min={3} max={20} step={.5}
                value={number(project.values.stairLandingDepthFt,4)}
                onChange={e=>setValue('stairLandingDepthFt',Number(e.target.value))}/>
            </label>
            <label>Concrete pad thickness (in)
              <input type="number" min={4} max={12} step={1}
                value={number(project.values.stairLandingThicknessIn,5)}
                onChange={e=>setValue('stairLandingThicknessIn',Number(e.target.value))}/>
            </label>
            <small className="consultation-visual-note">One pad per drawn stair flight; minimum 4-foot width or the stair width, whichever is greater. 80-lb concrete bag quantities derive from actual volume with a 5% handling allowance and 0.60 cu ft nominal yield. Site grade, base, landings, footings and code approval require field review.</small>
          </>}
          <label>Tread material<select value={String(project.values.stairTreadStyle??'match')}
            onChange={(e)=>setValue('stairTreadStyle',e.target.value)}>
            <option value="match">Match deck board style</option>
            {deckVisualProducts.map(board=><option key={board.id} value={board.label}>
              {board.collection} · {board.color}
            </option>)}
          </select></label>
          <label>Stair fascia edge<select value={String(project.values.stairFasciaStyle??'profiled')}
            onChange={(e)=>setValue('stairFasciaStyle',e.target.value)}>
            <option value="profiled">Cut to follow the stringer</option>
            <option value="straight">Straight clean fascia</option>
          </select></label>
          <StairFasciaFinishSelect values={project.values} onValues={(values)=>onChange({values})}/>
          <label>Riser material<select value={String(project.values.stairRiserStyle??'auto')}
            onChange={(e)=>setValue('stairRiserStyle',e.target.value)}>
            <option value="auto">Standard coordinated riser</option>
            <option value="match">Match deck board</option>
            <option value="fascia">Match fascia trim</option>
            <option value="open">Open risers (subject to approved code)</option>
            {deckVisualProducts.map(board=><option key={board.id} value={board.label}>
              {board.collection} · {board.color}
            </option>)}
          </select></label>
        </article>
      </>}
      {section==='skirting'&&<ConsultationSkirtingOptions values={project.values} onValuesChange={updateValues}/>}
      {section==='cover'&&<ManufacturerCoverPicker project={project} onChange={onChange}/>}
      {section==='sunroom'&&project.coverScreenStyle==='elite-add-a-room'&&<EliteSunroomStudioOptions project={project} model={model} onChange={onChange}/>}
      {section==='gates'&&<DeckGateEditor values={project.values} onValuesChange={updateValues}/>}
    </div>
  </aside>;
}
