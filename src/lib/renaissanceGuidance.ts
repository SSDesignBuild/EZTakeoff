/**
 * Envelope notes only, from the user's 21-page Florida Engineering Renaissance
 * reference, explicitly marked ESTIMATING ONLY. Full proprietary span/footing
 * tabulations are NOT stored or redistributed. Site-specific PE approval required.
 */
export const RENAISSANCE_REFERENCE_MAX_OVERHANG_FT=1;
export const RENAISSANCE_REFERENCE_MAX_POST_HEIGHT_FT=15;
export const RENAISSANCE_REFERENCE_MIN_ROOF_SLOPE_IN_PER_FT=.25;
const coveredFamilies=new Set(['Moderno','Contempo','Classico','Fresco','Aria']);
export const hasRenaissanceReferenceChart=(family:string):boolean=>coveredFamilies.has(family);
export const maxReferenceOverhangFt=(family:string):number=>hasRenaissanceReferenceChart(family)?1:5;
export function renaissanceReferenceIssues(input:{
  family:string;sideOverhangFt:number;frontOverhangFt:number;postHeightFt:number;
}):string[]{
  if(!hasRenaissanceReferenceChart(input.family))return [];
  const issues:string[]=[];
  for(const [label,value] of [['side',input.sideOverhangFt],['front',input.frontOverhangFt]] as const){
    if(!Number.isFinite(value)||value<0||value>1+1e-8)
      issues.push('Renaissance '+input.family+' '+label+' roof overhang exceeds the 0-to-1-ft estimating-reference envelope.');
  }
  if(!Number.isFinite(input.postHeightFt)||input.postHeightFt>15)
    issues.push('Renaissance '+input.family+' post height exceeds the 15-ft estimating-reference limit; engineer to verify actual height and footing.');
  return issues;
}
