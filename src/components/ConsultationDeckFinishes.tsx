import type { ConsultationProject } from '../lib/consultationProject';
import { deckVisualProducts, getDeckVisualProduct } from '../data/visualCatalog';
import {
  resolvePictureFrameMaterials,resolveBreakerBoardMaterials,
  resolveFasciaMaterial,resolveStairSideFasciaMaterial,
} from '../lib/deckTrimSelection';

type Values=ConsultationProject['values'];
const swatchOptions=deckVisualProducts.map(board=>({
  label:board.label,title:board.collection+' · '+board.color,
}));
interface FinishSelectProps {
  label:string;value:string;resolved:string;onChange:(value:string)=>void;
  matchLabel?:string;matchValue?:string;
}
export function DeckFinishSwatchSelect({label,value,resolved,onChange,
  matchLabel='Match main decking',matchValue='match'}:FinishSelectProps){
  const verified=getDeckVisualProduct(resolved);
  const current=swatchOptions.some(opt=>opt.label===value);
  return <label className="consultation-finish-select">
    <span>{label}</span>
    <select aria-label={label} value={value} onChange={event=>onChange(event.target.value)}>
      <option value={matchValue}>{matchLabel}</option>
      {swatchOptions.map(board=><option value={board.label} key={board.label}>{board.title}</option>)}
      {value!==matchValue&&!current&&<option value={value}>{value} (existing choice)</option>}
    </select>
    <div className="consultation-finish-preview">
      {verified?<img loading="lazy" src={verified.swatch} alt={verified.collection+' '+verified.color+' manufacturer board swatch'}/>
        :<div className="consultation-finish-no-photo">Manufacturer photo unavailable</div>}
      <span>{verified?verified.collection+' · '+verified.color:resolved||'Unspecified material'}</span>
    </div>
  </label>;
}
export function ConsultationDeckFinishes({values,onValues}:{
  values:Values;onValues:(values:Values)=>void;
}){
  const pictureCount=Math.max(0,Math.min(3,Number(values.pictureFrameCount??0)));
  const breakerCount=Math.max(0,Math.min(3,Number(values.breakerBoardCount??0)));
  const picture=resolvePictureFrameMaterials(values);
  const breaker=resolveBreakerBoardMaterials(values);
  const change=(field:string,value:string|number|boolean)=>onValues({...values,[field]:value});
  const frameChange=(index:number,next:string)=>{
    const key=index===0?'pictureFrameMaterial':'pictureFrameMaterial'+(index+1);
    const startedMatching=values.borderSameBoard!==false;
    const updated={...values,
      pictureFrameMaterial:startedMatching?'match':values.pictureFrameMaterial,
      pictureFrameMaterial2:startedMatching?'match':values.pictureFrameMaterial2,
      pictureFrameMaterial3:startedMatching?'match':values.pictureFrameMaterial3,
      [key]:next,
    };
    const active=Math.max(1,Math.min(3,Number(values.pictureFrameCount??1)));
    const all=Array.from({length:active},(_,i)=>
      String(updated[i===0?'pictureFrameMaterial':'pictureFrameMaterial'+(i+1)]??'match'));
    updated.borderSameBoard=all.every(v=>v==='match');
    onValues(updated);
  };
  return <article className="consultation-option-card consultation-finish-card">
    <h4>Picture frame, breaker & fascia finishes</h4>
    <p className="muted">Every visible trim board can match the field decking or use a different manufacturer swatch.</p>
    <label>Picture frame courses<select value={pictureCount}
      onChange={event=>change('pictureFrameCount',Number(event.target.value))}>
      {[0,1,2,3].map(n=><option key={n} value={n}>{n===0?'None':n+' course'+(n===1?'':'s')}</option>)}
    </select></label>
    {Array.from({length:pictureCount},(_,i)=><DeckFinishSwatchSelect
      key={'picture-frame-'+i} label={'Picture frame course '+(i+1)}
      value={values.borderSameBoard!==false?'match':String(values[i===0?'pictureFrameMaterial':'pictureFrameMaterial'+(i+1)]??'match')}
      resolved={picture[i]} onChange={next=>frameChange(i,next)}/>)}
    <label className="consultation-checkbox"><input type="checkbox"
      checked={values.pictureFrameHouseSide===true}
      onChange={event=>change('pictureFrameHouseSide',event.target.checked)}/>
      Include picture frame on house side
    </label>
    <label>Breaker board courses<select value={breakerCount}
      onChange={event=>change('breakerBoardCount',Number(event.target.value))}>
      {[0,1,2,3].map(n=><option key={n} value={n}>{n===0?'None':n+' course'+(n===1?'':'s')}</option>)}
    </select></label>
    {Array.from({length:breakerCount},(_,i)=>{
      const key=i===0?'breakerBoardMaterial':'breakerBoardMaterial'+(i+1);
      return <DeckFinishSwatchSelect key={'breaker-'+i} label={'Breaker board course '+(i+1)}
        value={String(values[key]??'match')} resolved={breaker[i]}
        onChange={next=>change(key,next)}/>;
    })}
    <DeckFinishSwatchSelect label="Perimeter fascia board"
      value={String(values.fasciaMaterial??'match')}
      resolved={resolveFasciaMaterial(values)}
      onChange={next=>change('fasciaMaterial',next)}/>
    <p className="consultation-visual-note">Photo textures are manufacturer references; actual delivered board grain and color vary by lighting. Material cut lists are computed separately.</p>
  </article>;
}
export function StairFasciaFinishSelect({values,onValues}:{
  values:Values;onValues:(values:Values)=>void;
}){
  return <DeckFinishSwatchSelect label="Stair side fascia board"
    matchLabel="Match perimeter fascia" matchValue="match-fascia"
    value={String(values.stairFasciaMaterial??'match-fascia')}
    resolved={resolveStairSideFasciaMaterial(values)}
    onChange={next=>onValues({...values,stairFasciaMaterial:next})}/>;
}
