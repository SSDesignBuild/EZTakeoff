/**
 * PCA Products 3068 = 3'0" x 6'8" opening. Configurable concept door,
 * not a certified screen room egress/accessibility specification.
 * A-100 (Canoe Creek) is the default. PCA's Magnador openings are 6x8,
 * 11x13 and 13x20 inches; large is limited to A-100 in this catalog.
 */
export type PcaDoorModel='A-100'|'A-500';
export type PcaPetDoor='none'|'small'|'medium'|'large';
export type ScreenDoorWall='front'|'left'|'right'|'rear';
export interface DoorInterval {startFt:number;endFt:number;centerFt:number;widthFt:number;}
export const PCA_3068={widthFt:3,heightFt:80/12} as const;
export const PCA_PET_OPENINGS={
  small:{widthIn:6,heightIn:8},
  medium:{widthIn:11,heightIn:13},
  large:{widthIn:13,heightIn:20},
} as const;
/**
 * PCA documentation:
 * - 8in is the standard kick plate on a door WITHOUT a pet insert.
 * - Magnador small outer frame 7 7/8 x 10 1/2in,
 *   medium 13 x 15 5/8in, large 16 7/8 x 23 3/4in.
 * A pet door cuts the kick panel, so pick the next PCA-offered panel height
 * taller than the ENTIRE pet frame, not just its opening. The 24in kick panel
 * is the only offered height which surrounds medium and large inserts.
 * Source: pcaproducts.com/screen-door/accessories-hardware/{pet-door-options,heavy-aluminum-kick-plates}
 */
export const PCA_PET_FRAME={
  small:{cutWidthIn:6+5/8,cutHeightIn:9+5/16,outerWidthIn:7+7/8,outerHeightIn:10.5},
  medium:{cutWidthIn:11+7/16,cutHeightIn:14,outerWidthIn:13,outerHeightIn:15+5/8},
  large:{cutWidthIn:14.5,cutHeightIn:22+7/16,outerWidthIn:16+7/8,outerHeightIn:23.75},
} as const;
export const PCA_KICK_HEIGHT_OPTIONS=[0,8,12,14,24] as const;
export function effectivePcaKickPlateIn(pet:PcaPetDoor,selectedIn=8):number{
  if(pet==='none'){
    return PCA_KICK_HEIGHT_OPTIONS.includes(selectedIn as typeof PCA_KICK_HEIGHT_OPTIONS[number])
      ? selectedIn:8;
  }
  const outside=PCA_PET_FRAME[pet].outerHeightIn;
  // No zero-height option may be selected with a pet insert.
  return PCA_KICK_HEIGHT_OPTIONS.find(height=>height>outside+0.125)??24;
}
export function pcaKickPlateSupportsPet(pet:PcaPetDoor,heightIn:number):boolean{
  return pet==='none'||heightIn>PCA_PET_FRAME[pet].outerHeightIn;
}
export function pcaPetCompatibility(model:PcaDoorModel,pet:PcaPetDoor):boolean {
  return pet==='none'||pet==='small'||model==='A-100';
}
export function planPcaDoorOnWall(lengthFt:number,positionPercent:number,
  doorWidthFt=PCA_3068.widthFt):DoorInterval|null{
  if(!Number.isFinite(lengthFt)||!Number.isFinite(positionPercent)||
    !Number.isFinite(doorWidthFt)||doorWidthFt<=0||lengthFt<doorWidthFt+.35)return null;
  const pct=Math.max(0,Math.min(100,positionPercent))/100;
  const center=Math.max(doorWidthFt/2+.12,
    Math.min(lengthFt-doorWidthFt/2-.12,lengthFt*pct));
  return {startFt:center-doorWidthFt/2,endFt:center+doorWidthFt/2,
    centerFt:center,widthFt:doorWidthFt};
}
