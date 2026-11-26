import type { DeckPoint } from './types';
import type { SiteConcreteAreaPlan } from './siteConcrete';
import { triangulateSiteConcretePolygon } from './siteConcrete';
import { wrapMaterialExportText } from './materialExport';

export type ConcreteTextMeasure=(text:string,size:number,bold?:boolean)=>number;
export interface ConcretePlanBox {x:number;y:number;width:number;height:number}
export interface ConcretePlanDimension {text:string;x:number;y:number;angle:number;box:ConcretePlanBox}
export interface ConcretePlanCallout {index:number;anchor:DeckPoint;center:DeckPoint;box:ConcretePlanBox;dimensions:ConcretePlanDimension[]}
export const concretePlanBoxesOverlap=(a:ConcretePlanBox,b:ConcretePlanBox,gap=4)=>
  a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
const inside=(box:ConcretePlanBox,bounds:ConcretePlanBox)=>box.x>=bounds.x&&box.y>=bounds.y&&
  box.x+box.width<=bounds.x+bounds.width&&box.y+box.height<=bounds.y+bounds.height;

/** Keep the plan legible at site scale. Crowded dimensions remain complete in
 * the per-slab schedule instead of being printed on top of another label. */
export function concretePlanAnnotations(areas:readonly SiteConcreteAreaPlan[],at:(p:DeckPoint)=>DeckPoint,
  bounds:ConcretePlanBox,measure:ConcreteTextMeasure):ConcretePlanCallout[]{
  const polygons=areas.map(area=>area.points.map(at));
  const polygonBoxes=polygons.map(points=>({x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),
    width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),
    height:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))}));
  const occupied:ConcretePlanBox[]=[];
  const callouts=areas.map((area,index)=>{
    const triangle=triangulateSiteConcretePolygon(area.points).sort((a,b)=>{
      const cross=(p:DeckPoint[])=>Math.abs((p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[1].y-p[0].y)*(p[2].x-p[0].x));
      return cross(b)-cross(a);
    })[0];
    const anchor=triangle?at({x:triangle.reduce((sum,p)=>sum+p.x,0)/3,y:triangle.reduce((sum,p)=>sum+p.y,0)/3}):at(area.points[0]);
    const width=Math.max(52,measure('C'+(index+1),18,true)+16),height=30;
    const candidates:DeckPoint[]=[anchor];
    // Nearby leaders avoid callout collisions on narrow/remote groups of slabs.
    for(let ring=1;ring<=12;ring++)for(let k=0;k<8*ring;k++){
      const angle=k/(8*ring)*Math.PI*2;
      candidates.push({x:anchor.x+Math.cos(angle)*ring*38,y:anchor.y+Math.sin(angle)*ring*38});
    }
    const boxAt=(p:DeckPoint)=>({x:p.x-width/2,y:p.y-height/2,width,height});
    const available=(p:DeckPoint)=>inside(boxAt(p),bounds)&&!occupied.some(box=>concretePlanBoxesOverlap(boxAt(p),box));
    let center=candidates.find(available);
    // A tightly grouped set of small slabs can exhaust the local rings at a
    // sheet edge. Search the complete drawable region before allowing a label
    // to fall back onto another label. The sheet has room for all 100 supported
    // slabs at the measured callout size, even when the site scale is tiny.
    if(!center){
      const grid:DeckPoint[]=[];
      for(let y=bounds.y+height/2;y<=bounds.y+bounds.height-height/2;y+=height+8)
        for(let x=bounds.x+width/2;x<=bounds.x+bounds.width-width/2;x+=width+8)grid.push({x,y});
      grid.sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y));
      center=grid.find(available);
    }
    if(!center)throw new Error('The concrete plan needs a larger label region for this number of slabs.');
    const box=boxAt(center);occupied.push(box);
    return {index,anchor,center,box,dimensions:[] as ConcretePlanDimension[]};
  });
  callouts.forEach((callout,index)=>{
    const area=areas[index],poly=polygons[index];
    const signed=poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p.x*q.y-q.x*p.y;},0);
    poly.forEach((a,i)=>{
      const b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y,span=Math.hypot(dx,dy);
      if(span<24)return;
      const p=area.points[i],q=area.points[(i+1)%area.points.length];
      const text=Math.hypot(q.x-p.x,q.y-p.y).toFixed(2)+' ft';
      const width=measure(text,13)+8,height=19;
      let angle=Math.atan2(dy,dx)*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180;
      const radians=angle*Math.PI/180,boxWidth=Math.abs(Math.cos(radians))*width+Math.abs(Math.sin(radians))*height,
        boxHeight=Math.abs(Math.sin(radians))*width+Math.abs(Math.cos(radians))*height;
      const direction=signed>=0?1:-1,nx=dy/span*direction,ny=-dx/span*direction;
      for(const offset of [20,34,48,64]){
        const x=(a.x+b.x)/2+nx*offset,y=(a.y+b.y)/2+ny*offset;
        const box={x:x-boxWidth/2,y:y-boxHeight/2,width:boxWidth,height:boxHeight};
        if(!inside(box,bounds)||occupied.some(other=>concretePlanBoxesOverlap(box,other))||
          polygonBoxes.some(other=>concretePlanBoxesOverlap(box,other,1)))continue;
        callout.dimensions.push({text,x,y,angle,box});occupied.push(box);break;
      }
    });
  });
  return callouts;
}

export interface ConcreteScheduleLine {text:string;size:number;bold:boolean;y:number}
export interface ConcreteScheduleRow {index:number;continued:boolean;lines:ConcreteScheduleLine[];height:number;y:number}
export interface ConcreteSchedulePage {rows:ConcreteScheduleRow[];height:number}

/** Wrap full slab names and selections and split exceptionally long records
 * across measured schedule pages. The slab section keeps its own right column. */
export function concreteSchedulePages(areas:readonly SiteConcreteAreaPlan[],measure:ConcreteTextMeasure):ConcreteSchedulePage[]{
  const pages:ConcreteSchedulePage[]=[];let page:ConcreteSchedulePage={rows:[],height:0};
  const maxHeight=700;
  const startPage=()=>{if(page.rows.length)pages.push(page);page={rows:[],height:0};};
  areas.forEach((area,index)=>{
    const entries:[string,number,boolean][]=[
      ['C'+(index+1)+' · '+area.name,19,true],
      [area.areaSqFt.toFixed(2)+' sq ft · '+area.perimeterFt.toFixed(2)+' ft perimeter · top elevation '+area.elevationFt.toFixed(3)+' ft',15,false],
      ['Field: '+area.finish.stampName+' · '+area.finish.colorName,15,false],
      [area.borderFinishAreaSqFt>0?'Border: '+area.finish.borderStampName+' · '+area.finish.borderWidthIn+' in · '+area.finish.borderColorName:'No separate decorative border',15,false],
      [area.fieldFinishAreaSqFt.toFixed(2)+' sq ft field + '+area.borderFinishAreaSqFt.toFixed(2)+' sq ft border · border is part of this slab volume',13,false],
      ['Edge lengths in saved vertex order (ft): '+area.points.map((p,i)=>{const q=area.points[(i+1)%area.points.length];return Math.hypot(q.x-p.x,q.y-p.y).toFixed(2);}).join(' · '),13,false],
    ];
    const pending=entries.flatMap(([text,size,bold])=>wrapMaterialExportText(text,940,value=>measure(value,size,bold)).map(text=>({text,size,bold})));
    let continued=false;
    while(pending.length){
      const allHeight=Math.max(135,pending.reduce((sum,line)=>sum+line.size+7,continued?26:0)+14);
      if(page.rows.length&&(page.rows.length>=4||page.height+Math.min(allHeight,maxHeight)>maxHeight))startPage();
      const lines:ConcreteScheduleLine[]=[];let cursor=0;
      if(continued){lines.push({text:'C'+(index+1)+' · continued',size:19,bold:true,y:19});cursor=26;}
      while(pending.length&&cursor+pending[0].size+7+14<=maxHeight-page.height){
        const line=pending.shift()!;lines.push({...line,y:cursor+line.size});cursor+=line.size+7;
      }
      const height=Math.max(135,cursor+14);
      page.rows.push({index,continued,lines,height,y:page.height});page.height+=height;
      if(pending.length){startPage();continued=true;}
    }
  });
  if(page.rows.length)pages.push(page);
  return pages;
}
