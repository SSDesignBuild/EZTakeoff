import type { P2 } from './Primitives';
import { Block } from './Primitives';
import { RenaissanceShadeTube } from './RenaissanceExtrusions';
import {
  planPrivacyTubeCourses,
  PRIVACY_RECEIVER_OUTSIDE_IN,PRIVACY_RECEIVER_DEPTH_IN,PRIVACY_RECEIVER_WALL_IN,
  PRIVACY_SPACER_HEIGHT_IN,PRIVACY_SPACER_DEPTH_IN,type PrivacyWallClearGapIn,
} from '../../lib/renaissancePrivacyWallGeometry';

/** Measured 2026 Renaissance privacy assembly, *not* a structural takeoff. */
export function RenaissancePrivacyWall3D({id,from,to,bottom,topFrom,topTo,gapIn,color}:{
  id:'front'|'rear'|'left'|'right';from:P2;to:P2;
  bottom:number;topFrom:number;topTo:number;
  gapIn:PrivacyWallClearGapIn;color:string;
}){
  const dx=to[0]-from[0],dz=to[1]-from[1];
  const length=Math.hypot(dx,dz);
  // Upper horizontal tube must remain below BOTH ends of a sloping soffit.
  // Do not fill an unapproved triangular roof-to-wall opening with fake tubes.
  const clearTop=Math.min(topFrom,topTo)-.15;
  const height=Math.max(0,clearTop-bottom);
  const tubes=planPrivacyTubeCourses(height,gapIn);
  if(length<1||!tubes.length)return null;
  const ux=dx/length,uz=dz/length;
  const angle=-Math.atan2(dz,dx);
  const receiverWidth=PRIVACY_RECEIVER_OUTSIDE_IN/12;
  const receiverDepth=PRIVACY_RECEIVER_DEPTH_IN/12;
  const wall=PRIVACY_RECEIVER_WALL_IN/12;
  const setback=Math.max(.105,receiverDepth+.02);
  const at=(distance:number):P2=>[from[0]+ux*distance,from[1]+uz*distance];
  const receivers=[{p:from,inward:1},{p:to,inward:-1}];
  return <group name={'renaissance-privacy-wall-'+id+'-'+gapIn+'in-clear-gap'}>
    {receivers.map(({p,inward},i)=><group key={'receiver-'+i}
      name="vertical-U-channel-with-two-lips"
      position={[p[0],bottom+height/2,p[1]]} rotation={[0,angle,0]}>
      {/* Receiver channel: 2.100-in outside around the 2-in tube; 1.500-in
          engagement and 0.045-in metal, not a solid blocking rectangle. */}
      <Block position={[0,0,0]} size={[wall,height,receiverWidth]}
        color={color} metalness={.46}/>
      {[-1,1].map(face=><Block key={'receiver-lip-'+face}
        position={[inward*(receiverDepth/2),0,face*(receiverWidth/2-wall/2)]}
        size={[receiverDepth,height,wall]} color={color} metalness={.46}/>)}
    </group>)}
    {tubes.map((course,i)=>{
      const y=bottom+course.centerAboveBaseFt;
      const left=at(setback),right=at(length-setback);
      const spacerLeft=at(setback+.045),spacerRight=at(length-setback-.045);
      return <group key={'shade-course-'+i}>
        <RenaissanceShadeTube from={[left[0],y,left[1]]}
          to={[right[0],y,right[1]]} color={color}/>
        {/* 2 x 4 x 5/16-in manufacturer spacer/receiver detail. Screws
            are manufacturer indicated, but no quantity/BOM is asserted. */}
        {[spacerLeft,spacerRight].map((point,index)=><group
          key={'shade-spacer-'+index}
          position={[point[0],y,point[1]]} rotation={[0,angle,0]}>
          <Block position={[0,0,0]}
            size={[PRIVACY_SPACER_DEPTH_IN/12,PRIVACY_SPACER_HEIGHT_IN/12,
              PRIVACY_RECEIVER_OUTSIDE_IN/12]}
            color={color} metalness={.4}/>
        </group>)}
      </group>;
    })}
  </group>;
}
