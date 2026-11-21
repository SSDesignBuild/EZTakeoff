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
