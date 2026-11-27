import { buildDeckModel, buildLowerTierDeckModel, type DeckModel } from './deckModel';
import { stairFlightFrame } from './stairRailVisualGeometry';
import { landingSurface, planStairLandingForValues,
  type StairLandingPlan } from './stairConcreteLanding';
import type { DeckPoint } from './types';
import { resolveConcreteAppearance,type ConcreteAppearanceSelection } from './sikaConcreteCatalog';
import { clipDeckFace,subtractDeckFace,deckFaceArea,type DeckFacePoint } from './deckSurfaceClipping';

type SiteValues=Record<string,string|number|boolean>;
/** Existing drawn-slab allowance stays independent of S&S stair-pad ordering. */
const SITE_CONCRETE_WASTE_FACTOR=1.05;
export interface SiteConcreteArea extends ConcreteAppearanceSelection {
  id:string;
  name:string;
  /** Same feet coordinates as the deck drawing; y becomes world z. */
  points:DeckPoint[];
  thicknessIn:number;
  /** Top of slab relative to the scene's grade datum. */
  elevationFt:number;
}
export interface SiteConcreteAreaPlan extends SiteConcreteArea {
  areaSqFt:number;
  perimeterFt:number;
  volumeCuFt:number;
  volumeCuYd:number;
  wasteAdjustedCuYd:number;
  fieldFinishAreaSqFt:number;
  borderFinishAreaSqFt:number;
  borderLengthFt:number;
  finish:SiteConcreteFinishSelection;
}
export interface SiteConcreteFinishSelection {
  stampId:string;stampName:string;colorId:string;colorName:string;
  borderStampId:string;borderStampName:string;borderColorId:string;
  borderColorName:string;borderWidthIn:number;sourceUrls:string[];
  visualization:string;
}
export interface SiteConcretePlan {
  areas:SiteConcreteAreaPlan[];
  totalAreaSqFt:number;
  totalVolumeCuFt:number;
  totalVolumeCuYd:number;
  orderVolumeCuYd:number;
  /** Invalid/overlapping scope is editable but cannot produce an order. */
  canQuantify:boolean;
  validationIssues:string[];
  finishWarnings:string[];
}
export interface SiteStairLanding extends StairLandingPlan {
  id:string;
  name:string;
  points:DeckPoint[];
  elevationFt:number;
}
export const DEFAULT_SITE_CONCRETE_THICKNESS_IN=4;
export const DEFAULT_SITE_CONCRETE_ELEVATION_FT=.055;
const EPS=1e-7;
const cross=(a:DeckPoint,b:DeckPoint,c:DeckPoint)=>
  (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const distance=(a:DeckPoint,b:DeckPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const signedArea=(points:DeckPoint[])=>points.reduce((sum,p,i)=>{
  const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;
},0)/2;
const areaOf=(points:DeckPoint[])=>Math.abs(signedArea(points));
const onSegment=(a:DeckPoint,b:DeckPoint,p:DeckPoint)=>
  Math.abs(cross(a,b,p))<EPS&&p.x>=Math.min(a.x,b.x)-EPS&&
  p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&
  p.y<=Math.max(a.y,b.y)+EPS;
function segmentsIntersect(a:DeckPoint,b:DeckPoint,c:DeckPoint,d:DeckPoint){
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  return (abC*abD<-EPS&&cdA*cdB<-EPS)||onSegment(a,b,c)||
    onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}

/** Accept a conventional repeated closing point, but never remove invalid
 * vertices or turn self-crossing drawings into a different slab. */
function openRing(points:DeckPoint[]){
  const result=points.map(p=>({...p}));
  if(result.length>3&&distance(result[0],result[result.length-1])<EPS)result.pop();
  return result;
}
export function validateSiteConcreteArea(area:SiteConcreteArea):string[]{
  const name=area.name||'Concrete area';
  if(!area.id?.trim())return [name+': provide a unique area identifier.'];
  if(!Array.isArray(area.points)||area.points.length<3||area.points.length>128)
    return [name+': draw a closed polygon with 3–128 corners.'];
  if(!area.points.every(p=>p&&typeof p.x==='number'&&typeof p.y==='number'&&
    Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=10000&&Math.abs(p.y)<=10000))
    return [name+': every corner must have finite feet coordinates within the site drawing range.'];
  const points=openRing(area.points);
  const issues:string[]=[];
  if(!Number.isFinite(area.thicknessIn)||area.thicknessIn<=0||area.thicknessIn>60)
    issues.push(name+': slab thickness must be greater than zero and at most 60 inches.');
  if(!Number.isFinite(area.elevationFt)||Math.abs(area.elevationFt)>1000)
    issues.push(name+': top elevation must be finite and within 1,000 feet of grade.');
  if(points.some((p,i)=>distance(p,points[(i+1)%points.length])<EPS))
    issues.push(name+': remove duplicate consecutive corners.');
  if(areaOf(points)<.01)issues.push(name+': the polygon must enclose at least 0.01 square feet.');
  for(let i=0;i<points.length;i++){
    const next=(i+1)%points.length;
    // Adjacent collinear edges may continue straight, but may not double back.
    const previous=points[(i+points.length-1)%points.length];
    if(Math.abs(cross(previous,points[i],points[next]))<EPS&&
      (previous.x-points[i].x)*(points[next].x-points[i].x)+
      (previous.y-points[i].y)*(points[next].y-points[i].y)>EPS)
      issues.push(name+': polygon edges cannot double back over one another.');
    for(let j=i+1;j<points.length;j++){
      const nextJ=(j+1)%points.length;
      if(j===next||nextJ===i)continue;
      if(segmentsIntersect(points[i],points[next],points[j],points[nextJ]))
        issues.push(name+': polygon edges cross or touch themselves; redraw that corner.');
    }
  }
  return Array.from(new Set(issues));
}
function readAreas(raw:unknown):{areas:SiteConcreteArea[];validAreas:SiteConcreteArea[];validationIssues:string[]}{
  if(raw===undefined||raw===null||raw==='')return {areas:[],validAreas:[],validationIssues:[]};
  let parsed:unknown=raw;
  if(typeof raw==='string'){
    try{parsed=JSON.parse(raw);}catch{
      return {areas:[],validAreas:[],validationIssues:['Saved site concrete is not valid JSON. Correct it before exporting quantities.']};
    }
  }
  if(!Array.isArray(parsed)||parsed.length>100)
    return {areas:[],validAreas:[],validationIssues:['Site concrete must be a list of at most 100 areas.']};
  const areas:SiteConcreteArea[]=[],validAreas:SiteConcreteArea[]=[],validationIssues:string[]=[],ids=new Set<string>();
  parsed.forEach((value,index)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)){
      validationIssues.push('Concrete area '+(index+1)+': invalid saved area.');return;
    }
    const record=value as Record<string,unknown>;
    const area:SiteConcreteArea={
      id:typeof record.id==='string'?record.id.trim():'',
      name:typeof record.name==='string'&&record.name.trim()?record.name.trim():'Concrete area '+(index+1),
      points:record.points as DeckPoint[],
      thicknessIn:record.thicknessIn===undefined?DEFAULT_SITE_CONCRETE_THICKNESS_IN:record.thicknessIn as number,
      elevationFt:record.elevationFt===undefined?DEFAULT_SITE_CONCRETE_ELEVATION_FT:record.elevationFt as number,
      ...Object.fromEntries(['stampId','colorId','borderStampId','borderColorId']
        .filter(key=>typeof record[key]==='string').map(key=>[key,record[key]])),
      ...(record.borderWidthIn!==undefined?{borderWidthIn:record.borderWidthIn as number}:{}),
    };
    const errors=validateSiteConcreteArea(area),duplicateId=ids.has(area.id);
    if(duplicateId)errors.push(area.name+': area identifiers must be unique.');
    ids.add(area.id);
    validationIssues.push(...errors);
    // Keep finite polygons editable when a drag crosses an edge or a number
    // field is temporarily zero. The plan never renders or orders them until
    // repaired, but the editor must not lose the area or its selected inputs.
    const editable=!!area.id&&!duplicateId&&Array.isArray(area.points)&&
      area.points.length>=3&&area.points.length<=128&&area.points.every(p=>p&&
        typeof p.x==='number'&&typeof p.y==='number'&&Number.isFinite(p.x)&&Number.isFinite(p.y))&&
      typeof area.thicknessIn==='number'&&Number.isFinite(area.thicknessIn)&&
      typeof area.elevationFt==='number'&&Number.isFinite(area.elevationFt);
    if(editable)areas.push({...area,points:openRing(area.points)});
    if(!errors.length)validAreas.push({...area,points:openRing(area.points)});
  });
  return {areas,validAreas,validationIssues};
}
export function readSiteConcreteAreas(raw:unknown):SiteConcreteArea[]{return readAreas(raw).areas;}
export function serializeSiteConcreteAreas(areas:readonly SiteConcreteArea[]):string{
  return JSON.stringify(areas);
}
export function updateSiteConcreteArea(raw:unknown,id:string,patch:Partial<SiteConcreteArea>):string{
  return serializeSiteConcreteAreas(readSiteConcreteAreas(raw).map(area=>
    area.id===id?{...area,...patch,id:area.id}:area));
}

function pointInTriangle(p:DeckPoint,a:DeckPoint,b:DeckPoint,c:DeckPoint){
  return cross(a,b,p)>=-EPS&&cross(b,c,p)>=-EPS&&cross(c,a,p)>=-EPS;
}
/** Ear clipping lets overlap/coverage checks handle concave patios without
 * relying on bounding boxes or treating a concave recess as filled concrete. */
function triangles(input:DeckPoint[]):DeckPoint[][]{
  const points=openRing(input);
  if(signedArea(points)<0)points.reverse();
  let changed=true;
  while(changed&&points.length>3){
    changed=false;
    for(let i=0;i<points.length;i++){
      if(Math.abs(cross(points[(i+points.length-1)%points.length],points[i],points[(i+1)%points.length]))<EPS){
        points.splice(i,1);changed=true;break;
      }
    }
  }
  const result:DeckPoint[][]=[];
  while(points.length>3){
    let cut=false;
    for(let i=0;i<points.length;i++){
      const prev=(i+points.length-1)%points.length,next=(i+1)%points.length;
      const a=points[prev],b=points[i],c=points[next];
      if(cross(a,b,c)<=EPS)continue;
      if(points.some((p,j)=>j!==prev&&j!==i&&j!==next&&pointInTriangle(p,a,b,c)))continue;
      result.push([a,b,c]);points.splice(i,1);cut=true;break;
    }
    if(!cut)return [];
  }
  if(points.length===3)result.push(points);
  return result;
}
export function triangulateSiteConcretePolygon(points:DeckPoint[]):DeckPoint[][]{
  return triangles(points);
}
export interface ConcreteBorderPiece {
  edgeIndex:number;points:DeckPoint[];origin:DeckPoint;direction:DeckPoint;
}
export interface ConcreteDecorativeGeometry {
  fieldPolygons:DeckPoint[][];borderPieces:ConcreteBorderPiece[];
  fieldAreaSqFt:number;borderAreaSqFt:number;borderLengthFt:number;
}
/** Partition the actual slab face into field and perimeter courses. Mitered
 * strips are clipped to the slab and to already assigned pieces, so concave
 * corners and narrow areas never create overlapping quantities or off-slab
 * decorative surfaces. A border is part of this slab, not another pour. */
export function concreteDecorativeGeometry(area:SiteConcreteArea):ConcreteDecorativeGeometry{
  const selected=resolveConcreteAppearance(area),width=selected.borderWidthIn/12;
  const ring=openRing(area.points);
  if(signedArea(ring)<0)ring.reverse();
  let remaining=triangles(ring).map(face=>face.map(p=>[p.x,p.y] as DeckFacePoint));
  const total=remaining.reduce((sum,face)=>sum+deckFaceArea(face),0);
  if(!width||selected.border.id==='none')return {fieldPolygons:triangles(ring),
    borderPieces:[],fieldAreaSqFt:total,borderAreaSqFt:0,borderLengthFt:0};
  const directions=ring.map((p,i)=>{
    const q=ring[(i+1)%ring.length],len=distance(p,q);
    return {x:(q.x-p.x)/len,y:(q.y-p.y)/len};
  });
  const inset=ring.map((p,i)=>{
    const previous=directions[(i+ring.length-1)%ring.length],next=directions[i];
    const a={x:p.x-previous.y*width,y:p.y+previous.x*width};
    const b={x:p.x-next.y*width,y:p.y+next.x*width};
    const den=previous.x*next.y-previous.y*next.x;
    if(Math.abs(den)<1e-8)return b;
    const t=((b.x-a.x)*next.y-(b.y-a.y)*next.x)/den;
    // Extremely acute tips get a finite cut; the polygon clip below keeps it
    // inside the original slab. This is a visual course, not fabricated mat CAD.
    const limit=width*16,offset=Math.max(-limit,Math.min(limit,t));
    return {x:a.x+previous.x*offset,y:a.y+previous.y*offset};
  });
  const borderPieces:ConcreteBorderPiece[]=[];
  let borderLengthFt=0;
  for(let i=0;i<ring.length;i++){
    const j=(i+1)%ring.length,a=ring[i],b=ring[j],direction=directions[i];
    let ia=inset[i],ib=inset[j];
    // A course wider than a short tip collapses to a triangle, not a bow-tie.
    if((ib.x-ia.x)*direction.x+(ib.y-ia.y)*direction.y<0){
      const middle={x:(ia.x+ib.x)/2,y:(ia.y+ib.y)/2};ia=middle;ib=middle;
    }
    const candidate=[a,b,ib,ia].filter((p,k,points)=>
      k===0||distance(p,points[k-1])>EPS);
    const cuts=triangles(candidate).map(face=>face.map(p=>[p.x,p.y] as DeckFacePoint));
    const before=borderPieces.length;
    for(const cut of cuts){
      const kept:DeckFacePoint[][]=[];
      for(const face of remaining){
        let intersection=face;
        const signed=cut.reduce((sum,p,k)=>sum+p[0]*cut[(k+1)%cut.length][1]-cut[(k+1)%cut.length][0]*p[1],0);
        for(let k=0;k<cut.length&&intersection.length>=3;k++)
          intersection=clipDeckFace(intersection,cut[k],cut[(k+1)%cut.length],signed>=0);
        if(intersection.length>=3&&deckFaceArea(intersection)>EPS)
          borderPieces.push({edgeIndex:i,points:intersection.map(p=>({x:p[0],y:p[1]})),origin:a,direction});
        kept.push(...subtractDeckFace(face,cut));
      }
      remaining=kept;
    }
    if(borderPieces.length>before)borderLengthFt+=distance(a,b);
  }
  const fieldAreaSqFt=remaining.reduce((sum,face)=>sum+deckFaceArea(face),0);
  return {fieldPolygons:remaining.map(face=>face.map(p=>({x:p[0],y:p[1]}))),
    borderPieces,fieldAreaSqFt,borderAreaSqFt:Math.max(0,total-fieldAreaSqFt),borderLengthFt};
}
function clipConvex(subject:DeckPoint[],clip:DeckPoint[]){
  let output=subject;
  for(let i=0;i<clip.length&&output.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],input=output;output=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],cp=cross(a,b,p),cq=cross(a,b,q);
      const insideP=cp>=-EPS,insideQ=cq>=-EPS;
      if(insideP)output.push(p);
      if(insideP!==insideQ){
        const t=cp/(cp-cq);
        output.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});
      }
    }
  }
  return output;
}
export function siteConcreteOverlapAreaSqFt(a:DeckPoint[],b:DeckPoint[]):number{
  const aTriangles=triangles(a),bTriangles=triangles(b);
  return aTriangles.reduce((sum,first)=>sum+bTriangles.reduce((subtotal,second)=>
    subtotal+areaOf(clipConvex(first,second)),0),0);
}

function modelLandings(model:DeckModel,values:SiteValues,tier:'main'|'lower'):SiteStairLanding[]{
  if(!model.stairCount)return [];
  return model.stairPlacements.flatMap((placement,index)=>{
    if(placement.edgeIndex===null)return [];
    const frame=stairFlightFrame(model,placement,[0,0]);
    if(!frame)return [];
    const landing=planStairLandingForValues(frame.widthFt,values);
    if(!landing)return [];
    const treads=Math.max(1,model.stairTreadsPerRun);
    const run=treads*Math.max(.65,model.stairRunFt/treads);
    const local=[[-landing.widthFt/2,run],[landing.widthFt/2,run],
      [landing.widthFt/2,run+landing.depthFt],[-landing.widthFt/2,run+landing.depthFt]];
    const points=local.map(([x,z])=>({
      x:frame.originX+Math.cos(frame.yaw)*x+Math.sin(frame.yaw)*z,
      y:frame.originZ-Math.sin(frame.yaw)*x+Math.cos(frame.yaw)*z,
    }));
    return [{...landing,id:tier+'-stair-'+(index+1),
      name:(tier==='lower'?'Lower deck stair ':'Stair ')+(index+1),points,
      elevationFt:DEFAULT_SITE_CONCRETE_ELEVATION_FT}];
  });
}
/** Required landing footprints, whether supplied by auto pads or a drawn slab. */
export function siteConcreteStairLandings(values:SiteValues):SiteStairLanding[]{
  const lower=buildLowerTierDeckModel(values);
  return [...modelLandings(buildDeckModel(values),values,'main'),
    ...(lower?modelLandings(lower,values,'lower'):[])];
}
export function planSiteConcrete(values:SiteValues):SiteConcretePlan{
  const parsed=readAreas(values.siteConcreteAreas),validationIssues=[...parsed.validationIssues],finishWarnings:string[]=[];
  const areas:SiteConcreteAreaPlan[]=parsed.validAreas.map(area=>{
    const areaSqFt=areaOf(area.points),perimeterFt=area.points.reduce((sum,p,i)=>
      sum+distance(p,area.points[(i+1)%area.points.length]),0);
    const volumeCuFt=areaSqFt*area.thicknessIn/12,volumeCuYd=volumeCuFt/27;
    const appearance=resolveConcreteAppearance(area),decorative=concreteDecorativeGeometry(area);
    finishWarnings.push(...appearance.issues.map(issue=>area.name+': '+issue));
    const finish:SiteConcreteFinishSelection={stampId:appearance.stamp.id,stampName:appearance.stamp.name,
      colorId:appearance.color.id,colorName:appearance.color.name,
      borderStampId:appearance.border.id,borderStampName:appearance.border.name,
      borderColorId:appearance.borderColor.id,borderColorName:appearance.borderColor.name,
      borderWidthIn:appearance.borderWidthIn,
      sourceUrls:Array.from(new Set([appearance.stamp.sourceUrl,appearance.color.sourceUrl,
        ...(appearance.borderWidthIn?[appearance.border.sourceUrl,appearance.borderColor.sourceUrl]:[])])),
      visualization:'Manufacturer-reference pattern illustration; approximate screen colors and surface relief.'};
    return {...area,areaSqFt,perimeterFt,volumeCuFt,volumeCuYd,
      wasteAdjustedCuYd:volumeCuYd*SITE_CONCRETE_WASTE_FACTOR,
      fieldFinishAreaSqFt:decorative.fieldAreaSqFt,borderFinishAreaSqFt:decorative.borderAreaSqFt,
      borderLengthFt:decorative.borderLengthFt,finish};
  });
  for(let i=0;i<areas.length;i++)for(let j=i+1;j<areas.length;j++){
    if(siteConcreteOverlapAreaSqFt(areas[i].points,areas[j].points)>.00001)
      validationIssues.push(areas[i].name+' overlaps '+areas[j].name+
        '. Separate or combine the polygons before calculating concrete quantities.');
  }
  const surface=landingSurface(values.stairLandingSurface);
  if(surface==='bare-ground'||surface==='site-plan'){
    const landings=siteConcreteStairLandings(values);
    const lower=buildLowerTierDeckModel(values);
    const drawnFlightCount=[buildDeckModel(values),...(lower?[lower]:[])].reduce((sum,deck)=>
      sum+deck.stairPlacements.filter(placement=>placement.edgeIndex!==null&&placement.start&&placement.end).length,0);
    if(landings.length!==drawnFlightCount)
      validationIssues.push('One or more stair landing dimensions are invalid. Correct their width, depth or thickness before calculating concrete quantities.');
    if(surface==='bare-ground'){
      for(const area of areas)for(const landing of landings){
        if(siteConcreteOverlapAreaSqFt(area.points,landing.points)>.00001)
          validationIssues.push(area.name+' overlaps the automatic '+landing.name+
            ' concrete pad. Choose “Included in drawn concrete area” for the stair landing or move this polygon to avoid counting concrete twice.');
      }
    }else{
      for(const landing of landings){
        const covered=areas.filter(area=>Math.abs(area.elevationFt-landing.elevationFt)<=.01)
          .reduce((sum,area)=>sum+siteConcreteOverlapAreaSqFt(area.points,landing.points),0);
        if(covered<landing.widthFt*landing.depthFt-.0001)
          validationIssues.push(landing.name+' requires its full '+landing.widthFt.toFixed(2)+
            ' × '+landing.depthFt.toFixed(2)+' ft landing footprint inside drawn concrete at '+
            landing.elevationFt+' ft top elevation. Extend or align the concrete area before exporting.');
      }
    }
  }
  const totalAreaSqFt=areas.reduce((sum,area)=>sum+area.areaSqFt,0);
  const totalVolumeCuFt=areas.reduce((sum,area)=>sum+area.volumeCuFt,0);
  const canQuantify=validationIssues.length===0;
  return {areas,totalAreaSqFt,totalVolumeCuFt,totalVolumeCuYd:totalVolumeCuFt/27,
    orderVolumeCuYd:canQuantify?totalVolumeCuFt/27*SITE_CONCRETE_WASTE_FACTOR:0,
    canQuantify,validationIssues,finishWarnings};
}

/** A single scene datum includes deck tiers, stair exits and arbitrary site
 * polygons. Moving concrete never changes its relationship to the deck. */
export function siteConcreteSceneBounds(values:SiteValues){
  const model=buildDeckModel(values),lower=buildLowerTierDeckModel(values);
  const points=[...model.points,...(lower?.points??[]),
    ...readAreas(values.siteConcreteAreas).validAreas.flatMap(area=>area.points),
    ...siteConcreteStairLandings(values).flatMap(landing=>landing.points)];
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
  return {minX,maxX,minY,maxY,width:maxX-minX,depth:maxY-minY,
    center:[(minX+maxX)/2,(minY+maxY)/2] as [number,number]};
}
