import type { DeckModel,StairPlacement } from './deckModel';
import type { DeckPoint } from './types';
import { stairFlightFrame } from './stairRailVisualGeometry';
import { planStairStringerFaceStations } from './stairFasciaGeometry';
import { resolveBoardDimensions,resolveFasciaDimensions } from './deckProductDimensions';
import { resolveFasciaMaterial } from './deckTrimSelection';
import { DECK_GAP_FT } from './deckBoardDimensions';

export interface StairProfilePoint {stationFt:number;elevationFt:number;}
export interface StairPhysicalGeometry {
  widthFt:number;runFt:number;riseFt:number;treadDepthFt:number;treads:number;
  treadFaceFt:number;treadThicknessFt:number;nosingFt:number;
  treadMaterial:string;riserMaterial:string;
  riserIsFascia:boolean;
  coverageNotes:string[];
  stringerThicknessFt:number;stringerDepthFt:number;stringerStations:number[];
  stringerCutLengthFt:number;
  stringerProfile:StairProfilePoint[];
  at:(crossFt:number,stationFt:number)=>DeckPoint;
  treadBoards:{step:number;board:number;startFt:number;endFt:number;topFt:number;bottomFt:number}[];
  risers:{step:number;board:number;stationFt:number;bottomFt:number;topFt:number;thicknessFt:number}[];
}
/** Long-point blank length measured along the slope of real stock, including
 * the plumb end projection. A run/hypotenuse alone omits that end material. */
export function stairProfileCutLengthFt(profile:readonly StairProfilePoint[],risePerRun:number):number{
  if(!profile.length)return 0;const norm=Math.sqrt(1+risePerRun*risePerRun);
  const stations=profile.map(p=>(p.stationFt-risePerRun*p.elevationFt)/norm);
  return Math.max(...stations)-Math.min(...stations);
}
/** Finished deck/tread tops are the measured elevations. Joist/stringer seats
 * touch the selected board underside; material thickness never changes rise. */
export function planConstructionStair(model:DeckModel,placement:StairPlacement,heightFt:number,
 values:Record<string,string|number|boolean>):StairPhysicalGeometry|null{
  const frame=stairFlightFrame(model,placement,[0,0]);
  if(!frame||model.stairTreadsPerRun<1||heightFt<=0)return null;
  const treads=model.stairTreadsPerRun,runFt=model.stairRunFt,treadDepthFt=runFt/treads,riseFt=heightFt/model.stairRisers;
  const same=!values.stairTreadStyle||values.stairTreadStyle==='match';
  const material=same?values.deckingMaterial:values.stairTreadStyle;
  const dimensions=resolveBoardDimensions(material,{faceIn:Number(values.stairTreadFaceIn??(same?values.deckBoardFaceIn:undefined)),
    thicknessIn:Number(values.stairTreadThicknessIn??(same?values.deckBoardThicknessIn:undefined))});
  const treadFaceFt=dimensions.faceIn/12,treadThicknessFt=dimensions.thicknessIn/12;
  const riserStyle=String(values.stairRiserStyle??'auto');
  const fasciaRisers=riserStyle==='fascia'||(riserStyle==='auto'&&values.deckingType!=='pressure-treated');
  const riserMaterial=fasciaRisers?resolveFasciaMaterial(values):String(['auto','match'].includes(riserStyle)?values.deckingMaterial:riserStyle);
  const riserDimensions=fasciaRisers?resolveFasciaDimensions(riserMaterial,{},'riser'):resolveBoardDimensions(riserMaterial,{faceIn:Number(values.stairRiserFaceIn),thicknessIn:Number(values.stairRiserThicknessIn)});
  const riserThicknessFt=(Number(values.stairRiserThicknessIn)>0?Number(values.stairRiserThicknessIn):riserDimensions.thicknessIn)/12;
  const closed=riserStyle!=='open',requestedNosingFt=(fasciaRisers?.5:1)/12;
  const boardCount=closed?Math.max(2,Math.ceil((treadDepthFt-riserThicknessFt+DECK_GAP_FT)/(treadFaceFt+DECK_GAP_FT)-1e-9)):2;
  const fullPackFt=boardCount*treadFaceFt+(boardCount-1)*DECK_GAP_FT;
  const nosingFt=closed?Math.max(0,Math.min(requestedNosingFt,fullPackFt+riserThicknessFt-treadDepthFt)):requestedNosingFt;
  const stringerThicknessFt=1.5/12,stringerDepthFt=11.25/12,coverageNotes:string[]=[];
  if(nosingFt<requestedNosingFt-1e-8)coverageNotes.push(`Actual ${dimensions.faceIn}-in tread faces set ${Number((nosingFt*12).toFixed(3))}-in nosing to meet the actual riser face without an uncounted filler strip. Confirm selected product/required nosing before fabrication.`);
  const at=(crossFt:number,stationFt:number):DeckPoint=>({
    x:frame.originX+Math.cos(frame.yaw)*crossFt+frame.outwardX*stationFt,
    y:frame.originZ-Math.sin(frame.yaw)*crossFt+frame.outwardZ*stationFt});
  const stringerProfile:StairProfilePoint[]=[{stationFt:0,elevationFt:heightFt-riseFt-treadThicknessFt}];
  for(let i=0;i<treads;i++){
    const elevationFt=heightFt-(i+1)*riseFt-treadThicknessFt;
    stringerProfile.push({stationFt:(i+1)*treadDepthFt,elevationFt});
    if(i<treads-1)stringerProfile.push({stationFt:(i+1)*treadDepthFt,elevationFt:elevationFt-riseFt});
  }
  // Lower edge is the uncut edge of actual dressed 2x12 stock. Clip its toe
  // at grade; exact bearing/notch connection design is recorded separately.
  const slope=riseFt/treadDepthFt,lower0=heightFt-treadThicknessFt-stringerDepthFt*Math.sqrt(1+slope*slope);
  const toe=Math.max(0,Math.min(runFt,lower0/slope));
  stringerProfile.push({stationFt:runFt,elevationFt:Math.max(0,lower0-slope*runFt)});
  if(toe>0&&toe<runFt)stringerProfile.push({stationFt:toe,elevationFt:0});
  stringerProfile.push({stationFt:0,elevationFt:Math.max(0,lower0)});
  const treadBoards=Array.from({length:treads},(_,step)=>Array.from({length:boardCount},(_,board)=>{
    const endFt=(step+1)*treadDepthFt+nosingFt-board*(treadFaceFt+DECK_GAP_FT),topFt=heightFt-(step+1)*riseFt;
    const rearFace=step*treadDepthFt+riserThicknessFt;
    return {step,board,startFt:closed?Math.max(endFt-treadFaceFt,rearFace):endFt-treadFaceFt,endFt,topFt,bottomFt:topFt-treadThicknessFt};
  }).filter(board=>board.endFt-board.startFt>1e-7)).flat();
  const risers=riserStyle==='open'?[]:Array.from({length:model.stairRisers},(_,step)=>{
    const bottom=heightFt-(step+1)*riseFt,top=heightFt-step*riseFt-(step===0?model.deckBoardThicknessFt:treadThicknessFt);
    const faceFt=riserDimensions.faceIn/12,pieces:StairPhysicalGeometry['risers']=[];
    for(let start=bottom,board=0;start<top-1e-8;start+=faceFt+(fasciaRisers?0:DECK_GAP_FT),board++){
      pieces.push({step,board,stationFt:step*treadDepthFt,bottomFt:start,topFt:Math.min(top,start+faceFt),thicknessFt:riserThicknessFt});
    }
    return pieces;
  }).flat();
  return {widthFt:frame.widthFt,runFt,riseFt,treadDepthFt,treads,treadFaceFt,treadThicknessFt,nosingFt,coverageNotes,treadMaterial:String(material),riserMaterial,riserIsFascia:fasciaRisers,
    stringerThicknessFt,stringerDepthFt,stringerStations:planStairStringerFaceStations(frame.widthFt,Math.max(2,Math.ceil(frame.widthFt)+1)),
    stringerProfile,stringerCutLengthFt:stairProfileCutLengthFt(stringerProfile,slope),at,treadBoards,risers};
}
