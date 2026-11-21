import type { DeckRailCoverage } from './types';
export interface StairsOrGateOpening {edgeIndex:number;startFt:number;endFt:number;gate?:boolean}
export function subtractRailingOpenings(runs:DeckRailCoverage[],openings:StairsOrGateOpening[],
  clearanceFt=0):DeckRailCoverage[]{
 const out:DeckRailCoverage[]=[];
 for(const run of runs){
  let ranges:Array<[number,number]>=[[run.start,run.end]];
  for(const o of openings.filter(o=>o.edgeIndex===run.edgeIndex)){
   if(!Number.isFinite(o.startFt)||!Number.isFinite(o.endFt))continue;
   const begin=o.startFt-clearanceFt/2,end=o.endFt+clearanceFt/2;
   const next:Array<[number,number]>=[];
   for(const [a,b] of ranges){
    if(b<=begin||a>=end){next.push([a,b]);continue;}
    if(begin-a>.04)next.push([a,begin]);
    if(b-end>.04)next.push([end,b]);
   }
   ranges=next;
  }
  out.push(...ranges.filter(([a,b])=>b-a>.04).map(([start,end])=>({
   edgeIndex:run.edgeIndex,start,end,kind:run.kind,
  })));
 }
 return out;
}
