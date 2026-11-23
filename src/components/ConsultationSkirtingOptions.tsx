import { useMemo } from 'react';
import { buildDeckModel, buildLowerTierDeckModel } from '../lib/deckModel';
import { buildDeckSkirting, type SkirtOpening } from '../lib/deckSkirting';
import { buildDeckStairSkirting } from '../lib/deckStairSkirting';
import { deckVisualProducts } from '../data/visualCatalog';
import { DeckSkirtingEditor } from './DeckSkirtingEditor';

type V=Record<string,string|number|boolean>;
type SetValues=(fn:(current:V)=>V)=>void;
const parsed=<T,>(input:unknown):T[]=>{
  try{const data=JSON.parse(String(input??'[]'));return Array.isArray(data)?data as T[]:[];}catch{return [];}
};
export function ConsultationSkirtingOptions({values,onValuesChange}:{
  values:V;onValuesChange:SetValues;
}){
  const deck=useMemo(()=>buildDeckModel(values),[values]);
  const lower=useMemo(()=>buildLowerTierDeckModel(values),[values]);
  const enabled=values.skirtingEnabled===true;
  const lowerEnabled=values.lowerSkirtingEnabled===true;
  const exposed=deck.exposedSegments;
  const picked=parsed<number>(values.skirtingEdges).map(Number).filter(Number.isInteger);
  const openings=parsed<SkirtOpening>(values.skirtingOpenings);
  const rimDepth=Math.max(3.5,Number(deck.joistSize.split('x')[1]||8)-.75);
  const plan=useMemo(()=>buildDeckSkirting(deck.edgeSegments,exposed,
    Number(values.deckHeight??8),rimDepth,values),[deck,exposed,values,rimDepth]);
  const stairs=useMemo(()=>buildDeckStairSkirting(deck,values),[deck,values]);
  const change=(changes:V)=>onValuesChange(old=>({...old,...changes}));
  const enable=()=>{
    const all=exposed.map(s=>s.index);
    change({skirtingEnabled:!enabled,
      skirtingEdges:enabled?String(values.skirtingEdges??'[]'):JSON.stringify(picked.length?picked:all),
      skirtingGradeConfirmed:false});
  };
  const toggle=(index:number)=>{
    const next=picked.includes(index)?picked.filter(n=>n!==index):[...picked,index].sort((a,b)=>a-b);
    change({skirtingEdges:JSON.stringify(next),skirtingGradeConfirmed:false});
  };
  const addAccess=(kind:'opening'|'hinged-gate')=>{
    const edge=exposed.find(e=>picked.includes(e.index))??exposed[0];
    if(!edge)return;
    const width=Math.min(3,edge.length*.45);
    const offset=Math.max(0,(edge.length-width)/2);
    change({skirtingOpenings:JSON.stringify([...openings,
      {edgeIndex:edge.index,offset,width,kind,
        ...(kind==='hinged-gate'?{heightFt:Math.max(.5,Math.min(3,Number(values.deckHeight??5)-1))}:{})}]),
      skirtingGradeConfirmed:false});
  };
  const setMaterial=(material:'kdat'|'composite'|'pvc')=>{
    change({skirtingMaterial:material,skirtingColor:material==='kdat'?'Natural / stain-ready':
      String(values.deckingMaterial??'Select manufacturer color'),
      skirtingFaceIn:material==='kdat'?4.5:5.5,skirtingGradeConfirmed:false});
  };
  const onSyntheticColor=(name:string)=>change({skirtingColor:name,skirtingGradeConfirmed:false});
  return <section className="consultation-option-card consultation-full-width" aria-label="Deck skirting design">
    <div className="consultation-option-head">
      <div><h4>Skirting · finish the space under the deck</h4>
        <p className="muted">Choose the look, sides, access, and whether to close the stair stringers. The exact S&S 2×4 supports and stock cuts are automatically calculated.</p></div>
      <label className="consultation-checkbox"><input type="checkbox" checked={enabled} onChange={enable}/>Add skirting</label>
    </div>
    {enabled&&<>
      <div className="consultation-skirting-finish">
        <label>Finish material<select value={String(values.skirtingMaterial??'kdat')}
          onChange={e=>setMaterial(e.target.value as 'kdat'|'composite'|'pvc')}>
          <option value="kdat">Premium KDAT pressure-treated 1×5</option>
          <option value="composite">TimberTech composite</option>
          <option value="pvc">TimberTech advanced PVC</option>
        </select></label>
        <label>Board direction<select value={String(values.skirtingOrientation??'vertical')}
          onChange={e=>change({skirtingOrientation:e.target.value,skirtingGradeConfirmed:false})}>
          <option value="vertical">Vertical board skirting</option>
          <option value="horizontal">Horizontal board skirting</option>
        </select></label>
        <label>Board reveal / spacing<select value={String(values.skirtingGapIn??.25)}
          onChange={e=>change({skirtingGapIn:Number(e.target.value),skirtingGradeConfirmed:false})}>
          <option value={0}>Tight / near-closed (0″)</option>
          <option value={.125}>Tight shadow gap (⅛″)</option>
          <option value={.25}>Classic shadow gap (¼″)</option>
          <option value={.5}>Open modern look (½″)</option>
        </select></label>
      </div>
      {values.skirtingMaterial!=='kdat'?<>
        <strong className="consultation-small-heading">Matching TimberTech finish</strong>
        <div className="consultation-skirt-catalog">
          {deckVisualProducts.filter(p=>p.family===values.skirtingMaterial).slice(0,26).map(item=>
            <button type="button" key={item.id} className={String(values.skirtingColor)===item.label?'selected':''}
              aria-pressed={String(values.skirtingColor)===item.label} onClick={()=>onSyntheticColor(item.label)}>
              <img src={item.swatch} loading="lazy" alt={item.color+' true TimberTech grain'}/>
              <span>{item.collection} · {item.color}</span>
            </button>)}
        </div>
      </>:<p className="consultation-visual-note">KDAT finish: natural / stain-ready. Final stain color selected with the homeowner.</p>}
      <div>
        <strong className="consultation-small-heading">Which deck sides receive skirting?</strong>
        <div className="consultation-side-chips">
          {exposed.map(edge=><button type="button" key={edge.index} onClick={()=>toggle(edge.index)}
            aria-pressed={picked.includes(edge.index)}>
            {picked.includes(edge.index)?'✓ ':'+'} Side {edge.index+1} · {edge.length.toFixed(1)} ft
          </button>)}
        </div>
      </div>
      <div className="consultation-skirting-finish">
        <label className="consultation-checkbox"><input type="checkbox" checked={values.skirtingStairsEnabled!==false}
          onChange={e=>change({skirtingStairsEnabled:e.target.checked})}/>Match skirting along both stair sides</label>
        {values.multiTierEnabled===true&&<label className="consultation-checkbox"><input type="checkbox" checked={lowerEnabled}
          onChange={e=>change({lowerSkirtingEnabled:e.target.checked,
            lowerSkirtingEdges:e.target.checked?JSON.stringify(lower?.exposedSegments.map(s=>s.index)??[]):'[]',
            lowerSkirtingMaterial:String(values.skirtingMaterial??'kdat'),
            lowerSkirtingOrientation:String(values.skirtingOrientation??'vertical'),
            lowerSkirtingColor:String(values.skirtingColor??'Natural / stain-ready'),
            lowerSkirtingGradeConfirmed:false})}/>
          Also enclose the lower deck tier</label>}
        <div className="consultation-cover-pills">
          <button type="button" onClick={()=>addAccess('opening')}>+ Add access opening</button>
          <button type="button" onClick={()=>addAccess('hinged-gate')}>+ Hinged skirting gate</button>
        </div>
      </div>
      {!!openings.length&&<div className="consultation-access-placement">
        <strong className="consultation-small-heading">Access openings & gates — exact location</strong>
        {openings.map((opening,index)=>{
          const edge=deck.edgeSegments.find(e=>e.index===opening.edgeIndex);
          const changeOpening=(data:Partial<SkirtOpening>)=>
            change({skirtingOpenings:JSON.stringify(openings.map((o,i)=>i===index?{...o,...data}:o)),
              skirtingGradeConfirmed:false});
          return <div className="consultation-access-row" key={'access-'+index}>
            <label>Type<select value={opening.kind}
              onChange={e=>changeOpening({kind:e.target.value as SkirtOpening['kind']})}>
              <option value="opening">Uncovered opening</option>
              {opening.kind==='removable'&&<option value="removable">Legacy removable panel — choose replacement</option>}
              <option value="hinged-gate">Hinged skirting gate</option>
            </select></label>
            <label>Deck side<select value={opening.edgeIndex}
              onChange={e=>changeOpening({edgeIndex:Number(e.target.value),offset:0})}>
              {exposed.filter(edge=>picked.includes(edge.index)).map(edge=>
                <option key={edge.index} value={edge.index}>Side {edge.index+1} · {edge.length.toFixed(1)} ft</option>)}
            </select></label>
            <label>From corner (ft)<input type="number" min={0} step={.25}
              max={Math.max(0,(edge?.length??0)-opening.width)}
              value={opening.offset}
              onChange={e=>changeOpening({offset:Number(e.target.value)})}/></label>
            <label>Opening width (ft)<input type="number" min={1} step={.25}
              max={Math.max(1,(edge?.length??0)-opening.offset)}
              value={opening.width}
              onChange={e=>changeOpening({width:Number(e.target.value)})}/></label>
            {opening.kind==='hinged-gate'&&<label>Gate height (ft)<input type="number"
              min={.5} step={1/12}
              max={Math.max(.5,Number(values.deckHeight??5)-.9)}
              value={opening.heightFt??Math.max(.5,Number(values.deckHeight??5)-.9)}
              onChange={e=>changeOpening({heightFt:Number(e.target.value)})}/></label>
            <button type="button" className="ghost-btn small-btn"
              onClick={()=>change({skirtingOpenings:JSON.stringify(openings.filter((_,i)=>i!==index))})}>Remove</button>
          </div>;
        })}
        <small className="muted">Offsets are measured from the start corner of the selected deck side. Changes update the cut plan and 3D.</small>
      </div>}
      <div className="consultation-skirt-summary">
        <span>{plan.sides.length} deck side(s)</span>
        <span>{stairs.sides.length} stair side panels</span>
        <span>{plan.finishStock.length+stairs.finishStock.length} purchased finish boards</span>
        <span>{plan.frameStock.length+stairs.frameStock.length} 2×4 support stock</span>
        <span>{openings.length} access item(s)</span>
      </div>
      {!!plan.issues.length&&<div className="consultation-visual-note" role="status">{plan.issues.join(' · ')}</div>}
      <details className="consultation-subsettings">
        <summary>Exact side elevations, access opening positions & slope/grade verification</summary>
        <div className="consultation-subsettings-content">
          <p className="consultation-visual-note">Required before supplier order: verify grade at each end and whether ground contact, access panels, or drainage change the finish.</p>
          <DeckSkirtingEditor values={values} onValuesChange={onValuesChange}/>
        </div>
      </details>
    </>}
  </section>;
}
