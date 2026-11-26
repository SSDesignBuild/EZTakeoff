import { useMemo,useRef,useState } from 'react';
import { buildDeckModel,buildLowerTierDeckModel } from '../lib/deckModel';
import { planStairFootprints } from '../lib/stairPlanGeometry';
import { planSiteConcrete,concreteDecorativeGeometry } from '../lib/siteConcrete';
import { concretePlanAnnotations,concreteSchedulePages,type ConcreteTextMeasure } from '../lib/siteConcretePlanLayout';
import { wrapMaterialExportText } from '../lib/materialExport';
import { resolveConcreteAppearance } from '../lib/sikaConcreteCatalog';
import { exportSvgSectionsAsPdf } from '../lib/export';
import type { DeckPoint } from '../lib/types';

/** Supplemental measured sheet. It shares slab coordinates/finish partitions
 * with the editor, WebGL scene and material quantities, including remote slabs. */
export function SiteConcretePlanSheet({values}:{values:Record<string,string|number|boolean>}){
  const svgRef=useRef<SVGSVGElement|null>(null);
  const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
  const plan=useMemo(()=>planSiteConcrete(values),[values]);
  const main=useMemo(()=>buildDeckModel(values),[values]);
  const lower=useMemo(()=>buildLowerTierDeckModel(values),[values]);
  const measure=useMemo<ConcreteTextMeasure>(()=>{
    const context=typeof document==='undefined'?null:document.createElement('canvas').getContext('2d');
    return (text,size,bold=false)=>{
      if(!context)return text.length*size*.6;
      context.font=(bold?'700 ':'')+size+'px Arial';
      return context.measureText(text).width;
    };
  },[]);
  const schedule=useMemo(()=>concreteSchedulePages(plan.areas,measure),[plan.areas,measure]);
  if(!plan.areas.length)return null;
  const title=String(values.poJobName||'Site concrete plan');
  const titleLines=wrapMaterialExportText(title,1280,text=>measure(text,17));
  const drawingTop=142+(titleLines.length-1)*22;
  const decks=[main,...(lower?[lower]:[])],stairs=decks.flatMap(planStairFootprints);
  const all=[...decks.flatMap(deck=>deck.points),...stairs.flatMap(stair=>stair.corners),...plan.areas.flatMap(area=>area.points)];
  const minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x));
  const minY=Math.min(...all.map(p=>p.y)),maxY=Math.max(...all.map(p=>p.y));
  const scale=Math.min(1160/Math.max(1,maxX-minX),580/Math.max(1,maxY-minY));
  const left=120+(1160-(maxX-minX)*scale)/2,top=drawingTop+(580-(maxY-minY)*scale)/2;
  const at=(p:DeckPoint)=>({x:left+(p.x-minX)*scale,y:top+(p.y-minY)*scale});
  const points=(poly:DeckPoint[])=>poly.map(p=>{const q=at(p);return q.x+','+q.y;}).join(' ');
  const annotations=concretePlanAnnotations(plan.areas,at,{x:60,y:drawingTop-8,width:1280,height:640},measure);
  let nextScheduleY=drawingTop+710;
  const schedulePages=schedule.map(page=>{
    const y=nextScheduleY;nextScheduleY+=page.height+75;
    return {...page,y};
  });
  const sheetHeight=nextScheduleY+40;
  const exportPlan=async()=>{
    setExportError('');setExporting(true);
    try{
      await exportSvgSectionsAsPdf(svgRef.current,title+' · Site concrete plan','sns-site-concrete-plan.pdf');
    }catch(error){setExportError(error instanceof Error?error.message:'Unable to export the concrete plan. Please try again.');}
    finally{setExporting(false);}
  };
  return <section className="visual-card cad-card" aria-label="Site concrete plan and slab sections">
    <div className="visual-header"><div><h3>Site concrete plan &amp; slab sections</h3>
      <p className="muted">Measured placement, surface selections and thickness for every drawn area.</p></div>
      <button type="button" className="ghost-btn small-btn" disabled={!plan.canQuantify||exporting}
        onClick={()=>void exportPlan()}>{exporting?'Preparing concrete PDF…':'Export concrete plan PDF'}</button>
    </div>
    {exportError&&<p role="alert">{exportError}</p>}
    <svg ref={svgRef} viewBox={'0 0 1400 '+sheetHeight} className="layout-svg" data-export-concrete="true"
      role="img" aria-label="Measured site concrete polygons, dimensions and slab thickness sections"
      style={{width:'100%',background:'#fff'}} fontFamily="Arial, sans-serif">
      <rect x="20" y="20" width="1360" height={sheetHeight-40} fill="#fff" stroke="#334155" strokeWidth="2"/>
      <g data-export-section="true">
      <text x="60" y="60" fill="#111827" fontSize="25" fontWeight="bold">SITE CONCRETE · PLAN &amp; SLAB SECTIONS</text>
      {titleLines.map((line,index)=><text key={index} x="60" y={90+index*22} fill="#334155" fontSize="17">{line}</text>)}
      <text x="60" y={drawingTop-28} fill="#475569" fontSize="14">Shared coordinates in feet · Dashed outlines: decks · Lined rectangles: stairs</text>
      {decks.map((deck,index)=><g key={'reference-deck-'+index}>
        <polygon points={points(deck.points)} fill="#f1f5f9" stroke="#64748b" strokeWidth="2" strokeDasharray="9 5"/>
      </g>)}
      {stairs.map((stair,index)=><g key={'reference-stair-'+index}>
        <polygon points={points(stair.corners)} fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5"/>
        {stair.treads.map(([a,b],i)=><line key={i} x1={at(a).x} y1={at(a).y} x2={at(b).x} y2={at(b).y} stroke="#94a3b8"/>)}
      </g>)}
      {plan.areas.map(area=>{
        const appearance=resolveConcreteAppearance(area),decorative=concreteDecorativeGeometry(area);
        return <g key={area.id} data-concrete-area-id={area.id}>
          <polygon points={points(area.points)} fill={appearance.color.swatch} stroke="#334155" strokeWidth="2"/>
          {decorative.borderPieces.map((piece,i)=><polygon key={i} points={points(piece.points)} fill={appearance.borderColor.swatch}/>)}
        </g>;
      })}
      {annotations.map(callout=>Math.hypot(callout.center.x-callout.anchor.x,callout.center.y-callout.anchor.y)>1&&
        <line key={'leader-'+callout.index} x1={callout.anchor.x} y1={callout.anchor.y}
          x2={callout.center.x} y2={callout.center.y} stroke="#334155" strokeWidth="1.5"/>)}
      {annotations.map(callout=><g key={'callout-'+callout.index}>
        {callout.dimensions.map((dimension,index)=><text key={index}
          transform={'translate('+dimension.x+' '+dimension.y+') rotate('+dimension.angle+')'}
          textAnchor="middle" dominantBaseline="central" fontSize="13" fill="#111827" stroke="#fff" strokeWidth="3" paintOrder="stroke">
          {dimension.text}</text>)}
        <rect {...callout.box} rx="5" fill="#fff" stroke="#334155"/>
        <text x={callout.center.x} y={callout.center.y+6} textAnchor="middle" fontSize="18" fontWeight="bold" fill="#111827">C{callout.index+1}</text>
      </g>)}
      <text x="60" y={drawingTop+666} fontSize="16" fill="#334155">{plan.totalAreaSqFt.toFixed(2)} sq ft · {plan.totalVolumeCuFt.toFixed(2)} cu ft · {plan.canQuantify?plan.orderVolumeCuYd.toFixed(3)+' cu yd incl. 5% allowance':'QUANTITIES UNAVAILABLE'}</text>
      <text x="60" y={drawingTop+688} fontSize="13" fill="#475569">Every saved edge length is listed in the slab schedule; crowded plan dimensions use that schedule.</text>
      </g>
      {schedulePages.map((page,pageIndex)=><g key={'schedule-page-'+pageIndex} data-export-section="true">
        <text x="60" y={page.y} fontSize="17" fontWeight="bold" fill="#334155">
          CONCRETE SCHEDULE · {pageIndex+1} OF {schedulePages.length}</text>
      {page.rows.map((row,rowIndex)=>{
        const area=plan.areas[row.index],y=page.y+30+row.y,sectionDepth=Math.min(48,Math.max(12,area.thicknessIn*3));
        return <g key={'schedule-'+row.index+'-'+rowIndex}>
          <line x1="60" y1={y-8} x2="1340" y2={y-8} stroke="#cbd5e1"/>
          {row.lines.map((line,index)=><text key={index} x="60" y={y+line.y}
            fontSize={line.size} fontWeight={line.bold?'bold':undefined} fill={line.bold?'#111827':'#334155'}>{line.text}</text>)}
          <rect x="1060" y={y+39} width="245" height={sectionDepth} fill="#c1bfb9" stroke="#334155"/>
          <line x1="1060" y1={y+39} x2="1305" y2={y+39} stroke="#0f172a" strokeWidth="3"/>
          <text x="1182" y={y+25} textAnchor="middle" fontSize="14" fill="#334155">Slab section (diagram)</text>
          <text x="1182" y={y+57+sectionDepth} textAnchor="middle" fontSize="15" fill="#334155">{area.thicknessIn} in concrete thickness</text>
        </g>;
      })}</g>)}
      <g data-export-legend="true">
      <text x="60" y={sheetHeight-35} fontSize="13" fill="#475569">Top elevations use the design grade datum. Stamp layouts and screen colors are approximate manufacturer references.</text>
      </g>
    </svg>
  </section>;
}
