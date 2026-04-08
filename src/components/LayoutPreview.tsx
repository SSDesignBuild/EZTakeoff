import { useMemo, useState } from 'react';
import { buildDeckModel } from '../lib/deckModel';
import { buildPatioPanelLayout } from '../lib/patioLayout';
import { parseSections } from '../lib/sectioning';
import { DeckEdgeSegment, DeckPoint, SectionConfig } from '../lib/types';

interface LayoutPreviewProps {
  serviceSlug: string;
  values: Record<string, string | number | boolean>;
}

type DeckLayer = 'overview' | 'boards' | 'framing' | 'exploded' | 'railing' | 'stairs';
type InspectMember = { title: string; detail: string };

const feetAndInches = (feet: number) => {
  const totalInches = Math.round(feet * 12);
  const ft = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches ? `${ft}' ${inches}"` : `${ft}'`;
};

function scanlineIntersections(points: DeckPoint[], axis: 'horizontal' | 'vertical', position: number) {
  const intersections: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (axis === 'horizontal') {
      const min = Math.min(current.y, next.y);
      const max = Math.max(current.y, next.y);
      if (position < min || position >= max || Math.abs(current.y - next.y) < 1e-9) continue;
      const t = (position - current.y) / (next.y - current.y);
      intersections.push(current.x + t * (next.x - current.x));
    } else {
      const min = Math.min(current.x, next.x);
      const max = Math.max(current.x, next.x);
      if (position < min || position >= max || Math.abs(current.x - next.x) < 1e-9) continue;
      const t = (position - current.x) / (next.x - current.x);
      intersections.push(current.y + t * (next.y - current.y));
    }
  }
  intersections.sort((a, b) => a - b);
  const pairs: { start: number; end: number }[] = [];
  for (let index = 0; index < intersections.length; index += 2) {
    const start = intersections[index];
    const end = intersections[index + 1];
    if (end !== undefined && end > start) pairs.push({ start, end });
  }
  return pairs;
}

function sectionDoorLeft(section: SectionConfig) {
  const sectionWidthIn = section.width * 12;
  const doorWidthIn = Math.min(section.doorWidth * 12, sectionWidthIn);
  if (section.doorType === 'none') return 0;
  if (section.doorPlacement === 'left') return 0;
  if (section.doorPlacement === 'right') return Math.max(0, sectionWidthIn - doorWidthIn);
  if (section.doorPlacement === 'custom') return Math.max(0, Math.min(section.doorOffsetInches, sectionWidthIn - doorWidthIn));
  return Math.max(0, (sectionWidthIn - doorWidthIn) / 2);
}

function polygonOrientation(points: DeckPoint[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += (next.x - current.x) * (next.y + current.y);
  }
  return sum > 0 ? 'clockwise' : 'counterclockwise';
}

function outwardNormal(segment: DeckEdgeSegment, points: DeckPoint[]) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const orientation = polygonOrientation(points);
  if (orientation === 'counterclockwise') return { x: dy / length, y: -dx / length };
  return { x: -dy / length, y: dx / length };
}

function offsetSegment(segment: DeckEdgeSegment, distance: number, points: DeckPoint[]) {
  const normal = outwardNormal(segment, points);
  return {
    start: { x: segment.start.x + normal.x * distance, y: segment.start.y + normal.y * distance },
    end: { x: segment.end.x + normal.x * distance, y: segment.end.y + normal.y * distance },
  };
}

function stockPlan(length: number, stock = 20) {
  if (length <= stock + 0.01) return [Math.round(length * 100) / 100];
  const parts = [stock, stock];
  let coverage = stock + 10;
  while (coverage + 10 < length - 0.01) { parts.push(stock); coverage += 10; }
  const tail = Math.round((length - coverage) * 100) / 100;
  if (tail > 0.1) parts.push(tail);
  return parts;
}

function staggeredSegments(length: number, stock = 20, startOffset = 0) {
  const parts: { start: number; end: number }[] = [];
  if (length <= 0.01) return parts;
  let cursor = 0;
  if (startOffset > 0 && startOffset < length) {
    parts.push({ start: 0, end: Math.min(startOffset, length) });
    cursor = startOffset;
  }
  while (cursor < length - 0.01) {
    const end = Math.min(length, cursor + stock);
    parts.push({ start: cursor, end });
    cursor = end;
  }
  return parts;
}

function pointAlong(segment: DeckEdgeSegment, distance: number) {
  const ratio = segment.length <= 0.0001 ? 0 : distance / segment.length;
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
    y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
  };
}

function sectionSpansExcludingDoor(section: SectionConfig) {
  const doorWidth = section.doorType === 'none' ? 0 : Math.min(section.doorWidth, section.width);
  const doorLeftFt = sectionDoorLeft(section) / 12;
  const doorRightFt = doorLeftFt + doorWidth;
  if (doorWidth <= 0) return [{ start: 0, end: section.width }];
  return [
    ...(doorLeftFt > 0.01 ? [{ start: 0, end: doorLeftFt }] : []),
    ...(doorRightFt < section.width - 0.01 ? [{ start: doorRightFt, end: section.width }] : []),
  ];
}

function railSegmentsForDeck(deck: ReturnType<typeof buildDeckModel>) {
  const result: { start: DeckPoint; end: DeckPoint; length: number; kind: 'deck' | 'stair-side' }[] = [];
  deck.exposedSegments.forEach((segment) => {
    if (segment.index !== deck.stairPlacement.edgeIndex || !deck.stairPlacement.start || !deck.stairPlacement.end) {
      result.push({ start: segment.start, end: segment.end, length: segment.length, kind: 'deck' });
      return;
    }
    const stairOffset = deck.stairPlacement.offset;
    const stairWidth = Math.min(deck.stairPlacement.width, segment.length);
    if (stairOffset > 0.05) {
      const ratio = stairOffset / segment.length;
      result.push({ start: segment.start, end: { x: segment.start.x + (segment.end.x - segment.start.x) * ratio, y: segment.start.y + (segment.end.y - segment.start.y) * ratio }, length: stairOffset, kind: 'deck' });
    }
    const rightLength = segment.length - (stairOffset + stairWidth);
    if (rightLength > 0.05) {
      const ratio = (stairOffset + stairWidth) / segment.length;
      result.push({ start: { x: segment.start.x + (segment.end.x - segment.start.x) * ratio, y: segment.start.y + (segment.end.y - segment.start.y) * ratio }, end: segment.end, length: rightLength, kind: 'deck' });
    }
  });
  if (deck.stairRisers > 3 && deck.stairPlacement.start && deck.stairPlacement.end) {
    const segment = deck.edgeSegments[deck.stairPlacement.edgeIndex ?? 0];
    const normal = outwardNormal(segment, deck.points);
    const run = deck.stairRunFt;
    result.push(
      { start: deck.stairPlacement.start, end: { x: deck.stairPlacement.start.x + normal.x * run, y: deck.stairPlacement.start.y + normal.y * run }, length: run, kind: 'stair-side' },
      { start: deck.stairPlacement.end, end: { x: deck.stairPlacement.end.x + normal.x * run, y: deck.stairPlacement.end.y + normal.y * run }, length: run, kind: 'stair-side' },
    );
  }
  return result;
}

function DeckPreview({ values }: { values: Record<string, string | number | boolean> }) {
  const deck = buildDeckModel(values);
  const [layer, setLayer] = useState<DeckLayer>('overview');
  const [inspect, setInspect] = useState<InspectMember | null>(null);
  const scale = Math.min(560 / Math.max(deck.width, 1), 380 / Math.max(deck.depth, 1));
  const pad = 70;
  const toSvg = (x: number, y: number) => ({ x: pad + (x - deck.minX) * scale, y: pad + (y - deck.minY) * scale });
  const pointString = deck.points.map((p) => `${toSvg(p.x, p.y).x},${toSvg(p.x, p.y).y}`).join(' ');
  const showBoards = layer === 'overview' || layer === 'boards' || layer === 'exploded';
  const showFraming = layer === 'overview' || layer === 'framing' || layer === 'exploded';
  const showRailing = layer === 'overview' || layer === 'railing' || layer === 'exploded';
  const showStairs = layer === 'overview' || layer === 'stairs' || layer === 'exploded';
  const showExploded = layer === 'exploded';
  const boardScanlines = deck.boardRun === 'width' ? Array.from({ length: Math.max(1, Math.floor(deck.depth / 0.47)) }, (_, i) => deck.minY + 0.22 + i * 0.47) : Array.from({ length: Math.max(1, Math.floor(deck.width / 0.47)) }, (_, i) => deck.minX + 0.22 + i * 0.47);
  const joistScanlines = deck.joistDirection === 'vertical' ? Array.from({ length: Math.max(1, Math.floor(deck.width / 1) + 1) }, (_, i) => deck.minX + i) : Array.from({ length: Math.max(1, Math.floor(deck.depth / 1) + 1) }, (_, i) => deck.minY + i);
  const stairStart = deck.stairPlacement.start ? toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y) : null;
  const stairEnd = deck.stairPlacement.end ? toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y) : null;
  const stairSegment = deck.stairPlacement.edgeIndex !== null ? deck.edgeSegments[deck.stairPlacement.edgeIndex] : null;
  const stairNormal = stairSegment ? outwardNormal(stairSegment, deck.points) : { x: 0, y: 1 };
  const stairNx = stairNormal.x * scale;
  const stairNy = stairNormal.y * scale;
  const stairLen = Math.hypot(stairNx, stairNy) || 1;
  const railingSegments = railSegmentsForDeck(deck);
  let boardIndex = 0;
  let joistIndex = 0;
  return (
    <div className="visual-card">
      <div className="visual-header"><div><h3>Layout preview</h3><span>Scaled plan with field-board staggering, doubled band runs, staggered beam plies, post locations, and a carpenter-style exploded review layer.</span></div><div className="preview-toolbar">{(['overview', 'boards', 'framing', 'exploded', 'railing', 'stairs'] as DeckLayer[]).map((item) => <button key={item} type="button" className={layer === item ? 'ghost-btn small-btn active-chip' : 'ghost-btn small-btn'} onClick={() => setLayer(item)}>{item}</button>)}</div></div>
      <svg viewBox={`0 0 ${deck.width * scale + pad * 2} ${deck.depth * scale + pad * 2 + 130}`} className="layout-svg">
        {Array.from({ length: Math.floor(deck.width) + 1 }, (_, i) => <line key={`gx-${i}`} x1={pad + i * scale} y1={pad - 12} x2={pad + i * scale} y2={pad + deck.depth * scale + 12} className="svg-grid" />)}
        {Array.from({ length: Math.floor(deck.depth) + 1 }, (_, i) => <line key={`gy-${i}`} x1={pad - 12} y1={pad + i * scale} x2={pad + deck.width * scale + 12} y2={pad + i * scale} className="svg-grid" />)}
        <polygon points={pointString} className="deck-polygon muted-fill" />
        {showBoards && boardScanlines.map((value) => deck.boardRun === 'width' ? scanlineIntersections(deck.points, 'horizontal', value).map((pair, idx) => { boardIndex += 1; const n = boardIndex; return <g key={`b-${idx}-${value}`} onClick={() => setInspect({ title: `Deck board ${n}`, detail: `${feetAndInches(pair.end - pair.start)} field board with staggered seam display.` })}>{staggeredSegments(pair.end - pair.start, 20, (n % 4) * 4).map((seg, sidx) => { const a = toSvg(pair.start + seg.start, value); const b = toSvg(pair.start + seg.end, value); return <g key={`bs-${sidx}`}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="deck-board-line" />{seg.end < (pair.end - pair.start) - 0.05 && <line x1={b.x} y1={b.y - 5} x2={b.x} y2={b.y + 5} className="svg-guide" />}</g>; })}{showExploded && n % 6 === 0 && <text x={toSvg((pair.start + pair.end) / 2, value).x - 8} y={toSvg((pair.start + pair.end) / 2, value).y - 4} className="svg-note">B{n}</text>}</g>; }) : scanlineIntersections(deck.points, 'vertical', value).map((pair, idx) => { boardIndex += 1; const n = boardIndex; return <g key={`b-${idx}-${value}`} onClick={() => setInspect({ title: `Deck board ${n}`, detail: `${feetAndInches(pair.end - pair.start)} field board with staggered seam display.` })}>{staggeredSegments(pair.end - pair.start, 20, (n % 4) * 4).map((seg, sidx) => { const a = toSvg(value, pair.start + seg.start); const b = toSvg(value, pair.start + seg.end); return <g key={`bs-${sidx}`}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="deck-board-line" />{seg.end < (pair.end - pair.start) - 0.05 && <line x1={b.x - 5} y1={b.y} x2={b.x + 5} y2={b.y} className="svg-guide" />}</g>; })}{showExploded && n % 6 === 0 && <text x={toSvg(value, (pair.start + pair.end) / 2).x + 4} y={toSvg(value, (pair.start + pair.end) / 2).y} className="svg-note">B{n}</text>}</g>; }))}
        {showFraming && joistScanlines.map((value) => deck.joistDirection === 'vertical' ? scanlineIntersections(deck.points, 'vertical', value).map((pair, idx) => { joistIndex += 1; const a=toSvg(value,pair.start); const b=toSvg(value,pair.end); const n=joistIndex; return <g key={`j-${idx}-${value}`} onClick={() => setInspect({ title:`Joist ${n}`, detail:`Approx. ${feetAndInches(pair.end-pair.start)} ${deck.joistSize} joist at 12 in O.C.` })}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="joist-line" />{showExploded && n % 2 === 1 && <text x={a.x + 4} y={(a.y + b.y) / 2} className="svg-note">J{n}</text>}</g>; }) : scanlineIntersections(deck.points, 'horizontal', value).map((pair, idx) => { joistIndex += 1; const a=toSvg(pair.start,value); const b=toSvg(pair.end,value); const n=joistIndex; return <g key={`j-${idx}-${value}`} onClick={() => setInspect({ title:`Joist ${n}`, detail:`Approx. ${feetAndInches(pair.end-pair.start)} ${deck.joistSize} joist at 12 in O.C.` })}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="joist-line" />{showExploded && n % 2 === 1 && <text x={(a.x+b.x)/2 - 10} y={a.y - 4} className="svg-note">J{n}</text>}</g>; }))}
        {!deck.isFreestanding && <><line x1={pad} y1={pad - 22} x2={pad + deck.width * scale} y2={pad - 22} className="house-line" /><text x={pad} y={pad - 28} className="svg-note">House / ledger side</text></>}
        {showFraming && deck.edgeSegments.map((segment) => { const outer={...offsetSegment(segment,0.04,deck.points),length:segment.length} as DeckEdgeSegment; const inner={...offsetSegment(segment,-0.18,deck.points),length:segment.length} as DeckEdgeSegment; return <g key={`bb-${segment.index}`} onClick={() => setInspect({ title:`Band board ${segment.index+1}`, detail:`Double band on ${feetAndInches(segment.length)} run with staggered seam layout.` })}>{staggeredSegments(segment.length,20,0).map((seg,sidx)=>{const s=pointAlong(outer,seg.start); const e=pointAlong(outer,seg.end); const a=toSvg(s.x,s.y); const b=toSvg(e.x,e.y); return <line key={`a-${sidx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="band-line" />;})}{staggeredSegments(segment.length,20,10).map((seg,sidx)=>{const s=pointAlong(inner,seg.start); const e=pointAlong(inner,seg.end); const a=toSvg(s.x,s.y); const b=toSvg(e.x,e.y); return <line key={`b-${sidx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="band-line secondary" />;})}{showExploded && <text x={(toSvg(segment.start.x,segment.start.y).x + toSvg(segment.end.x,segment.end.y).x)/2 - 16} y={(toSvg(segment.start.x,segment.start.y).y + toSvg(segment.end.x,segment.end.y).y)/2 - 10} className="svg-note">BB{segment.index+1}</text>}</g>; })}
        {showFraming && deck.beamLines.map((beam,index)=><g key={`bm-${index}`}>{beam.segments.map((segment,segIndex)=>{const y=toSvg(segment.startX,beam.y).y; const plan=stockPlan(segment.length); const mid=(toSvg(segment.startX,beam.y).x + toSvg(segment.endX,beam.y).x)/2; return <g key={`seg-${segIndex}`} onClick={() => setInspect({ title:`Beam ${index+1} segment ${segIndex+1}`, detail:`${feetAndInches(segment.length)} long at ${feetAndInches(beam.offsetFromHouse)} off house. Staggered stock plan: ${plan.map(v=>`${v}'`).join(' + ')}` })}>{staggeredSegments(segment.length,20,0).map((splice,sidx)=>{const x1=toSvg(segment.startX+splice.start,beam.y).x; const x2=toSvg(segment.startX+splice.end,beam.y).x; return <line key={`sa-${sidx}`} x1={x1} y1={y-7} x2={x2} y2={y-7} className="beam-line" />;})}{staggeredSegments(segment.length,20,10).map((splice,sidx)=>{const x1=toSvg(segment.startX+splice.start,beam.y).x; const x2=toSvg(segment.startX+splice.end,beam.y).x; return <line key={`sb-${sidx}`} x1={x1} y1={y+7} x2={x2} y2={y+7} className="beam-line secondary" />;})}{showExploded && <text x={mid-18} y={y-14} className="svg-note">BM{index+1}.{segIndex+1}</text>}</g>;})}{beam.postXs.map((postX,postIndex)=>{const p=toSvg(postX,beam.y); return <g key={`p-${postX}`} onClick={() => setInspect({ title:`Post on beam ${index+1}`, detail:`Post ${postIndex+1} located ${feetAndInches(postX-deck.minX)} from left reference and ${feetAndInches(beam.offsetFromHouse)} off the house.` })}><rect x={p.x-6} y={p.y-10} width="12" height="20" className={beam.lockedPostXs.includes(postX)?'post-node locked-post':'post-node'} rx="2" />{showExploded && <text x={p.x+6} y={p.y-6} className="svg-note">P{index+1}.{postIndex+1}</text>}</g>;})}</g>)}
        {showRailing && railingSegments.map((segment,index)=>{const fakeEdge:DeckEdgeSegment={start:segment.start,end:segment.end,length:segment.length,orientation:'horizontal',index}; const rail=offsetSegment(fakeEdge,segment.kind==='stair-side'?0.22:0.28,deck.points); const a=toSvg(rail.start.x,rail.start.y); const b=toSvg(rail.end.x,rail.end.y); return <line key={`r-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={segment.kind==='stair-side'?'stair-rail-line':'railing-line'} />;})}
        {showRailing && railingSegments.map((segment,segmentIndex)=>{const postCount=Math.max(2,Math.ceil(segment.length/6)+1); return Array.from({length:postCount},(_,index)=>{const ratio=postCount===1?0:index/(postCount-1); const x=segment.start.x + (segment.end.x-segment.start.x)*ratio; const y=segment.start.y + (segment.end.y-segment.start.y)*ratio; const p=toSvg(x,y); return <circle key={`rp-${segmentIndex}-${index}`} cx={p.x} cy={p.y} r="4" className="railing-post-node" />;});})}
        {showStairs && stairStart && stairEnd && <><line x1={stairStart.x} y1={stairStart.y} x2={stairEnd.x} y2={stairEnd.y} className="stair-edge-highlight" />{Array.from({length:Math.max(deck.stairStringers,0)},(_,index)=>{const ratio=deck.stairStringers<=1?0.5:index/(deck.stairStringers-1); const sx=stairStart.x + (stairEnd.x-stairStart.x)*ratio; const sy=stairStart.y + (stairEnd.y-stairStart.y)*ratio; const ex=sx + stairNx*deck.stairRunFt; const ey=sy + stairNy*deck.stairRunFt; return <g key={`s-${index}`} onClick={() => setInspect({ title:`Stringer ${index+1}`, detail:`${feetAndInches(deck.stairStringerLength)} 2x12 stringer serving ${deck.stairRisers} risers and ${deck.stairTreadsPerRun} treads.` })}><line x1={sx} y1={sy} x2={ex} y2={ey} className="stringer-line" />{showExploded && <text x={sx+4} y={sy+12} className="svg-note">S{index+1}</text>}</g>;})}{Array.from({length:Math.max(deck.stairTreadsPerRun,0)},(_,index)=>{const offset=((index+1)*stairLen*deck.stairRunFt)/Math.max(deck.stairTreadsPerRun+1,1); return <line key={`t-${index}`} x1={stairStart.x + (stairNx/stairLen)*offset} y1={stairStart.y + (stairNy/stairLen)*offset} x2={stairEnd.x + (stairNx/stairLen)*offset} y2={stairEnd.y + (stairNy/stairLen)*offset} className="tread-line" />;})}<text x={Math.min(stairStart.x,stairEnd.x)+6} y={Math.min(stairStart.y,stairEnd.y)-10} className="svg-note">{`${deck.stairRisers} risers · ${deck.stairTreadsPerRun} treads · ${deck.stairStringers} stringers`}</text></>}
        <line x1={pad} y1={pad + deck.depth * scale + 28} x2={pad + deck.width * scale} y2={pad + deck.depth * scale + 28} className="dimension-line" /><text x={pad + (deck.width * scale)/2 - 16} y={pad + deck.depth * scale + 22} className="svg-note">{feetAndInches(deck.width)}</text><line x1={pad - 24} y1={pad} x2={pad - 24} y2={pad + deck.depth * scale} className="dimension-line" /><text x={pad - 58} y={pad + (deck.depth * scale)/2} className="svg-note">{feetAndInches(deck.depth)}</text>
        <g transform={`translate(${pad + deck.width * scale - 148}, ${pad + deck.depth * scale - 92})`}><rect x="0" y="0" width="138" height="82" className="detail-inset" rx="10" /><text x="10" y="16" className="svg-note">Notched post / beam detail</text><rect x="18" y="24" width="18" height="42" className="post-node" rx="2" /><line x1="26" y1="36" x2="116" y2="36" className="beam-line" /><line x1="26" y1="48" x2="116" y2="48" className="beam-line secondary" /><line x1="50" y1="36" x2="50" y2="48" className="svg-guide" /><line x1="88" y1="36" x2="88" y2="48" className="svg-guide" /><text x="10" y="76" className="svg-note">Plan inset: staggered plies at notched post</text></g>
      </svg>
      {inspect && <div className="callout-box preview-inspect"><h4>{inspect.title}</h4><p className="muted">{inspect.detail}</p></div>}
      {showExploded && <div className="callout-box preview-inspect"><h4>Exploded framing review</h4><p className="muted">B = deck board, J = joist, BB = double band run, BM = doubled beam segment, P = beam post, and S = stair stringer.</p></div>}
      <div className="legend-row"><span><i className="legend-swatch deck-board-swatch" /> deck boards</span><span><i className="legend-swatch joist-line-swatch" /> joists</span><span><i className="legend-swatch beam-line-swatch" /> doubled beam</span><span><i className="legend-swatch band-line-swatch" /> double band</span><span><i className="legend-swatch railing-line-swatch" /> railing</span><span><i className="legend-swatch stair-line-swatch" /> stairs</span></div>
    </div>
  );
}

function ScreenPreview({ values, renaissance }: { values: Record<string, string | number | boolean>; renaissance: boolean }) {
  const sections = parseSections(values.sections, 3);
  const scale = 30;
  const gutter = 24;
  const x0 = 44;
  const y0 = 48;
  const totalW = sections.reduce((sum, section) => sum + section.width * scale, 0) + ((sections.length - 1) * gutter);
  const totalH = Math.max(...sections.map((section) => section.height * scale), 220);
  let runningX = x0;
  return (
    <div className="visual-card">
      <div className="visual-header"><h3>Layout preview</h3><span>Scaled installer plan with distinct material lanes, true door cut-outs, and screen/picket/kick-panel geometry that follows the opening proportions.</span></div>
      <svg viewBox={`0 0 ${totalW + 120} ${totalH + 150}`} className="layout-svg">
        {Array.from({ length: Math.ceil(totalW / scale) + 3 }, (_, index) => <line key={`sx-${index}`} x1={x0 - 18 + index * scale} y1={y0 - 18} x2={x0 - 18 + index * scale} y2={y0 + totalH + 18} className="svg-grid" />)}
        {Array.from({ length: Math.ceil(totalH / scale) + 3 }, (_, index) => <line key={`sy-${index}`} x1={x0 - 18} y1={y0 - 18 + index * scale} x2={x0 + totalW + 18} y2={y0 - 18 + index * scale} className="svg-grid" />)}
        {sections.map((section, sectionIndex) => {
          const sectionW = section.width * scale; const sectionH = section.height * scale; const left = runningX; const right = left + sectionW; const top = y0; const bottom = y0 + sectionH; runningX += sectionW + gutter;
          const doorWidth = section.doorType === 'none' ? 0 : Math.min(section.doorWidth, section.width);
          const doorLeftFt = sectionDoorLeft(section) / 12; const doorRightFt = doorLeftFt + doorWidth; const doorLeft = left + doorLeftFt * scale; const doorRight = left + doorRightFt * scale; const doorTop = top + Math.max(18, sectionH * 0.12);
          const spans = sectionSpansExcludingDoor(section);
          const kickHeight = section.kickPanel === 'none' ? 0 : Math.min(section.kickPanelHeight, section.kickPanel === 'trim-coil' ? 2 : 4); const kickTop = bottom - kickHeight * scale; const picketTop = bottom - 3 * scale; const chairOnlyY = bottom - Math.max(kickHeight + 3, section.height * 0.55) * scale;
          const perimeterClass = renaissance ? 'reno-1x2-line' : section.kickPanel === 'trim-coil' ? 'vgroove1-line' : 'onebytwo-line';
          const uprightClass = renaissance ? ((section.pickets || section.kickPanel === 'insulated') ? 'reno-2x2-groove-line' : 'reno-2x2-line') : (section.kickPanel === 'trim-coil' ? 'vgroove2-line' : 'twobytwo-line');
          const chairRailClass = renaissance ? (section.pickets || section.kickPanel === 'insulated' ? 'reno-2x2-groove-line' : 'reno-2x2-line') : (section.kickPanel === 'trim-coil' ? 'vgroove2-line' : 'twobytwo-line');
          const doorFrameClass = renaissance ? 'reno-2x2-line' : 'twobytwo-line';
          const receiverInset = 4; const oneByInset = 12; const frameInset = 20; const picketBottom = section.kickPanel === 'none' ? bottom - 16 : kickTop + 10;
          const picketCount = section.pickets ? Math.max(0, Math.floor(((section.width - doorWidth) * 12 + 4) / 4)) : 0;
          const uprightXs = Array.from({ length: section.uprights }, (_, index) => ((index + 1) * section.width) / (section.uprights + 1)).filter((x) => spans.some((span) => x > span.start && x < span.end));
          return <g key={section.id}><rect x={left} y={top} width={sectionW} height={sectionH} className="screen-box" rx="8" /><text x={left} y={top - 12} className="svg-note">{`${section.label} · ${feetAndInches(section.width)} x ${feetAndInches(section.height)}`}</text>
          {!renaissance && <><line x1={left + receiverInset} y1={top + receiverInset} x2={left + receiverInset} y2={bottom - receiverInset} className="receiver-line" /><line x1={right - receiverInset} y1={top + receiverInset} x2={right - receiverInset} y2={bottom - receiverInset} className="receiver-line" /><line x1={left + receiverInset} y1={top + receiverInset} x2={right - receiverInset} y2={top + receiverInset} className="receiver-line" />{spans.map((span, idx) => <line key={`rb-${idx}`} x1={left + span.start * scale + receiverInset} y1={bottom - receiverInset} x2={left + span.end * scale - receiverInset} y2={bottom - receiverInset} className="receiver-line" />)}{section.kickPanel === 'insulated' && spans.map((span, idx) => <line key={`rk-${idx}`} x1={left + span.start * scale + receiverInset + 6} y1={kickTop + receiverInset + 4} x2={left + span.end * scale - receiverInset - 6} y2={kickTop + receiverInset + 4} className="receiver-line" />)}</>}
          {renaissance && <><line x1={left + oneByInset} y1={top + oneByInset} x2={left + oneByInset} y2={bottom - oneByInset} className="reno-1x2-line" /><line x1={right - oneByInset} y1={top + oneByInset} x2={right - oneByInset} y2={bottom - oneByInset} className="reno-1x2-line" /><line x1={left + oneByInset} y1={top + oneByInset} x2={right - oneByInset} y2={top + oneByInset} className="reno-1x2-line" />{spans.map((span, idx) => <line key={`rbase-${idx}`} x1={left + span.start * scale + oneByInset} y1={bottom - oneByInset} x2={left + span.end * scale - oneByInset} y2={bottom - oneByInset} className="reno-1x2-line" />)}</>}
          {!renaissance && <><line x1={left + oneByInset} y1={top + oneByInset} x2={left + oneByInset} y2={bottom - oneByInset} className={perimeterClass} /><line x1={right - oneByInset} y1={top + oneByInset} x2={right - oneByInset} y2={bottom - oneByInset} className={perimeterClass} /><line x1={left + oneByInset} y1={top + oneByInset} x2={right - oneByInset} y2={top + oneByInset} className={perimeterClass} />{section.kickPanel !== 'insulated' && spans.map((span, idx) => <line key={`base-${idx}`} x1={left + span.start * scale + oneByInset} y1={bottom - oneByInset} x2={left + span.end * scale - oneByInset} y2={bottom - oneByInset} className={perimeterClass} />)}</>}
          {section.kickPanel !== 'none' && spans.map((span, idx) => <g key={`kick-${idx}`}><rect x={left + span.start * scale + frameInset - 2} y={kickTop + 10} width={Math.max(0, (span.end - span.start) * scale - frameInset * 2 + 4)} height={Math.max(0, bottom - kickTop - 20)} className="kick-panel-fill" rx="4" /><line x1={left + span.start * scale + frameInset} y1={kickTop} x2={left + span.end * scale - frameInset} y2={kickTop} className={chairRailClass} />{!renaissance && section.kickPanel === 'trim-coil' && <line x1={left + span.start * scale + frameInset} y1={bottom - 14} x2={left + span.end * scale - frameInset} y2={bottom - 14} className="vgroove1-line" />}</g>)}
          {section.pickets && spans.map((span, idx) => <g key={`picketspan-${idx}`}><line x1={left + span.start * scale + frameInset} y1={picketTop} x2={left + span.end * scale - frameInset} y2={picketTop} className={renaissance ? 'reno-2x2-groove-line' : 'u-channel-line'} /><line x1={left + span.start * scale + frameInset} y1={picketBottom} x2={left + span.end * scale - frameInset} y2={picketBottom} className={renaissance ? 'reno-1x2-line' : 'u-channel-line'} /></g>)}
          {!section.pickets && section.chairRail && spans.map((span, idx) => <line key={`chair-${idx}`} x1={left + span.start * scale + frameInset} y1={chairOnlyY} x2={left + span.end * scale - frameInset} y2={chairOnlyY} className={chairRailClass} />)}
          {uprightXs.map((x, idx) => { const xPos = left + x * scale; const bottomY = section.kickPanel !== 'none' ? kickTop : bottom - frameInset; return <line key={`u-${idx}`} x1={xPos} y1={top + frameInset} x2={xPos} y2={bottomY} className={uprightClass} />; })}
          {section.pickets && picketCount > 0 && spans.map((span, spanIndex) => { const spanCount = Math.max(1, Math.floor((((span.end - span.start) * 12) + 4) / 4)); return Array.from({ length: spanCount }, (_, idx) => { const x = left + span.start * scale + frameInset + ((idx + 0.5) * (((span.end - span.start) * scale) - frameInset * 2)) / spanCount; return <line key={`p-${spanIndex}-${idx}`} x1={x} y1={picketTop + 2} x2={x} y2={picketBottom - 2} className="picket-line" />; }); })}
          {section.doorType !== 'none' && <><rect x={doorLeft} y={doorTop} width={(doorRightFt - doorLeftFt) * scale} height={bottom - doorTop} className="door-panel" rx="6" /><line x1={doorLeft} y1={doorTop} x2={doorLeft} y2={bottom} className={doorFrameClass} /><line x1={doorRight} y1={doorTop} x2={doorRight} y2={bottom} className={doorFrameClass} /><line x1={doorLeft} y1={doorTop} x2={doorRight} y2={doorTop} className={doorFrameClass} />{section.doorType === 'french' && <line x1={(doorLeft + doorRight) / 2} y1={doorTop + 8} x2={(doorLeft + doorRight) / 2} y2={bottom - 8} className="door-split-line" />}<text x={doorLeft + 6} y={doorTop + 16} className="svg-note">{`${feetAndInches(section.doorWidth)}${section.dogDoor !== 'none' ? ` · ${section.dogDoor} dog door` : ''}`}</text></>}
          <line x1={left} y1={bottom + 26} x2={right} y2={bottom + 26} className="dimension-line" /><text x={left + sectionW / 2 - 16} y={bottom + 20} className="svg-note">{feetAndInches(section.width)}</text>{sectionIndex === 0 && <text x={left - 34} y={top + sectionH / 2} className="svg-note">{feetAndInches(section.height)}</text>}{section.pickets && <text x={left + 8} y={bottom - 8} className="svg-note">{`${picketCount} pickets`}</text>}</g>;
        })}
      </svg>
      <div className="legend-row wrap-legend">{renaissance ? <><span><i className="legend-swatch reno-1x2-swatch" /> 1x2 7/8</span><span><i className="legend-swatch reno-2x2-swatch" /> 2x2 7/8 no groove</span><span><i className="legend-swatch reno-2x2-groove-swatch" /> 2x2 7/8 with groove</span><span><i className="legend-swatch picket-swatch" /> pickets</span></> : <><span><i className="legend-swatch receiver-swatch" /> receiver</span><span><i className="legend-swatch onebytwo-swatch" /> 1x2</span><span><i className="legend-swatch twobytwo-swatch" /> 2x2</span><span><i className="legend-swatch picket-swatch" /> pickets</span><span><i className="legend-swatch vgroove1-swatch" /> 1x2 v-groove</span><span><i className="legend-swatch vgroove2-swatch" /> 2x2 v-groove</span></>}</div>
    </div>
  );
}
function PatioPreview({ values }: { values: Record<string, string | number | boolean> }) {
  const width = Number(values.width ?? 21); const projection = Number(values.projection ?? 10); const structureType = String(values.structureType ?? 'attached'); const panelWidth = Number(values.panelWidth ?? 4); const fanBeam = String(values.fanBeam ?? 'none'); const fanBeamCount = Math.max(1, Number(values.fanBeamCount ?? 1)); const screenUnderneath = Boolean(values.screenUnderneath ?? false); const fanBeamPlacementMode = String(values.fanBeamPlacementMode ?? 'spread'); const layout = useMemo(() => buildPatioPanelLayout(width, fanBeam, panelWidth, fanBeamCount, fanBeamPlacementMode), [width, fanBeam, panelWidth, fanBeamCount, fanBeamPlacementMode]); const panelThickness = Number(values.panelThickness ?? 3); const upgraded3 = String(values.metalGauge ?? '.26') === '.32' && Number(values.foamDensity ?? 1) === 2; const supportBeamCount = (panelThickness === 3 && !upgraded3 && projection > 13) ? Math.ceil(projection / 13) - 1 : 0; const scale = Math.min(560 / Math.max(width, 1), 340 / Math.max(projection, 1)); const x0 = 48; const y0 = 48; const roofW = width * scale; const roofD = projection * scale; const beamStyle = screenUnderneath ? '3x3' : 'Atlas'; const autoPostCount = beamStyle === 'Atlas' ? (width <= 16 ? 2 : width <= 24 ? 3 : Math.max(4, Math.ceil((width - 2) / 8))) : (width <= 12 ? 2 : width <= 18 ? 3 : width <= 24 ? 4 : Math.max(4, Math.ceil((width - 2) / 6))); const frontPostCount = Math.max(2, Number(values.postCount ?? 0) > 0 ? Number(values.postCount) : autoPostCount); const postXs = Array.from({ length: frontPostCount }, (_, index) => x0 + (roofW * index) / Math.max(frontPostCount - 1, 1)); let cursor = x0;
  return <div className="visual-card"><div className="visual-header"><h3>Layout preview</h3><span>Scaled roof plan with panel bays, cut closures, fan-beam panels, front gutter, side fascia, beam lines, and post layout.</span></div><svg viewBox={`0 0 ${roofW + 130} ${roofD + 170}`} className="layout-svg">{Array.from({ length: Math.ceil(width) + 2 }, (_, index) => <line key={`px-${index}`} x1={x0 + index * scale} y1={y0 - 20} x2={x0 + index * scale} y2={y0 + roofD + 40} className="svg-grid" />)}{Array.from({ length: Math.ceil(projection) + 2 }, (_, index) => <line key={`py-${index}`} x1={x0 - 20} y1={y0 + index * scale} x2={x0 + roofW + 20} y2={y0 + index * scale} className="svg-grid" />)}<rect x={x0} y={y0} width={roofW} height={roofD} className="roof-box" rx="8" />{layout.pieces.map((piece, index) => { const pieceW = piece.widthFt * scale; const x = cursor; cursor += pieceW; const cls = piece.kind === 'fan-beam' ? 'fan-beam-panel' : piece.kind === 'cut' ? 'cut-panel' : 'roof-panel'; const note = piece.kind === 'fan-beam' ? piece.note ?? 'fan beam' : piece.kind === 'cut' ? `${piece.widthFt} ft cut` : `${piece.panelWidth} ft panel`; const fanLineX = piece.kind === 'fan-beam' ? piece.fanPlacement === 'female-offset' ? x + scale : piece.fanPlacement === 'male-offset' ? x + pieceW - scale : x + pieceW / 2 : null; return <g key={`panel-${index}`}><rect x={x} y={y0} width={pieceW} height={roofD} className={cls} /><line x1={x} y1={y0} x2={x} y2={y0 + roofD} className="roof-bay" />{fanLineX !== null && <line x1={fanLineX} y1={y0 + 8} x2={fanLineX} y2={y0 + roofD - 8} className="fan-axis-line" />}<text x={x + 6} y={y0 + 16} className="svg-note">{note}</text></g>; })}<line x1={x0 + roofW} y1={y0} x2={x0 + roofW} y2={y0 + roofD} className="roof-bay" /><line x1={x0} y1={y0 - 10} x2={x0 + roofW} y2={y0 - 10} className="trim-line" /><text x={x0 + 6} y={y0 - 14} className="svg-note">{structureType === 'attached' ? 'C-channel / house side' : 'Freestanding back edge'}</text><line x1={x0} y1={y0 + roofD + 10} x2={x0 + roofW} y2={y0 + roofD + 10} className="gutter-line" /><text x={x0 + 6} y={y0 + roofD + 26} className="svg-note">5 in gutter</text><line x1={x0 - 10} y1={y0} x2={x0 - 10} y2={y0 + roofD + 10} className="fascia-line" /><line x1={x0 + roofW + 10} y1={y0} x2={x0 + roofW + 10} y2={y0 + roofD + 10} className="fascia-line" /><line x1={x0} y1={y0 + roofD} x2={x0 + roofW} y2={y0 + roofD} className="beam-line" />{Array.from({ length: supportBeamCount }, (_, index) => { const y = y0 + (((index + 1) * roofD) / (supportBeamCount + 1)); return <line key={`support-${index}`} x1={x0} y1={y} x2={x0 + roofW} y2={y} className="beam-line support" />; })}{postXs.map((x, index) => <g key={`post-${index}`}><rect x={x - 6} y={y0 + roofD - 6} width="12" height="12" className="post-node" rx="2" /><text x={x - 10} y={y0 + roofD + 22} className="svg-note">P{index + 1}</text></g>)}<line x1={x0} y1={y0 + roofD + 40} x2={x0 + roofW} y2={y0 + roofD + 40} className="dimension-line" /><text x={x0 + roofW / 2 - 16} y={y0 + roofD + 34} className="svg-note">{feetAndInches(width)}</text><line x1={x0 - 28} y1={y0} x2={x0 - 28} y2={y0 + roofD} className="dimension-line" /><text x={x0 - 62} y={y0 + roofD / 2} className="svg-note">{feetAndInches(projection)}</text><text x={x0} y={y0 + roofD + 62} className="svg-note">{`${beamStyle} beam · ${frontPostCount} posts · ${supportBeamCount} intermediate beam(s)`}</text></svg><div className="legend-row wrap-legend"><span><i className="legend-swatch roof-panel-swatch" /> regular panel</span><span><i className="legend-swatch fan-panel-swatch" /> fan-beam panel</span><span><i className="legend-swatch cut-panel-swatch" /> cut closure panel</span><span><i className="legend-swatch beam-line-swatch" /> beam</span></div></div>;
}
export function LayoutPreview({ serviceSlug, values }: LayoutPreviewProps) { if (serviceSlug === 'decks') return <DeckPreview values={values} />; if (serviceSlug === 'patio-covers') return <PatioPreview values={values} />; if (serviceSlug === 'screen-rooms') return <ScreenPreview values={values} renaissance={false} />; return <ScreenPreview values={values} renaissance />; }
