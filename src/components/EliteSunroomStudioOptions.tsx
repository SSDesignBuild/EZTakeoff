import {useMemo,useState} from 'react';
import { SunroomSectionEditor } from './SunroomSectionEditor';
import type { DeckModel } from '../lib/deckModel';
import type { ConsultationProject } from '../lib/consultationProject';
import type { CoverWallSide } from '../lib/renaissanceCoverWallLayout';
import type { EliteSunroomSettings } from '../lib/eliteSunroomStudio';
import { planRenaissanceCoverWalls } from '../lib/renaissanceCoverWallLayout';
import { currentEliteSunroomSettings,eliteWallSections,eliteWallDimensionWarnings,
  eliteSunroomTakeoff } from '../lib/eliteSunroomStudio';
import { SERVICES } from '../data/services';

const sunroomService=SERVICES.find(service=>service.slug==='sunrooms');
const FIELD_KEYS=['roomSystem','framingColor','panelColor','windowColor'] as const;
const LABELS:Record<CoverWallSide,string>={
 front:'Front wall',left:'Left wall',right:'Right wall',rear:'Rear wall',
};
export function EliteSunroomStudioOptions({project,model,onChange}:{
 project:ConsultationProject;model:DeckModel;
 onChange:(changes:Partial<ConsultationProject>)=>void;
}){
 const [selectedSide,setSelectedSide]=useState<CoverWallSide>('front');
 const settings=currentEliteSunroomSettings(project);
 const center:[number,number]=[(model.minX+model.maxX)/2,(model.minY+model.maxY)/2];
 const deckHeight=Math.max(.35,Math.min(26,Number(project.values.deckHeight??5)));
 const walls=useMemo(()=>planRenaissanceCoverWalls(model,project,center,deckHeight).measuredRuns,
  [model,project,center[0],center[1],deckHeight]);
 const side=walls.some(w=>w.id===selectedSide)?selectedSide:'front';
 const wall=walls.find(w=>w.id===side);
 const configured=wall?eliteWallSections(project,wall):[];
 const mismatch=wall?eliteWallDimensionWarnings(wall,configured):[];
 const estimate=eliteSunroomTakeoff(project,walls.filter(w=>
   ![2,4,6].includes(Number(project.coverPrivacyWallGaps?.[w.id]??0))));
 const changeSettings=(key:typeof FIELD_KEYS[number],value:string)=>{
  onChange({eliteSunroom:{...settings,[key]:value} as EliteSunroomSettings});
 };
 const editWall=(updater:(current:Record<string,string|number|boolean>)=>
   Record<string,string|number|boolean>)=>{
  if(!wall)return;
  const next=updater({sunroomSections:JSON.stringify(configured)});
  onChange({eliteSunroom:{...settings,walls:{...settings.walls,
    [side]:String(next.sunroomSections??'[]')}}});
 };
 const resetWall=()=>{
  if(!wall)return;
  const copy={...settings.walls};delete copy[side];
  onChange({eliteSunroom:{...settings,walls:copy}});
 };
 return <article className="content-card elite-studio-options">
   <div className="section-heading">
     <div>
       <p className="eyebrow">ELITE ADD-A-ROOM / SALES STUDIO</p>
       <h3>Manufacturer sunroom wall layout</h3>
       <p className="muted">This is the same editable Sunroom section system and
       24-foot-stock material calculator used in Admin Takeoff. Its walls follow
       the actual Renaissance cover posts. Separate Elite corner posts are
       deliberately omitted.</p>
     </div>
   </div>
   <div className="form-grid elite-studio-global-grid">
     {FIELD_KEYS.map(key=>{
       const field=sunroomService?.fields.find(item=>item.key===key);
       return <label key={key} className="form-field">
         <span>{field?.label??key}</span>
         <select value={settings[key]} onChange={e=>changeSettings(key,e.target.value)}>
           {field?.options?.map(opt=><option key={String(opt.value)}
             value={String(opt.value)}>{opt.label}</option>)}
         </select>
       </label>;
     })}
     <label className="form-field"><span>Glazing specification</span>
       <select value={settings.glassType} disabled>
         <option value="clear-insulated">Clear insulated glass · verify supplier thickness</option>
       </select>
     </label>
   </div>
   <p className="consultation-visual-note">Mounted to existing Renaissance structural
     posts and roof; 3″ thermally broken or 2″ non-thermal Elite wall extrusions
     remain distinct. Match glass thickness, Low-E/tempering, roof isolation,
     jamb adapters, and code with ABC Supply/Elite before ordering.</p>
   <div className="elite-studio-side-tabs" role="group" aria-label="Select sunroom wall side">
     {walls.map(run=><button type="button" key={run.id}
       className={'ghost-btn small-btn'+(run.id===side?' active':'')}
       aria-pressed={run.id===side} onClick={()=>setSelectedSide(run.id)}>
       {LABELS[run.id]} · {run.widthFt.toFixed(2)} ft
     </button>)}
   </div>
   {wall&&<>
     <div className="elite-studio-wall-status">
       <strong>{LABELS[side]} — {configured.length} section(s)</strong>
       <span>Measured between Renaissance posts: {wall.widthFt.toFixed(2)} ft.
         Entered total: {configured.reduce((n,s)=>n+s.width,0).toFixed(2)} ft.</span>
       <button type="button" className="ghost-btn small-btn" onClick={resetWall}>
         Reset this wall to measured roof / post positions
       </button>
     </div>
     {!!mismatch.length&&<div className="consultation-handoff-warnings" role="alert">
       <strong>Dimensions need verification before client rendering</strong>
       {mismatch.map((issue,i)=><p key={i}>{issue}</p>)}
     </div>}
     {[2,4,6].includes(Number(project.coverPrivacyWallGaps?.[side]??0))&&
       <p className="consultation-visual-note" role="alert">
         A privacy wall is also selected here. It replaces the glass assembly
         for this side; remove the privacy wall to include Elite glazing.
       </p>}
     <SunroomSectionEditor values={{sunroomSections:JSON.stringify(configured)}}
       onValuesChange={editWall}/>
   </>}
   <div className="elite-studio-wall-status">
     <strong>Current combined Elite wall takeoff</strong>
     <span>{estimate.sections.length} editable sections across {walls.length} cover walls ·
       {' '}{estimate.estimate.materials.length} material schedule rows.
       Reuses Admin Sunrooms 24-foot stock optimizer, including DRC, H, receiver,
       base and top cap, window openings and Prime full-view door.</span>
     {!!estimate.dimensionWarnings.length&&
       <p className="consultation-visual-note" role="alert">
         Some wall dimensions do not yet match the actual posts/roof.
         Resolve the notices above on each wall before client approval.
       </p>}
   </div>
 </article>;
}
