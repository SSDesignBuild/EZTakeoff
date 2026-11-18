import { useMemo } from 'react';
import { buildDeckModel } from '../lib/deckModel';
import { DeckSkirtingEditor } from './DeckSkirtingEditor';
import { getDeckVisualProduct, deckVisualProducts } from '../data/visualCatalog';

type Values=Record<string,string|number|boolean>;
type Update=(updater:(current:Values)=>Values)=>void;
const bool=(v:unknown)=>v===true||v==='true';
function selectedEdges(raw:unknown):number[]{
  try{
    const a=JSON.parse(String(raw??'[]'));
    return Array.isArray(a)?a.filter((n)=>Number.isInteger(n)):[];
  }catch{return [];}
}
export function SalesSkirtingOptions({values,onValuesChange}:{values:Values;onValuesChange:Update}){
  const model=useMemo(()=>buildDeckModel(values),[values]);
  const enabled=bool(values.skirtingEnabled);
  const synthetic=String(values.skirtingMaterial??'kdat')!=='kdat';
  const faceProduct=getDeckVisualProduct(values.skirtingColor);
  const pick=(update:Partial<Values>)=>onValuesChange((current)=>({...current,...update}));
  const toggle=(yes:boolean)=>{
    const edges=selectedEdges(values.skirtingEdges);
    const exposed=model.exposedSegments.map((segment)=>segment.index);
    onValuesChange((current)=>({...current,skirtingEnabled:yes,
      skirtingEdges:yes&&edges.length===0?JSON.stringify(exposed):String(current.skirtingEdges??'[]'),
      skirtingStairsEnabled:yes?current.skirtingStairsEnabled!==false:false}));
  };
  const setMaterial=(value:string)=>{
    const isKdat=value==='kdat';
    pick({skirtingMaterial:value,skirtingFaceIn:isKdat?4.5:5.5,
      skirtingColor:isKdat?'Natural / stain-ready':String(values.deckingMaterial??'')});
  };
  return <article className="consultation-option-card consultation-skirting-card">
    <div className="consultation-feature-heading">
      <div><p className="eyebrow">FINISH / ENCLOSURE</p>
        <h4>Deck & stair skirting</h4>
        <p className="muted">Choose the look here; precise edges, access panels and grade can be edited without leaving consultation.</p>
      </div>
      <label className="consultation-checkbox"><input type="checkbox" checked={enabled}
        onChange={(e)=>toggle(e.target.checked)}/>Add skirting</label>
    </div>
    {enabled&&<>
      <div className="consultation-skirting-options">
        <label>Board material
          <select value={String(values.skirtingMaterial??'kdat')} onChange={(e)=>setMaterial(e.target.value)}>
            <option value="kdat">KDAT pressure treated · 1×5</option>
            <option value="composite">Composite deck-board skirting</option>
            <option value="pvc">Advanced PVC deck-board skirting</option>
          </select></label>
        <label>Installation direction
          <select value={String(values.skirtingOrientation??'vertical')}
            onChange={(e)=>pick({skirtingOrientation:e.target.value})}>
            <option value="vertical">Vertical · clean modern</option>
            <option value="horizontal">Horizontal · wide board courses</option>
          </select></label>
        <label>Exposed gap
          <select value={String(values.skirtingGapIn??.25)}
            onChange={(e)=>pick({skirtingGapIn:Number(e.target.value)})}>
            <option value="0">Tight · 0 in</option>
            <option value=".125">1/8 in</option>
            <option value=".25">1/4 in · standard</option>
            <option value=".375">3/8 in</option>
            <option value=".5">1/2 in</option>
          </select></label>
        <label>Skirting finish
          {synthetic?<select value={faceProduct?.label??String(values.skirtingColor??values.deckingMaterial??'')}
            onChange={(e)=>pick({skirtingColor:e.target.value})}>
            <option value={String(values.deckingMaterial??'')}>Match selected decking</option>
            {deckVisualProducts.filter(p=>p.family===String(values.skirtingMaterial)).map(p=>
              <option key={p.id} value={p.label}>{p.collection} / {p.color}</option>)}
          </select>:<input type="text" value={String(values.skirtingColor??'Natural / stain-ready')}
            onChange={(e)=>pick({skirtingColor:e.target.value})}/>}
        </label>
        <label>Skirting board face (in)
          <input type="number" min={1} max={12} step={.125}
            value={Number(values.skirtingFaceIn??(synthetic?5.5:4.5))}
            onChange={(e)=>pick({skirtingFaceIn:Number(e.target.value)})}/>
        </label>
        <label className="consultation-checkbox"><input type="checkbox"
          checked={bool(values.skirtingStairsEnabled)}
          onChange={(e)=>pick({skirtingStairsEnabled:e.target.checked})}/>
          Continue matching skirting on both sides of stair flights</label>
        {bool(values.multiTierEnabled)&&<label className="consultation-checkbox">
          <input type="checkbox" checked={bool(values.lowerSkirtingEnabled)}
            onChange={(e)=>pick({lowerSkirtingEnabled:e.target.checked})}/>
          Add skirting to lower deck tier</label>}
      </div>
      {faceProduct&&<div className="consultation-skirting-match">
        <img src={faceProduct.swatch} alt={faceProduct.label+' skirting finish'} loading="lazy"/>
        <span>Manufacturer board photo · {faceProduct.color} <small>Actual field color and grade may vary</small></span>
      </div>}
      <details className="consultation-detailed-configuration">
        <summary>Set exact skirting sides, ground slopes, access openings & supports</summary>
        <p className="muted">Same skirting engine as Admin Takeoff: 2×4 supports at 24 in O.C., supplier cut lists, stair panels and grade checks.</p>
        <DeckSkirtingEditor values={values} onValuesChange={onValuesChange}/>
      </details>
      <p className="consultation-skirting-hint">KDAT stock: 8′ / 12′ / 16′ / 20′. Composite and PVC stock: 16′ / 20′. Field grade verification is required before a supplier order.</p>
    </>}
  </article>;
}
