import { SERVICES } from '../data/services';
import { deckVisualProducts, coverVisualProducts, type CoverColor, type CoverFamily, type CoverRoofColor, type CoverCeilingFinish } from '../data/visualCatalog';
import type { PcaDoorModel,PcaPetDoor,ScreenDoorWall } from './pcaScreenDoorGeometry';
import type { EliteSunroomSettings } from './eliteSunroomStudio';

export type ProjectKind = 'deck' | 'covered-deck';
export type { CoverFamily, CoverColor, CoverRoofColor, CoverCeilingFinish } from '../data/visualCatalog';
export interface ConsultationClient {
  name: string; address: string; phone: string; email: string;
}
export interface PhotoCalibration {
  scale: number; offsetX: number; offsetY: number; rotationDeg: number;
}
export interface ConsultationProject {
  schemaVersion: 1;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  kind: ProjectKind;
  client: ConsultationClient;
  values: Record<string,string|number|boolean>;
  coverFamily: CoverFamily;
  coverColor: CoverColor; // Legacy field, retained as the aluminum FRAME finish.
  coverScreenColor?: 'match' | CoverColor;
  coverRoofColor?: CoverRoofColor;
  coverCeilingFinish?: CoverCeilingFinish;
  coverRoofStyle?: 'studio'|'gable';
  coverShadePercent?: number;
  coverLouverAngle?: number;
  coverFraming?: 'standard'|'hd'|'wide'|'wide-insert';
  coverMount?: 'wall-attached'|'freestanding';
  coverScreenStyle?: 'none'|'dolce-open-view'|'dolce-standard'|'lumino-sunroom'|'elite-add-a-room';
  /** Sales Elite Add-A-Room: same Admin inputs, per-Renaissance-wall section JSON. */
  eliteSunroom?:EliteSunroomSettings;
  coverAccentEnd?: 'straight'|'curved'; // Truss/tail end finish on Fresco, Classico, Aria and Contempo.
  coverTrussMount?: 'flush'|'raised'; // Fresco/Aria manufacturer connection, not cover-to-house mount.
  coverScreenUprights?: Partial<Record<ScreenDoorWall,number>>; // Interior upright count per wall, excluding corner posts and doors.
  coverScreenRailTreatment?: 'integrated-kick'|'integrated-picket'|'inside'|'outside'|'screens-only';
  /** 2026 Renaissance privacy wall tube clear gap; 0 disables the chosen side. */
  coverPrivacyWallGaps?: Partial<Record<ScreenDoorWall,0|2|4|6>>;
  coverDoorEnabled?:boolean;
  coverDoorSide?:ScreenDoorWall;
  coverDoorPositionPercent?:number;
  coverDoorModel?:PcaDoorModel;
  coverDoorFinish?:'match'|'White'|'Bronze'|'Black'|'Sandstone'|'Clay';
  coverDoorHinge?:'left'|'right';
  coverDoorSwing?:'in'|'out';
  coverDoorPet?:PcaPetDoor;
  coverDoorKickPlateIn?:number;
  coverPostCount?: number;
  coverWidthFt?: number;
  coverProjectionFt?: number;
  coverHeightFt?: number;
  coverSideOverhangFt?: number;
  coverFrontOverhangFt?: number;
  photoPresent: boolean;
  calibration: PhotoCalibration;
  estimatingResponse: EstimateResponse | null;
}
export interface EstimateTier {
  id: string; name: string; price: number; currency: 'USD';
  scope: string; includedOptions: string[];
}
export interface EstimateResponse {
  schemaVersion: 1;
  projectId: string;
  requestRevision: number;
  externalEstimateId: string;
  quotedAt: string;
  tiers: EstimateTier[];
  selectedTierId: string | null;
}
const deckDefaults=SERVICES.find((s)=>s.slug==='decks')!.defaults;
const KEY='sns-consultation-projects-v1';
const iso=()=>new Date().toISOString();
export const makeConsultationProject = (id: string): ConsultationProject => ({
  schemaVersion:1,id,revision:1,createdAt:iso(),updatedAt:iso(),title:'New outdoor living consultation',
  kind:'deck',client:{name:'',address:'',phone:'',email:''},
  values:{...deckDefaults,
    deckingMaterial:'TimberTech Vintage - Coastline',
    pictureFrameMaterial:'match',pictureFrameMaterial2:'match',pictureFrameMaterial3:'match',
    borderSameBoard:true,stairFasciaStyle:'profiled',
    breakerBoardMaterial:'match',breakerBoardMaterial2:'match',breakerBoardMaterial3:'match',
    fasciaMaterial:'match',stairFasciaMaterial:'match-fascia',fasciaHouseSide:true,
    deckingType:'composite',
    railingVisualId:'tt-ire-modern',
    railingType:'aluminum',railingSystem:'timbertech-ire',
    railingTopProfile:'modern',railingColor:'black',railingInfill:'aluminum'},
  coverFamily:'none',coverColor:'White',coverScreenColor:'match',coverRoofColor:'White',coverCeilingFinish:'White',coverRoofStyle:'studio',coverShadePercent:65,coverLouverAngle:12,
  coverFraming:'standard',coverMount:'wall-attached',coverScreenStyle:'none',
  coverAccentEnd:'straight',coverTrussMount:'flush',coverScreenUprights:{front:2,left:1,right:1,rear:2},
  coverScreenRailTreatment:'integrated-kick',coverPrivacyWallGaps:{front:0,left:0,right:0,rear:0},coverDoorEnabled:true,
  coverDoorSide:'front',coverDoorPositionPercent:50,coverDoorModel:'A-100',
  coverDoorFinish:'match',coverDoorHinge:'left',coverDoorSwing:'out',coverDoorPet:'none',
  coverDoorKickPlateIn:8,coverPostCount:0,
  coverWidthFt:0,coverProjectionFt:0,coverHeightFt:9,coverSideOverhangFt:1,coverFrontOverhangFt:1,
  photoPresent:false,
  calibration:{scale:1,offsetX:0,offsetY:0,rotationDeg:0},
  estimatingResponse:null,
});
const valid=(p:unknown):p is ConsultationProject=>
  !!p && typeof p==='object' && (p as ConsultationProject).schemaVersion===1 &&
  typeof (p as ConsultationProject).id==='string' && typeof (p as ConsultationProject).values==='object';
export const loadConsultations = (): ConsultationProject[] => {
  try {
    const stored=JSON.parse(window.localStorage.getItem(KEY)??'[]') as unknown;
    if(!Array.isArray(stored))return [];
    return stored.filter(valid).map((p)=>({
      ...p,coverScreenColor:p.coverScreenColor??'match',coverRoofColor:p.coverRoofColor??'White',coverCeilingFinish:p.coverCeilingFinish??'White',
      coverRoofStyle:p.coverRoofStyle??'studio',coverShadePercent:p.coverShadePercent??65,
      coverLouverAngle:p.coverLouverAngle??12,
      coverFraming:p.coverFraming??'standard',coverMount:p.coverMount??'wall-attached',
      coverScreenStyle:p.coverScreenStyle==='lumino-sunroom'?'none':(p.coverScreenStyle??'none'),
      coverAccentEnd:p.coverAccentEnd??(['Contempo','Classico'].includes(p.coverFamily)?'curved':'straight'),
      coverTrussMount:p.coverTrussMount??'flush',
      coverScreenUprights:{front:2,left:1,right:1,rear:2,...p.coverScreenUprights},
      coverScreenRailTreatment:p.coverScreenRailTreatment??'integrated-kick',
      coverPrivacyWallGaps:{front:0,left:0,right:0,rear:0,...p.coverPrivacyWallGaps},
      coverDoorEnabled:p.coverDoorEnabled??((p.coverScreenStyle??'none')!=='none'),
      coverDoorSide:p.coverDoorSide??'front',
      coverDoorPositionPercent:p.coverDoorPositionPercent??50,
      coverDoorModel:p.coverDoorModel??'A-100',
      coverDoorFinish:p.coverDoorFinish??'match',
      coverDoorHinge:p.coverDoorHinge??'left',
      coverDoorSwing:p.coverDoorSwing??'out',
      coverDoorPet:p.coverDoorPet??'none',
      coverDoorKickPlateIn:p.coverDoorKickPlateIn??8,coverPostCount:p.coverPostCount??0,
      coverWidthFt:p.coverWidthFt??0,coverProjectionFt:p.coverProjectionFt??0,
      coverHeightFt:p.coverHeightFt??9,coverSideOverhangFt:p.coverSideOverhangFt??1,
      coverFrontOverhangFt:p.coverFrontOverhangFt??1,
      client:{name:p.client?.name??'',address:p.client?.address??'',phone:p.client?.phone??'',email:p.client?.email??''},
      calibration:{scale:p.calibration?.scale??1,offsetX:p.calibration?.offsetX??0,offsetY:p.calibration?.offsetY??0,rotationDeg:p.calibration?.rotationDeg??0},
      values:{...deckDefaults,fasciaHouseSide:true,...p.values},
    }));
  }catch{return [];}
};
export const saveConsultations=(projects:ConsultationProject[])=>{
  const safe=projects.slice(0,100);
  window.localStorage.setItem(KEY,JSON.stringify(safe));
};
export const updateConsultation=(previous:ConsultationProject,changes:Partial<ConsultationProject>): ConsultationProject=>{
  const {estimatingResponse:_,...rest}=changes;
  const modified=Object.keys(rest).some((k)=>!['updatedAt','title','client','calibration','photoPresent'].includes(k));
  return {...previous,...rest,updatedAt:iso(),revision:previous.revision+(modified?1:0),
    // A design change invalidates any previously quoted tiers. Never show a
    // stale price or generate a scope for the wrong design revision.
    estimatingResponse:modified?null:changes.estimatingResponse===undefined?previous.estimatingResponse:changes.estimatingResponse};
};
export const isPricedRevision=(project:ConsultationProject)=>
  !!project.estimatingResponse && project.estimatingResponse.requestRevision===project.revision;
export const boardProducts=SERVICES.find((s)=>s.slug==='decks')?.fields.find((f)=>f.key==='deckingMaterial')?.options??[];
export const railingProducts=[
  {value:'wood',label:'Pressure-treated wood railing'},
  {value:'aluminum',label:'Aluminum railing'},
  {value:'vinyl',label:'Vinyl railing'},
] as const;
export const coverProducts:CoverFamily[]=coverVisualProducts.map((p)=>p.id);
export const verifiedDeckProducts=deckVisualProducts;
