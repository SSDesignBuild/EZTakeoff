/**
 * Product-envelope dimensions in inches, transcribed from seven S&S-supplied
 * Renaissance drawing packages (profile sheets).
 * No customer records, copyrighted drawing images or proprietary span matrices.
 * Nominal outside dimensions are render geometry, NOT an engineered BOM.
 */
export type RenaissanceFrameVariant='standard'|'hd'|'wide'|'wide-insert';
export interface RenaissanceExtrusionProfile {
  id:RenaissanceFrameVariant;
  postOutsideIn:number;postWallIn:number;
  headerHeightIn:number;headerDepthIn:number;headerWallIn:number;
  postCapOutsideIn:number;
  postInternalSleeveIn:number|null;
}
const SD:RenaissanceExtrusionProfile={
  id:'standard',postOutsideIn:3.875,postWallIn:.090,
  headerHeightIn:7,headerDepthIn:2.75,headerWallIn:.080,
  postCapOutsideIn:3.313,postInternalSleeveIn:null,
};
const HD:RenaissanceExtrusionProfile={
  id:'hd',postOutsideIn:3.875,postWallIn:.188,
  headerHeightIn:7,headerDepthIn:2.75,headerWallIn:.125,
  postCapOutsideIn:3.125,postInternalSleeveIn:3.125,
};
const WD:RenaissanceExtrusionProfile={
  id:'wide',postOutsideIn:6,postWallIn:.125,
  headerHeightIn:7,headerDepthIn:4.875,headerWallIn:.125,
  postCapOutsideIn:5.375,postInternalSleeveIn:5.375,
};
const WD_INSERT:RenaissanceExtrusionProfile={
  ...WD,id:'wide-insert',
};
export function getRenaissanceExtrusion(variant:RenaissanceFrameVariant|string|undefined):
  RenaissanceExtrusionProfile{
  if(variant==='hd')return HD;
  if(variant==='wide')return WD;
  if(variant==='wide-insert')return WD_INSERT;
  return SD;
}
export const inchToFoot=(inches:number)=>inches/12;
export const RENAISSANCE_SHADE_TUBE={
  outsideWidthIn:2,outsideHeightIn:2,wallIn:.040,clearGapIn:4,
} as const;
export const RENAISSANCE_TRUSS={
  outsideWidthIn:2,outsideHeightIn:6,wallIn:.060,spacingFt:2,
} as const;
export const RENAISSANCE_INSULATED_ROOF={
  defaultThicknessIn:3,standardPanelWidthIn:48,
} as const;
export const RENAISSANCE_STRUCTURAL_GUTTER={
  outsideWidthIn:5,outsideHeightIn:5,wallIn:.072,
} as const;
/** Representative estimating layout, never an approved beam-span capacity. */
export const SAMPLE_POST_BAY_FT:Record<RenaissanceFrameVariant,number>={
  standard:16,hd:14,wide:18,'wide-insert':18,
};
export interface RenaissancePlanInput {
  family:string;variant:RenaissanceFrameVariant;
  mount:'wall-attached'|'freestanding';
  roofStyle:'studio'|'gable';
  frameWidthFt:number;frameProjectionFt:number;
  deckHeightFt:number;postHeightFt:number;
  sideOverhangFt:number;frontOverhangFt:number;
  requestedFrontPosts:number;
}
export interface RenaissanceFramePlan {
  family:string;variant:RenaissanceFrameVariant;
  frameWidthFt:number;frameProjectionFt:number;
  roofWidthFt:number;roofProjectionFt:number;
  roofStartOffsetFt:number;
  sideOverhangFt:number;frontOverhangFt:number;rearOverhangFt:number;
  postHeightFt:number;deckHeightFt:number;
  backTopFt:number;frontTopFt:number;ridgeTopFt:number;
  pitchInPerFt:number;gable:boolean;
  attached:boolean;postCountPerRow:number;
  frontPostXsFt:number[];rearPostXsFt:number[];
  projectionTrussStationsFt:number[];
}
const finite=(n:number,fallback:number)=>Number.isFinite(n)?n:fallback;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
/**
 * Position exposed framing from *frame dimensions*, not deck footprint or roof
 * overhang. Freestanding Fresco example has an additional 1-ft REAR overhang.
 */
export function makeRenaissanceFramePlan(input:RenaissancePlanInput):RenaissanceFramePlan{
  const profile=getRenaissanceExtrusion(input.variant);
  const frameWidthFt=clamp(finite(input.frameWidthFt,12),1,100);
  const frameProjectionFt=clamp(finite(input.frameProjectionFt,10),1,80);
  const postHeightFt=clamp(finite(input.postHeightFt,9),4,20);
  const deckHeightFt=finite(input.deckHeightFt,0);
  const attached=input.mount!=='freestanding';
  const maxOverhang=input.family==='Solé'?5:1;
  const sideOverhangFt=clamp(finite(input.sideOverhangFt,1),0,maxOverhang);
  const frontOverhangFt=clamp(finite(input.frontOverhangFt,1),0,maxOverhang);
  const rearOverhangFt=attached?0:Math.min(maxOverhang,1);
  const roofWidthFt=frameWidthFt+sideOverhangFt*2;
  const roofProjectionFt=frameProjectionFt+rearOverhangFt+frontOverhangFt;
  const gable=input.roofStyle==='gable'&&
    ['Moderno','Contempo','Classico'].includes(input.family);
  const pitchInPerFt=input.family==='Aria'?0:gable?3.43:.5;
  // The supplied Moderno 14ft gable drawing has a 2ft ridge rise.
  const ridgeRiseFt=gable?(frameWidthFt/2)*pitchInPerFt/12:0;
  const backTopFt=deckHeightFt+postHeightFt;
  const frontTopFt=gable?backTopFt:backTopFt-(frameProjectionFt*pitchInPerFt/12);
  const ridgeTopFt=gable?backTopFt+ridgeRiseFt:backTopFt;
  const requested=Math.floor(finite(input.requestedFrontPosts,0));
  const automatic=Math.max(2,Math.ceil(frameWidthFt/SAMPLE_POST_BAY_FT[profile.id])+1);
  const postCountPerRow=requested>=2?clamp(requested,2,18):automatic;
  const postXs=Array.from({length:postCountPerRow},(_,i)=>
    frameWidthFt*(i/(postCountPerRow-1))-frameWidthFt/2);
  const trussCount=Math.max(2,Math.ceil(roofWidthFt/RENAISSANCE_TRUSS.spacingFt)+1);
  return {
    family:input.family,variant:profile.id,frameWidthFt,frameProjectionFt,
    roofWidthFt,roofProjectionFt,roofStartOffsetFt:-rearOverhangFt,
    sideOverhangFt,frontOverhangFt,rearOverhangFt,
    postHeightFt,deckHeightFt,backTopFt,frontTopFt,ridgeTopFt,
    pitchInPerFt,gable,attached,postCountPerRow,
    frontPostXsFt:postXs,rearPostXsFt:attached?[]:postXs,
    projectionTrussStationsFt:Array.from({length:trussCount},(_,i)=>
      -sideOverhangFt+roofWidthFt*i/(trussCount-1)),
  };
}
export const RENAISSANCE_ANONYMIZED_REFERENCE_CASES=[
  {id:'aria-hd',family:'Aria',variant:'hd',mount:'wall-attached',roofStyle:'studio',
    frameWidthFt:12,frameProjectionFt:14,postHeightFt:9,roofWidthFt:14,roofProjectionFt:15,frontPosts:2},
  {id:'contempo-sd',family:'Contempo',variant:'standard',mount:'wall-attached',roofStyle:'studio',
    frameWidthFt:8,frameProjectionFt:11,postHeightFt:9,roofWidthFt:10,roofProjectionFt:12,frontPosts:2},
  {id:'fresco-wd-free',family:'Fresco',variant:'wide',mount:'freestanding',roofStyle:'studio',
    frameWidthFt:12,frameProjectionFt:10,postHeightFt:9,roofWidthFt:14,roofProjectionFt:12,frontPosts:2},
  {id:'fresco-wd-attached',family:'Fresco',variant:'wide',mount:'wall-attached',roofStyle:'studio',
    frameWidthFt:18,frameProjectionFt:14,postHeightFt:10,roofWidthFt:20,roofProjectionFt:15,frontPosts:2},
  {id:'moderno-hd-gable',family:'Moderno',variant:'hd',mount:'wall-attached',roofStyle:'gable',
    frameWidthFt:14,frameProjectionFt:9,postHeightFt:9,roofWidthFt:16,roofProjectionFt:10,frontPosts:2},
  {id:'moderno-sd-studio',family:'Moderno',variant:'standard',mount:'wall-attached',roofStyle:'studio',
    frameWidthFt:18,frameProjectionFt:10,postHeightFt:9,roofWidthFt:20,roofProjectionFt:11,frontPosts:3},
  {id:'moderno-sd-dolce',family:'Moderno',variant:'standard',mount:'wall-attached',roofStyle:'studio',
    frameWidthFt:12,frameProjectionFt:10,postHeightFt:10,roofWidthFt:14,roofProjectionFt:11,frontPosts:2},
] as const;
