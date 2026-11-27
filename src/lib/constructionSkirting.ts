import type { ConstructionTier,ConstructionPart,ConstructionConnection,ConstructionPoint3 } from './constructionAssembly';
import type { DeckPoint } from './types';
import { buildDeckSkirting,type SkirtPlan } from './deckSkirting';
import { buildDeckStairSkirting } from './deckStairSkirting';
import { framingDepthFt } from './constructionFraming';
import { stairSkirtRoof } from './stairSkirtingPhysical';
import { skirtFinishThicknessFt,skirtMemberSupports,skirtMemberFasteners,type SkirtPhysicalMember } from './skirtingPhysicalLayout';

const source={module:'constructionSkirting.ts / skirtingPhysicalLayout.ts / stairSkirtingPhysical.ts',
 authority:'Shared physical profiles, stock cut identities and selected grade',notes:[
  'Skirting supports are dressed 1.5 x 3.5-in ground-contact 2x4s; connection capacity and site ground treatment require the selected approved detail.',
  'Synthetic finish thickness is a declared generic 1-in envelope until a specific skirting product is selected; KDAT 1x finish uses 3/4 in.',
 ]};
const partId=(tier:ConstructionTier,cutId:string)=>tier.id+'-'+(cutId.startsWith(tier.id)?cutId.slice(1):cutId);
const material=(plan:SkirtPlan,member:SkirtPhysicalMember)=>member.material==='2x4'?
 'Ground-contact pressure-treated 2x4':plan.options.material==='kdat'?'KDAT skirting finish':
 plan.options.material==='pvc'?'PVC skirting finish':'Composite skirting finish';
const bounds=(member:SkirtPhysicalMember)=>({
 s:Math.min(...member.profile.map(p=>p[0])),e:Math.max(...member.profile.map(p=>p[0])),
 bottom:Math.min(...member.profile.map(p=>p[1])),top:Math.max(...member.profile.map(p=>p[1])),
});
/** Installed board/support inventory consumed by CAD and the 3D renderer.
 * Purchasing bins never become extra installed geometry. */
export function buildConstructionSkirting(tier:ConstructionTier):{
 parts:ConstructionPart[];connections:ConstructionConnection[];issues:string[];notes:string[];
}{
 const {deck,values,heightFt}=tier,lower=tier.id==='L';
 const inputs={...values,deckHeight:heightFt,...(lower?{lowerDeckHeight:heightFt}:{})};
 const plans=[buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,heightFt,
  framingDepthFt(deck.joistSize)*12,inputs,lower?'lower':''),buildDeckStairSkirting(deck,inputs,lower)];
 const parts:ConstructionPart[]=[],connections:ConstructionConnection[]=[],issues:string[]=[],notes:string[]=[];
 const winding=deck.points.reduce((sum,p,i)=>{const q=deck.points[(i+1)%deck.points.length];return sum+p.x*q.y-q.x*p.y;},0)>=0?1:-1;
 for(const plan of plans){
  if(!plan.enabled)continue;issues.push(...plan.issues);notes.push(...plan.notes);
  for(const side of plan.sides){
   const members=side.physicalMembers??[];
   if(!members.length)continue;
   let point:(s:number,offset:number)=>DeckPoint;
   let finishBack=0;
   const sideId=side.kind==='stair'?'ST'+(side.edgeIndex-1000-(lower?200:0)+1):'E'+(side.edgeIndex+1);
   if(side.kind==='stair'){
    const index=side.edgeIndex-1000-(lower?200:0),flight=Math.floor(index/2),sign=index%2===0?-1:1;
    const placement=deck.stairPlacements[flight];
    const roof=placement?stairSkirtRoof(deck,placement,heightFt,inputs):null;if(!roof)continue;
    point=(s,offset)=>roof.stair.at(sign*(roof.stair.widthFt/2+offset),s);
    finishBack=-skirtFinishThicknessFt(plan.options);
   }else{
    const edge=deck.edgeSegments.find(e=>e.index===side.edgeIndex);if(!edge)continue;
    const ux=(edge.end.x-edge.start.x)/edge.length,uy=(edge.end.y-edge.start.y)/edge.length;
    const nx=uy*winding,ny=-ux*winding;
    point=(s,offset)=>({x:edge.start.x+ux*s+nx*offset,y:edge.start.y+uy*s+ny*offset});
   }
   const records:{part:ConstructionPart;member:SkirtPhysicalMember;offset:number}[]=[];
   for(const member of members){
    const box=bounds(member),offset=finishBack+(member.material==='finish'?member.depthFt/2:-member.depthFt/2);
    const at=(s:number,z:number,off=offset):ConstructionPoint3=>({...point(s,off),z});
    const id=partId(tier,member.cutId);
    const gate=member.gateIndex!==undefined&&member.role.startsWith('gate-')&&member.role!=='gate-header';
    const part:ConstructionPart={id,tierId:tier.id,kind:member.material==='finish'?'skirt-board':'skirt-support',
     assemblyId:tier.id+'-SK-'+sideId+(gate?'-G'+(member.gateIndex!+1):''),label:id,
     material:material(plan,member),nominalSize:member.material==='2x4'?'2x4':
      plan.options.material==='kdat'?'1x5 skirting':'Selected skirting finish',
     dressed:member.material==='2x4'?{widthIn:3.5,depthIn:1.5}:
      {widthIn:member.faceFt*12,depthIn:member.depthFt*12},
     footprint:[point(box.s,offset-member.depthFt/2),point(box.e,offset-member.depthFt/2),
      point(box.e,offset+member.depthFt/2),point(box.s,offset+member.depthFt/2)],
     axis:{from:at(...member.axis[0]),to:at(...member.axis[1])},zBottom:box.bottom,zTop:box.top,
     cutLengthFt:member.cutLengthFt,quantity:1,stockReference:member.cutId,
     source:{...source,notes:[...source.notes,`${side.label??'Perimeter side '+(side.edgeIndex+1)}: ${member.role}; ${plan.options.finishColor}.`]},
     geometryStatus:side.frameCornerNeedsReview&&member.material==='2x4'?'representative':'derived',purchaseRole:'cut-part',
     profile:member.profile.map(([stationFt,elevationFt])=>({stationFt,elevationFt})),
     vertices:[-1,1].flatMap(sign=>member.profile.map(([s,z])=>at(s,z,offset+sign*member.depthFt/2))),
    };
    parts.push(part);records.push({part,member,offset});
   }
   for(const r of records){
    const finish=r.member.material==='finish';
    const supportIds=new Set(skirtMemberSupports(r.member,members).map(m=>m.cutId));
    const supports=records.filter(f=>supportIds.has(f.member.cutId));
    const quantity=skirtMemberFasteners(r.member,members,plan.options.orientation);
    if(!quantity)continue;
    const a=r.part.axis.from,bp=r.part.axis.to;
    connections.push({id:r.part.id+'-FIX',tierId:tier.id,kind:finish?'skirt-finish-attachment':'skirt-frame-attachment',
     partIds:[r.part.id,...supports.map(s=>s.part.id)],point:{x:(a.x+bp.x)/2,y:(a.y+bp.y)/2,z:(a.z+bp.z)/2},
     hardware:[{name:finish?(plan.options.material==='kdat'?'Exterior 2-in finish nail':'Selected synthetic-skirt screw'):
       'Exterior 3-in structural framing screw',quantity,unit:'ea'}],
     holePattern:null,geometryStatus:'placement-only',source:{...source,notes:[
      'Anchor identifies the member attachment allowance. It is not a drill-hole or manufacturer fastener pattern.',
      'Finish uses two attachments per supporting stud/rail; frame allowance retains two screws per planned connection.']}});
   }
   for(const [index,opening]of side.openings.entries()){
    if(opening.kind!=='hinged-gate')continue;
    const gate=records.filter(r=>r.member.gateIndex===index&&r.member.role.startsWith('gate-')&&r.member.role!=='gate-header');
    if(!gate.length)continue;
    const bottom=Math.min(...gate.map(r=>r.part.zBottom)),top=Math.max(...gate.map(r=>r.part.zTop)),h=top-bottom;
    connections.push({id:`${tier.id}-SK-${sideId}-G${index+1}-HARDWARE`,tierId:tier.id,kind:'skirting-access-gate',
     partIds:gate.map(r=>r.part.id),point:{...point(opening.offset,finishBack),z:(top+bottom)/2},
     hardware:[{name:'Skirting access gate exterior hinge',quantity:h>4?3:2,unit:'ea'},
      {name:'Skirting access gate latch',quantity:1,unit:'ea'},...(h>4?[{name:'Skirting access gate cane bolt',quantity:1,unit:'ea'}]:[])],
     holePattern:null,geometryStatus:'placement-only',source:{...source,notes:[
      'Hinge/latch count follows the selected gate height. Product hole spacing and anchorage are field/manufacturer details.']}});
   }
  }
 }
 return {parts,connections,issues:[...new Set(issues)],notes:[...new Set(notes)]};
}
