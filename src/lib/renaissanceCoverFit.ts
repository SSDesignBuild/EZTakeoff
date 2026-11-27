/** Renderer fit to the real outside header face, in scene feet. No minimum
 * ornamental projection may invent a tail past the configured roof edge. */
export function planRenaissanceTrussEndFit(input:{roofFrontZFt:number;headerCenterZFt:number;headerDepthFt:number}){
  const outsideHeaderZFt=input.headerCenterZFt+Math.max(0,input.headerDepthFt)/2;
  const rawExposureFt=input.roofFrontZFt-outsideHeaderZFt;
  const hasExposedTail=Number.isFinite(rawExposureFt)&&rawExposureFt>1e-6;
  const availableTailFt=hasExposedTail?rawExposureFt:0;
  // Decorative-only Contempo tails remain in contact with the header face.
  const decorativeStartZFt=outsideHeaderZFt-.015;
  return {outsideHeaderZFt,hasExposedTail,availableTailFt,decorativeStartZFt,
    decorativeLengthFt:hasExposedTail?input.roofFrontZFt-decorativeStartZFt:0};
}

/** Some supplied cap inserts are narrower than the post outside envelope. */
export function renaissancePostRoofFootprintFt(postOutsideIn:number,postCapOutsideIn:number){
  return Math.max(postOutsideIn,postCapOutsideIn)/12;
}
