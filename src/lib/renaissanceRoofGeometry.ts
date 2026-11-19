/**
 * Renaissance sales-visual roof modules. A 48-in panel is a representative
 * standard insulated roof module from the supplied drawing details.
 * Any short final panel is trimmed; supplier stock/cut quantities and
 * structural approvals remain in the engineering/takeoff system.
 *
 * There is no fictitious physical space between interlocking panels.
 * Visible closure-cover seams are cosmetic geometry in the 3D component.
 */
export interface RoofPanelModule {
  startFt:number; endFt:number; centerFt:number; widthFt:number;
}
export interface RoofPanelLayout {
  spanFt:number;
  modules:RoofPanelModule[];
  seamsFt:number[];
}
export function planInsulatedRoofPanels(
  spanFt:number,standardPanelWidthIn=48,
):RoofPanelLayout {
  const invalid={spanFt:0,modules:[],seamsFt:[]};
  const panelWidthFt=standardPanelWidthIn/12;
  if(!Number.isFinite(spanFt)||spanFt<=0||spanFt>120||
    !Number.isFinite(panelWidthFt)||panelWidthFt<=0)return invalid;
  const count=Math.ceil(spanFt/panelWidthFt-1e-9);
  let position=0;
  const modules:RoofPanelModule[]=[];
  for(let i=0;i<count;i++){
    const width=i===count-1?spanFt-position:Math.min(panelWidthFt,spanFt-position);
    if(width<=0)break;
    modules.push({startFt:position,endFt:position+width,
      centerFt:position+width/2,widthFt:width});
    position+=width;
  }
  return {spanFt,modules,seamsFt:modules.slice(0,-1).map(panel=>panel.endFt)};
}

/**
 * A purely visual Dolce screen infill at a Renaissance gable end.
 * The front structural header is horizontal. The translucent upper infill
 * begins ABOVE the top of that header and terminates just below the
 * gable panel undersides. It is NOT an engineered screen infill design.
 */
export interface GableScreenInfill {
  frameWidthFt:number;
  sideRiseFt:number;
  peakRiseFt:number;
  contour:Array<{alongFt:number;riseFt:number}>;
}
export function planDolceGableInfill(input:{
  frameWidthFt:number;
  roofWidthFt:number;
  ridgeRiseFt:number;
  roofPanelThicknessFt:number;
}):GableScreenInfill|null{
  const {frameWidthFt,roofWidthFt,ridgeRiseFt,roofPanelThicknessFt}=input;
  if([frameWidthFt,roofWidthFt,ridgeRiseFt,roofPanelThicknessFt].some(v=>!Number.isFinite(v))||
    frameWidthFt<=0||roofWidthFt<frameWidthFt||ridgeRiseFt<=0||roofPanelThicknessFt<=0)return null;
  const sideRiseFt=Math.max(0,
    ridgeRiseFt*(1-frameWidthFt/roofWidthFt)-roofPanelThicknessFt/2);
  const peakRiseFt=Math.max(0,ridgeRiseFt-roofPanelThicknessFt/2);
  if(peakRiseFt<=sideRiseFt+.01)return null;
  return {frameWidthFt,sideRiseFt,peakRiseFt,contour:[
    {alongFt:0,riseFt:0},
    {alongFt:frameWidthFt,riseFt:0},
    {alongFt:frameWidthFt,riseFt:sideRiseFt},
    {alongFt:frameWidthFt/2,riseFt:peakRiseFt},
    {alongFt:0,riseFt:sideRiseFt},
  ]};
}
