/** Polygon clipping for individual installed decking boards. Coordinates are
 * deck-plan feet (X,Y); the renderer alone converts them into scene X,Z. */
export type DeckFacePoint = readonly [number,number];
const EPS=1e-9;
const cross=(a:DeckFacePoint,b:DeckFacePoint)=>a[0]*b[1]-a[1]*b[0];
export const deckFaceArea=(poly:readonly DeckFacePoint[])=>Math.abs(poly.reduce((sum,p,i)=>{
  const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];
},0))/2;

export function clipDeckFace(poly:readonly DeckFacePoint[],a:DeckFacePoint,
  b:DeckFacePoint,keepLeft:boolean,clearanceFt=0):DeckFacePoint[]{
  if(poly.length<3)return [];
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  if(len<EPS)return [...poly];
  const distance=(p:DeckFacePoint)=>(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/len+clearanceFt;
  const out:DeckFacePoint[]=[];
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length];
    const dp=distance(p),dq=distance(q);
    const insideP=keepLeft?dp>=-EPS:dp<=EPS;
    const insideQ=keepLeft?dq>=-EPS:dq<=EPS;
    if(insideP)out.push(p);
    if(insideP!==insideQ&&Math.abs(dp-dq)>EPS){
      const t=dp/(dp-dq);
      out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);
    }
  }
  return out.filter((p,i)=>i===0||Math.hypot(p[0]-out[i-1][0],p[1]-out[i-1][1])>EPS);
}

/** Subtract a convex trim board from a convex field-board face. Keep the
 * actual offcut outline instead of deleting the full 5.5-inch row. */
export function subtractDeckFace(subject:readonly DeckFacePoint[],
  blocker:readonly DeckFacePoint[],clearanceFt=0):DeckFacePoint[][]{
  if(subject.length<3||deckFaceArea(subject)<EPS)return [];
  if(blocker.length<3||deckFaceArea(blocker)<EPS)return [[...subject]];
  const signed=blocker.reduce((sum,p,i)=>sum+cross(p,blocker[(i+1)%blocker.length]),0);
  const clip=signed<0?[...blocker].reverse():[...blocker];
  let remainder=[...subject];
  const kept:DeckFacePoint[][]=[];
  for(let i=0;i<clip.length&&remainder.length>=3;i++){
    const a=clip[i],b=clip[(i+1)%clip.length];
    const outside=clipDeckFace(remainder,a,b,false,clearanceFt);
    if(outside.length>=3&&deckFaceArea(outside)>EPS)kept.push(outside);
    remainder=clipDeckFace(remainder,a,b,true,clearanceFt);
  }
  return kept;
}

/** Stitch mathematical clipping partitions back into one installed board.
 * A notch can make the remaining face concave, so a convex hull is not a
 * valid substitute. Cancel only shared edges; real gaps stay separate. */
export function mergeDeckFaces(polygons:DeckFacePoint[][]):DeckFacePoint[][]{
  const key=(p:DeckFacePoint)=>p[0].toFixed(8)+','+p[1].toFixed(8);
  const ccw=(poly:DeckFacePoint[])=>poly.reduce((sum,p,i)=>
    sum+cross(p,poly[(i+1)%poly.length]),0)<0?[...poly].reverse():poly;
  const join=(first:DeckFacePoint[],second:DeckFacePoint[]):DeckFacePoint[]|null=>{
    const pieces=[ccw(first),ccw(second)],vertices=pieces.flat();
    const edges=new Map<string,{a:DeckFacePoint;b:DeckFacePoint}>();
    let shared=false;
    for(const poly of pieces)for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1];
      const length2=dx*dx+dy*dy;if(length2<EPS*EPS)continue;
      const stops=[0,1];
      for(const p of vertices){
        const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length2;
        if(t>EPS&&t<1-EPS&&Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))<1e-7)
          stops.push(t);
      }
      const sorted=[...new Set(stops.map(t=>Number(t.toFixed(10))))].sort((a,b)=>a-b);
      for(let j=0;j+1<sorted.length;j++){
        const at=(t:number):DeckFacePoint=>[a[0]+dx*t,a[1]+dy*t];
        const p=at(sorted[j]),q=at(sorted[j+1]),pk=key(p),qk=key(q);
        if(pk===qk)continue;
        const reverse=qk+'>'+pk,forward=pk+'>'+qk;
        if(edges.has(reverse)){edges.delete(reverse);shared=true;}
        else edges.set(forward,{a:p,b:q});
      }
    }
    if(!shared||!edges.size)return null;
    const pending=[...edges.values()],firstEdge=pending.shift()!;
    const outline:DeckFacePoint[]=[firstEdge.a,firstEdge.b];
    while(key(outline[outline.length-1])!==key(outline[0])&&pending.length){
      const next=pending.findIndex(e=>key(e.a)===key(outline[outline.length-1]));
      if(next<0)return null;
      outline.push(pending.splice(next,1)[0].b);
    }
    // Multiple contours (including a genuine hole) must remain separate
    // renderable pieces instead of silently filling the opening.
    if(pending.length||key(outline[0])!==key(outline[outline.length-1]))return null;
    outline.pop();
    if(Math.abs(deckFaceArea(outline)-deckFaceArea(first)-deckFaceArea(second))>1e-6)return null;
    return outline.filter((p,i)=>{
      const a=outline[(i+outline.length-1)%outline.length],b=outline[(i+1)%outline.length];
      return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>1e-9;
    });
  };
  const pieces=polygons.map(poly=>[...poly]);
  for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){
    const merged=join(pieces[i],pieces[j]);
    if(merged){pieces[i]=merged;pieces.splice(j,1);i=-1;break;}
  }
  return pieces;
}

/** Transform used by both rendered boards and their miter seams. */
export const deckPlanToScene=(point:DeckFacePoint,center:DeckFacePoint):[number,number]=>
  [point[0]-center[0],point[1]-center[1]];
