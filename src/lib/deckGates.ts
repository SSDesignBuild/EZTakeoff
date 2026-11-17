import type { MaterialItem } from './types';

export interface DeckGate {
  id: string;
  label: string;
  heightFt: number;
  widthFt: number;
}
export interface GateHardwarePlan {
  gates: DeckGate[];
  hinges: number;
  slideBolts: number;
  caneBolts: number;
  materials: MaterialItem[];
  issues: string[];
  notes: string[];
}
export function parseDeckGates(raw: unknown): DeckGate[] {
  if(typeof raw!=='string' || !raw.trim())return [];
  try {
    const parsed: unknown=JSON.parse(raw);
    if(!Array.isArray(parsed))return [];
    return parsed.filter((value): value is Record<string,unknown>=>!!value && typeof value==='object')
      .map((g,i)=>({
        id:String(g.id??('gate-'+(i+1))),
        label:String(g.label??('Gate '+(i+1))),
        heightFt:Number(g.heightFt??4),
        widthFt:Number(g.widthFt??3),
      }));
  }catch{return [];}
}
export function planDeckGateHardware(raw: unknown): GateHardwarePlan {
  const gates=parseDeckGates(raw);
  const issues:string[]=[],notes:string[]=[];
  const ids=new Set<string>();
  gates.forEach((gate,index)=>{
    if(ids.has(gate.id))issues.push('Gate '+(index+1)+': duplicate identifier.');
    ids.add(gate.id);
    if(!Number.isFinite(gate.heightFt)||gate.heightFt<=0||gate.heightFt>12)
      issues.push('Gate '+(index+1)+': specify a valid height in feet.');
    if(!Number.isFinite(gate.widthFt)||gate.widthFt<=0||gate.widthFt>12)
      issues.push('Gate '+(index+1)+': specify a valid width in feet.');
  });
  const safe=gates.filter((g)=>Number.isFinite(g.heightFt)&&g.heightFt>0&&g.heightFt<=12&&Number.isFinite(g.widthFt)&&g.widthFt>0&&g.widthFt<=12);
  const tall=safe.filter((gate)=>gate.heightFt>4);
  const regular=safe.filter((gate)=>gate.heightFt<=4);
  const hinges=regular.length*2+tall.length*3;
  const slideBolts=safe.length;
  const caneBolts=tall.length;
  const category='Deck gate hardware';
  const materials:MaterialItem[]=[];
  if(hinges) materials.push({
    name:'Exterior self-closing gate hinge',category,quantity:hinges,unit:'ea',
    stockRecommendation:'Exterior self-closing gate hinge rated for gate weight',
    notes:'2 hinges for gates 4 ft high or shorter; 3 hinges when height exceeds 4 ft. '+safe.map((g)=>g.label+': '+(g.heightFt>4?'3':'2')).join(' · '),
  });
  if(slideBolts) materials.push({
    name:'Exterior slide bolt for gate',category,quantity:slideBolts,unit:'ea',
    stockRecommendation:'Exterior-duty slide bolt matching gate/latch design',
    notes:'1 slide bolt per gate. '+safe.map((g)=>g.label).join(', '),
  });
  if(caneBolts) materials.push({
    name:'Exterior cane bolt for gate over 4 ft',category,quantity:caneBolts,unit:'ea',
    stockRecommendation:'Exterior-duty cane bolt with compatible ground/receiver socket',
    notes:'1 cane bolt for each gate taller than 4 ft. '+tall.map((g)=>g.label).join(', '),
  });
  if(safe.length)notes.push('Gate hardware covers hinges, slide bolts and cane bolts. Confirm gate frame, size, hinge load capacity, attachment, clearance, safety requirements and any interruption to adjacent railing panels before ordering.');
  return {gates,hinges,slideBolts,caneBolts,materials,issues,notes};
}
