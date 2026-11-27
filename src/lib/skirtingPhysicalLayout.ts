import type { SkirtCut,SkirtSide,SkirtPlan } from './deckSkirting';
import { planSkirtingGateFace } from './skirtingGateFace';

export type SkirtProfilePoint=[number,number]; // along side, absolute elevation (ft)
export interface SkirtPhysicalMember {
 cutId:string;material:'finish'|'2x4';role:string;
 profile:SkirtProfilePoint[];axis:[SkirtProfilePoint,SkirtProfilePoint];
 depthFt:number;faceFt:number;cutLengthFt:number;gateIndex?:number;
}
export interface SkirtCutPlacement {
 role:'top-rail'|'bottom-rail'|'stud'|'gate-top'|'gate-bottom'|'gate-left'|'gate-right'|
  'gate-header'|'gate-finish'|'upper-finish'|'vertical-finish'|'horizontal-finish';
 startFt?:number;endFt?:number;stationFt?:number;row?:number;faceFt?:number;
 openingIndex?:number;boardIndex?:number;
}
export const SKIRT_FRAME_FACE_FT=1.5/12;
export const SKIRT_FRAME_DEPTH_FT=3.5/12;
const memberBounds=(member:SkirtPhysicalMember)=>({
 s:Math.min(...member.profile.map(p=>p[0])),e:Math.max(...member.profile.map(p=>p[0])),
 bottom:Math.min(...member.profile.map(p=>p[1])),top:Math.max(...member.profile.map(p=>p[1])),
});
export function skirtMemberSupports(member:SkirtPhysicalMember,members:SkirtPhysicalMember[]):SkirtPhysicalMember[]{
 const b=memberBounds(member);
 return members.filter(frame=>{
  if(frame===member||frame.material!=='2x4')return false;
  const f=memberBounds(frame);
  if(Math.min(b.e,f.e)<Math.max(b.s,f.s)-.001||Math.min(b.top,f.top)<Math.max(b.bottom,f.bottom)-.001)return false;
  if(member.material==='finish'){
   if(member.gateIndex!==undefined&&member.role==='gate-finish')return frame.gateIndex===member.gateIndex;
   return frame.gateIndex===undefined||frame.role==='gate-header';
  }
  return true;
 });
}
export function skirtMemberFasteners(member:SkirtPhysicalMember,members:SkirtPhysicalMember[],orientation:'vertical'|'horizontal'):number{
 if(member.material==='2x4')return ['gate-left','gate-right'].includes(member.role)?0:4;
 return orientation==='vertical'?4:2*Math.max(2,skirtMemberSupports(member,members)
  .filter(s=>['stud','gate-left','gate-right'].includes(s.role)).length);
}
export function skirtFastenerSummary(sides:SkirtSide[],orientation:'vertical'|'horizontal'){
 let frameScrews=0,finishFasteners=0;
 for(const side of sides)for(const member of side.physicalMembers??[]){
  const count=skirtMemberFasteners(member,side.physicalMembers??[],orientation);
  if(member.material==='2x4')frameScrews+=count;else finishFasteners+=count;
 }
 return {frameScrews,finishFasteners};
}
export function skirtFinishThicknessFt(options:SkirtPlan['options']):number{
 return options.material==='kdat'?.75/12:1/12;
}
export function clipSkirtProfile(poly:SkirtProfilePoint[],a:number,b:number,c:number):SkirtProfilePoint[]{
 const out:SkirtProfilePoint[]=[];
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length];
  const fp=a*p[0]+b*p[1]+c,fq=a*q[0]+b*q[1]+c;
  if(fp>=-1e-8)out.push(p);
  if((fp>=0)!==(fq>=0)){
   const t=fp/(fp-fq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
  }
 }
 return out.filter((p,i)=>!i||Math.hypot(p[0]-out[i-1][0],p[1]-out[i-1][1])>1e-7);
}
export const skirtRect=(s:number,e:number,b:number,t:number):SkirtProfilePoint[]=>[[s,b],[e,b],[e,t],[s,t]];
export function skirtMember(cut:SkirtCut,profile:SkirtProfilePoint[],depthFt:number,
 faceFt:number,axis?:[SkirtProfilePoint,SkirtProfilePoint]):SkirtPhysicalMember|null{
 const area=Math.abs(profile.reduce((sum,p,i)=>{const q=profile[(i+1)%profile.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
 if(profile.length<3||area<1e-7)return null;
 const s=Math.min(...profile.map(p=>p[0])),e=Math.max(...profile.map(p=>p[0]));
 const bottom=Math.min(...profile.map(p=>p[1])),top=Math.max(...profile.map(p=>p[1]));
 const vertical=['stud','gate-left','gate-right','vertical-finish','upper-finish'].includes(cut.placement?.role??'');
 const line=axis??(vertical?[[s+(e-s)/2,bottom],[s+(e-s)/2,top]]:
  [[s,(bottom+top)/2],[e,(bottom+top)/2]]) as [SkirtProfilePoint,SkirtProfilePoint];
 return {cutId:cut.id,material:cut.material==='finish'?'finish':'2x4',
  role:cut.placement?.role??cut.location,profile,axis:line,depthFt,
  faceFt:cut.material==='finish'&&Math.abs(line[1][0]-line[0][0])>.001?Math.min(faceFt,top-bottom):faceFt,
  cutLengthFt:Math.hypot(line[1][0]-line[0][0],line[1][1]-line[0][1]),
  ...(cut.placement?.openingIndex!==undefined?{gateIndex:cut.placement.openingIndex}:{})};
}
/** Converts the existing named cut inventory into physical members. The
 * same cut identities survive stock packing, installed CAD and the 3D scene.
 * Base/top plates are dressed 1.5 x 3.5, with studs BETWEEN the plates.
 */
export function physicalPerimeterSkirt(side:SkirtSide,options:SkirtPlan['options'],top:number):SkirtPhysicalMember[]{
 const result:SkirtPhysicalMember[]=[],face=options.faceIn/12,reveal=options.revealIn/12;
 const plate=SKIRT_FRAME_FACE_FT,depth=SKIRT_FRAME_DEPTH_FT;
 const finishDepth=skirtFinishThicknessFt(options),pitch=(options.faceIn+options.gapIn)/12;
 const gradeSlope=-(side.endHeightFt-side.startHeightFt)/side.lengthFt;
 const grade0=top-side.startHeightFt;
 const ground=(s:number)=>grade0+gradeSlope*s;
 const bottomPlateRise=plate*Math.hypot(1,gradeSlope);
 for(const cut of [...side.framingCuts,...side.finishCuts]){
  const p=cut.placement;if(!p)continue;
  let s=p.startFt??p.stationFt??0,e=p.endFt??s;
  let profile:SkirtProfilePoint[]=[],axis:[SkirtProfilePoint,SkirtProfilePoint]|undefined;
  let faceFt=p.faceFt??face;
  const opening=p.openingIndex!==undefined?side.openings[p.openingIndex]:undefined;
  let gate:{left:number;right:number;bottom:number;top:number;infill:number}|null=null;
  if(opening){
   const least=Math.min(side.startHeightFt-gradeSlope*opening.offset,
    side.startHeightFt-gradeSlope*(opening.offset+opening.width));
   const allowed=Math.max(.3,least-.18),h=Math.max(.3,Math.min(allowed,opening.heightFt??allowed));
   const bottom=top-least+.18-.012;
   gate={left:opening.offset+.04,right:opening.offset+opening.width-.04,
    bottom,top:bottom+h,infill:Math.max(0,allowed-h)};
  }
  switch(p.role){
   case 'top-rail':profile=skirtRect(s,e,top-plate,top);faceFt=plate;break;
   case 'bottom-rail':
    profile=[[s,ground(s)],[e,ground(e)],[e,ground(e)+bottomPlateRise],[s,ground(s)+bottomPlateRise]];
    axis=[[s,ground(s)+bottomPlateRise/2],[e,ground(e)+bottomPlateRise/2]];faceFt=plate;break;
   case 'stud':{
    let station=p.stationFt??0;
    // A jamb occupies the fixed wall beside the opening, not the moving
    // gate's clear width. Corner studs remain within their selected side.
    const left=side.openings.some(o=>Math.abs(station-o.offset)<.001);
    const right=side.openings.some(o=>Math.abs(station-o.offset-o.width)<.001);
    station+=left?-plate/2:right?plate/2:0;
    station=Math.max(plate/2,Math.min(side.lengthFt-plate/2,station));
    s=station-plate/2;e=station+plate/2;
    if(top-plate<=Math.min(ground(s),ground(e))+bottomPlateRise)break;
    profile=[[s,ground(s)+bottomPlateRise],[e,ground(e)+bottomPlateRise],[e,top-plate],[s,top-plate]];
    profile=clipSkirtProfile(profile,0,1,-Math.min(ground(s),ground(e)));
    faceFt=plate;break;
   }
   case 'gate-top':if(gate)profile=skirtRect(gate.left,gate.right,gate.top-plate,gate.top);faceFt=plate;break;
   case 'gate-bottom':if(gate)profile=skirtRect(gate.left,gate.right,gate.bottom,gate.bottom+plate);faceFt=plate;break;
   case 'gate-left':if(gate)profile=skirtRect(gate.left,gate.left+plate,gate.bottom+plate,gate.top-plate);faceFt=plate;break;
   case 'gate-right':if(gate)profile=skirtRect(gate.right-plate,gate.right,gate.bottom+plate,gate.top-plate);faceFt=plate;break;
   case 'gate-header':if(gate&&opening)profile=skirtRect(opening.offset,opening.offset+opening.width,
     top-gate.infill,Math.min(top,top-gate.infill+plate));faceFt=plate;break;
   case 'upper-finish':if(gate)profile=skirtRect(s,e,top-gate.infill,top);break;
   case 'gate-finish':if(gate){
    const board=planSkirtingGateFace(gate.right-gate.left,gate.top-gate.bottom,
     options.orientation,options.faceIn,options.gapIn)[p.boardIndex??0];
    if(!board)break;faceFt=board.faceFt;
    if(options.orientation==='vertical'){
     const x=gate.left+board.stationFt;profile=skirtRect(x,x+board.faceFt,gate.bottom,gate.top);
     axis=[[x+board.faceFt/2,gate.bottom],[x+board.faceFt/2,gate.top]];
    }else{
     const y=gate.top-board.stationFt;profile=skirtRect(gate.left,gate.right,y-board.faceFt,y);
    }
   }break;
   case 'vertical-finish':
    profile=[[s,ground(s)+reveal],[e,ground(e)+reveal],[e,top],[s,top]];
    profile=clipSkirtProfile(profile,0,-1,top);faceFt=e-s;break;
   case 'horizontal-finish':{
    const y=top-(p.row??0)*pitch;
    profile=clipSkirtProfile(skirtRect(s,e,y-(p.faceFt??face),y),-gradeSlope,1,-grade0-reveal);
    break;
   }
  }
  if(['top-rail','bottom-rail','stud'].includes(p.role)&&profile.length){
   profile=clipSkirtProfile(clipSkirtProfile(profile,1,0,-(side.frameStartFt??0)),-1,0,side.frameEndFt??side.lengthFt);
   if(axis&&profile.length){
    const range=[Math.min(...profile.map(p=>p[0])),Math.max(...profile.map(p=>p[0]))];
    const [a,b]=axis;
    if(Math.abs(b[0]-a[0])>.00001)axis=range.map(s=>[s,a[1]+(b[1]-a[1])*(s-a[0])/(b[0]-a[0])]) as [SkirtProfilePoint,SkirtProfilePoint];
   }
  }
  const member=skirtMember(cut,profile,cut.material==='finish'?finishDepth:depth,faceFt,axis);
  if(member)result.push(member);
 }
 return result;
}
