import type {DeckModel} from './deckModel';
import type {ConsultationProject} from './consultationProject';
import type {StairRailClearanceWall} from './stairRailVisualGeometry';
import {planRenaissanceCoverWalls} from './renaissanceCoverWallLayout';
import {getCoverVisualProduct} from '../data/visualCatalog';

/** The enclosure and rail meshes use the same seated wall coordinates.
 * Reserve the entire frame depth, including its Renaissance end columns;
 * shifting only the post centre can leave its skirt or cap inside a wall. */
export function stairEnclosureClearanceWalls(model:DeckModel,project:ConsultationProject,
 center:readonly [number,number],deckHeight:number):StairRailClearanceWall[]{
  if(project.coverFamily==='none')return [];
  const screen=['dolce-open-view','dolce-standard'].includes(project.coverScreenStyle??'none');
  const sunroom=project.coverScreenStyle==='elite-add-a-room'&&
    ['solid-studio','solid-truss-ends','full-trusses'].includes(getCoverVisualProduct(project.coverFamily).family);
  if(!screen&&!sunroom)return [];
  const cover=planRenaissanceCoverWalls(model,project,[center[0],center[1]],deckHeight);
  const depth=screen?.25:(project.eliteSunroom?.roomSystem==='2-nonthermal'?2:3)/12;
  const offset=screen?(project.coverScreenRailTreatment==='inside'?.28:
    project.coverScreenRailTreatment==='outside'?-.28:0):0;
  return cover.wallRuns.flatMap(wall=>{
    const dx=cover.xMid-(wall.from[0]+wall.to[0])/2,dz=cover.zMid-(wall.from[1]+wall.to[1])/2;
    const len=Math.hypot(dx,dz)||1;
    const moved:StairRailClearanceWall={from:[wall.from[0]+dx/len*offset,wall.from[1]+dz/len*offset],
      to:[wall.to[0]+dx/len*offset,wall.to[1]+dz/len*offset],
      halfDepthFt:offset?depth/2:Math.max(depth/2,cover.profile.postOutsideIn/24)};
    // Inside/outside screens move independently of their structural end
    // columns. Retain both planes when checking the stair post footprint.
    return offset?[moved,{from:wall.from,to:wall.to,halfDepthFt:cover.profile.postOutsideIn/24}]:[moved];
  });
}
