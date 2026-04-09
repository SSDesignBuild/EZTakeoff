import React, { useMemo, useRef, useState } from 'react';
import { buildDeckModel } from '../lib/deckModel';
import { buildPatioPanelLayout } from '../lib/patioLayout';
import { parseSections } from '../lib/sectioning';
import { DeckEdgeSegment, DeckPoint, SectionConfig } from '../lib/types';

interface LayoutPreviewProps {
  serviceSlug: string;
  values: Record<string, string | number | boolean>;
  onValuesChange?: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>;
}

type DeckLayer = 'overview' | 'boards' | 'framing' | 'railing' | 'stairs';
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



function segmentDirection(segment: { start: DeckPoint; end: DeckPoint }) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  if (Math.abs(dx) < 1e-6) return 'vertical';
  if (Math.abs(dy) < 1e-6) return 'horizontal';
  return 'angled';
}

function cornerRole(points: DeckPoint[], index: number) {
  const prev = points[(index - 1 + points.length) % points.length];
  const curr = points[index];
  const next = points[(index + 1) % points.length];
  const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
  const orientation = polygonOrientation(points);
  const reflex = orientation === 'counterclockwise' ? cross < 0 : cross > 0;
  return reflex ? 'inside-corner' : 'corner';
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
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawingScale = Math.min(920 / Math.max(deck.width, 1), 620 / Math.max(deck.depth, 1));
  const planW = deck.width * drawingScale;
  const planH = deck.depth * drawingScale;
  const sheetW = Math.max(1380, planW + 300);
  const sheetH = Math.max(960, planH + 260);
  const padLeft = Math.max(150, (sheetW - planW) / 2);
  const padTop = Math.max(140, (sheetH - planH) / 2 + 20);
  const toSvg = (x: number, y: number) => ({ x: padLeft + (x - deck.minX) * drawingScale, y: padTop + (y - deck.minY) * drawingScale });
  const printPlan = () => {
    if (!svgRef.current) return;
    const win = window.open('', '_blank', 'width=1400,height=1000');
    if (!win) return;
    const svgMarkup = svgRef.current.outerHTML.replace('<svg', '<svg style="background:#ffffff"');
    win.document.write(`<!doctype html><html><head><title>Deck plan</title><style>@page{size:landscape;margin:0.35in} html,body{margin:0;background:#fff} body{padding:18px;font-family:Inter,Arial,sans-serif;color:#111} .sheet{display:flex;justify-content:center;align-items:flex-start} svg{width:100%;height:auto;max-width:1500px;background:#fff}</style></head><body><div class="sheet">${svgMarkup}</div><script>window.onload=()=>setTimeout(()=>window.print(),150);</script></body></html>`);
    win.document.close();
  };
  const pointString = deck.points.map((p) => `${toSvg(p.x, p.y).x},${toSvg(p.x, p.y).y}`).join(' ');
  const showBoards = layer === 'overview' || layer === 'boards';
  const showFraming = layer === 'overview' || layer === 'framing';
  const showRailing = layer === 'overview' || layer === 'railing';
  const showStairs = layer === 'overview' || layer === 'stairs';
  const showExploded = false;
  const boardScanlines = deck.boardRun === 'width'
    ? Array.from({ length: Math.max(1, Math.floor(deck.depth / 0.47)) }, (_, i) => deck.minY + 0.22 + i * 0.47)
    : Array.from({ length: Math.max(1, Math.floor(deck.width / 0.47)) }, (_, i) => deck.minX + 0.22 + i * 0.47);
  const joistScanlines = deck.joistDirection === 'vertical'
    ? Array.from({ length: Math.max(1, Math.floor(deck.width / 1) + 1) }, (_, i) => deck.minX + i)
    : Array.from({ length: Math.max(1, Math.floor(deck.depth / 1) + 1) }, (_, i) => deck.minY + i);
  const stairStart = deck.stairPlacement.start ? toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y) : null;
  const stairEnd = deck.stairPlacement.end ? toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y) : null;
  const stairSegment = deck.stairPlacement.edgeIndex !== null ? deck.edgeSegments[deck.stairPlacement.edgeIndex] : null;
  const stairNormal = stairSegment ? outwardNormal(stairSegment, deck.points) : { x: 0, y: 1 };
  const stairNx = stairNormal.x * drawingScale;
  const stairNy = stairNormal.y * drawingScale;
  const stairLen = Math.hypot(stairNx, stairNy) || 1;
  const railingSegments = railSegmentsForDeck(deck).map((segment, index) => ({
    ...segment,
    direction: segmentDirection(segment),
    index,
  }));
  const topLevelSegments = railingSegments.filter((segment) => segment.kind === 'deck');
  const stairSideSegments = railingSegments.filter((segment) => segment.kind === 'stair-side');
  const topLevelSectionMix = topLevelSegments.reduce((sum, seg) => {
    const target = seg.length <= 6.15 ? { six: 1, eight: 0 } : seg.length <= 12.15 ? { six: 2, eight: 0 } : seg.length <= 14.15 ? { six: 1, eight: 1 } : { six: Math.ceil(seg.length / 6), eight: 0 };
    return { six: sum.six + target.six, eight: sum.eight + target.eight };
  }, { six: 0, eight: 0 });
  const stairSectionCount = stairSideSegments.reduce((sum, seg) => sum + Math.max(1, Math.ceil(seg.length / 6)), 0);
  const topLevelPosts = new Map<string, { x: number; y: number; role: string }>();
  const approxEq = (a: number, b: number) => Math.abs(a - b) < 0.12;
  const findVertexIndex = (point: DeckPoint) => deck.points.findIndex((candidate) => approxEq(candidate.x, point.x) && approxEq(candidate.y, point.y));
  topLevelSegments.forEach((segment) => {
    const count = Math.max(2, Math.ceil(segment.length / 6) + 1);
    for (let idx = 0; idx < count; idx += 1) {
      const ratio = count === 1 ? 0 : idx / (count - 1);
      const x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
      const y = segment.start.y + (segment.end.y - segment.start.y) * ratio;
      const key = `${Math.round(x * 12)}-${Math.round(y * 12)}`;
      let role = 'inline-post';
      if (idx === 0 || idx === count - 1) {
        const vertexIndex = idx === 0 ? findVertexIndex(segment.start) : findVertexIndex(segment.end);
        if (vertexIndex >= 0) role = cornerRole(deck.points, vertexIndex);
        else role = 'level-post';
      }
      topLevelPosts.set(key, { x, y, role: role === 'corner' ? 'corner-post' : role === 'inside-corner' ? 'inside-corner-post' : role });
    }
  });
  const stairPosts = new Map<string, { x: number; y: number; role: string }>();
  stairSideSegments.forEach((segment) => {
    [segment.start, segment.end].forEach((point) => {
      const key = `${Math.round(point.x * 12)}-${Math.round(point.y * 12)}`;
      stairPosts.set(key, { x: point.x, y: point.y, role: 'stair-post' });
    });
  });
  let boardIndex = 0;
  let joistIndex = 0;
  return (
    <div className="visual-card cad-card">
      <div className="visual-header">
        <div>
          <h3>Deck plan layout</h3>
          <span>Scaled plan intended to read like a schematic sheet: board seams, doubled bands, beam ply overlaps, post layout, stair geometry, and named railing components.</span>
        </div>
        <div className="preview-toolbar">{(['overview', 'boards', 'framing', 'railing', 'stairs'] as DeckLayer[]).map((item) => <button key={item} type="button" className={layer === item ? 'ghost-btn small-btn active-chip' : 'ghost-btn small-btn'} onClick={() => setLayer(item)}>{item}</button>)}<button type="button" className="ghost-btn small-btn" onClick={() => setZoom((current) => Math.max(0.8, Number((current - 0.15).toFixed(2))))}>−</button><button type="button" className="ghost-btn small-btn" onClick={() => setZoom((current) => Math.min(2.5, Number((current + 0.15).toFixed(2))))}>+</button><button type="button" className="ghost-btn small-btn" onClick={printPlan}>Print plan</button></div>
      </div>
      <div className="zoom-shell"><svg ref={svgRef} viewBox={`0 0 ${sheetW} ${sheetH}`} className="layout-svg cad-svg" style={{ transform: `scale(${zoom})`, transformOrigin: "center top" }}>
        <rect x="12" y="12" width={sheetW - 24} height={sheetH - 24} className="sheet-border" rx="10" />
        <rect x="26" y="26" width={sheetW - 52} height={sheetH - 52} className="sheet-border inner" rx="8" />
        <text x={padLeft} y="48" className="sheet-title">Plan view framing schematic</text>
        <text x={padLeft} y="68" className="sheet-subtitle">S&S Design Build · double band framing standard · scale approx. 1" = 1'-0"</text>
        <text x={sheetW - 260} y="48" className="sheet-note">Boards: {deck.boardRun === 'width' ? 'parallel to house' : 'perpendicular to house'}</text>
        <text x={sheetW - 260} y="68" className="sheet-note">Joists: {deck.joistDirection === 'vertical' ? 'perpendicular to house' : 'parallel to house'} · {deck.joistSize}</text>

        {Array.from({ length: Math.floor(deck.width) + 1 }, (_, i) => <line key={`gx-${i}`} x1={padLeft + i * drawingScale} y1={padTop - 16} x2={padLeft + i * drawingScale} y2={padTop + deck.depth * drawingScale + 16} className="svg-grid" />)}
        {Array.from({ length: Math.floor(deck.depth) + 1 }, (_, i) => <line key={`gy-${i}`} x1={padLeft - 16} y1={padTop + i * drawingScale} x2={padLeft + deck.width * drawingScale + 16} y2={padTop + i * drawingScale} className="svg-grid" />)}

        <polygon points={pointString} className="deck-polygon muted-fill" />
        <polygon points={pointString} className="deck-outline" />

        {showBoards && boardScanlines.map((value) => deck.boardRun === 'width'
          ? scanlineIntersections(deck.points, 'horizontal', value).map((pair, idx) => {
              boardIndex += 1;
              const n = boardIndex;
              return <g key={`b-${idx}-${value}`} onClick={() => setInspect({ title: `Deck board ${n}`, detail: `${feetAndInches(pair.end - pair.start)} board run. Seams are staggered in the print layout so crews can follow stock breaks.` })}>{staggeredSegments(pair.end - pair.start, 20, (n % 4) * 4).map((seg, sidx) => { const a = toSvg(pair.start + seg.start, value); const b = toSvg(pair.start + seg.end, value); return <g key={`bs-${sidx}`}><rect x={Math.min(a.x, b.x)} y={a.y - Math.max(4, drawingScale * 0.18)} width={Math.abs(b.x - a.x)} height={Math.max(8, drawingScale * 0.36)} className="deck-board-strip" rx={2} />{seg.end < (pair.end - pair.start) - 0.05 && <line x1={b.x} y1={b.y - 6} x2={b.x} y2={b.y + 6} className="seam-tick" />}</g>; })}{showExploded && n % 8 === 0 && <text x={toSvg((pair.start + pair.end) / 2, value).x - 10} y={toSvg((pair.start + pair.end) / 2, value).y - 5} className="svg-note">B{n}</text>}</g>;
            })
          : scanlineIntersections(deck.points, 'vertical', value).map((pair, idx) => {
              boardIndex += 1;
              const n = boardIndex;
              return <g key={`b-${idx}-${value}`} onClick={() => setInspect({ title: `Deck board ${n}`, detail: `${feetAndInches(pair.end - pair.start)} board run. Seams are staggered in the print layout so crews can follow stock breaks.` })}>{staggeredSegments(pair.end - pair.start, 20, (n % 4) * 4).map((seg, sidx) => { const a = toSvg(value, pair.start + seg.start); const b = toSvg(value, pair.start + seg.end); return <g key={`bs-${sidx}`}><rect x={Math.min(a.x, b.x)} y={a.y - Math.max(4, drawingScale * 0.18)} width={Math.abs(b.x - a.x)} height={Math.max(8, drawingScale * 0.36)} className="deck-board-strip" rx={2} />{seg.end < (pair.end - pair.start) - 0.05 && <line x1={b.x - 6} y1={b.y} x2={b.x + 6} y2={b.y} className="seam-tick" />}</g>; })}{showExploded && n % 8 === 0 && <text x={toSvg(value, (pair.start + pair.end) / 2).x + 6} y={toSvg(value, (pair.start + pair.end) / 2).y} className="svg-note">B{n}</text>}</g>;
            }))}

        {showFraming && joistScanlines.map((value) => deck.joistDirection === 'vertical'
          ? scanlineIntersections(deck.points, 'vertical', value).map((pair, idx) => { joistIndex += 1; const a=toSvg(value,pair.start); const b=toSvg(value,pair.end); const n=joistIndex; return <g key={`j-${idx}-${value}`} onClick={() => setInspect({ title:`Joist ${n}`, detail:`${feetAndInches(pair.end-pair.start)} ${deck.joistSize} joist at 12 in. O.C.` })}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="joist-line" />{showExploded && n % 3 === 1 && <text x={a.x + 6} y={(a.y + b.y) / 2} className="svg-note">J{n}</text>}</g>; })
          : scanlineIntersections(deck.points, 'horizontal', value).map((pair, idx) => { joistIndex += 1; const a=toSvg(pair.start,value); const b=toSvg(pair.end,value); const n=joistIndex; return <g key={`j-${idx}-${value}`} onClick={() => setInspect({ title:`Joist ${n}`, detail:`${feetAndInches(pair.end-pair.start)} ${deck.joistSize} joist at 12 in. O.C.` })}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="joist-line" />{showExploded && n % 3 === 1 && <text x={(a.x+b.x)/2 - 10} y={a.y - 6} className="svg-note">J{n}</text>}</g>; }))}

        {!deck.isFreestanding && <><line x1={padLeft} y1={padTop - 28} x2={padLeft + deck.width * drawingScale} y2={padTop - 28} className="house-line" /><text x={padLeft} y={padTop - 36} className="svg-note">House / ledger side</text></>}

        {showFraming && deck.edgeSegments.map((segment) => {
          const outer={...offsetSegment(segment,0.05,deck.points),length:segment.length} as DeckEdgeSegment;
          const inner={...offsetSegment(segment,-0.22,deck.points),length:segment.length} as DeckEdgeSegment;
          return <g key={`bb-${segment.index}`} onClick={() => setInspect({ title:`Double band run ${segment.index+1}`, detail:`${feetAndInches(segment.length)} run with staggered double-band plies.` })}>{staggeredSegments(segment.length,20,0).map((seg,sidx)=>{const s=pointAlong(outer,seg.start); const e=pointAlong(outer,seg.end); const a=toSvg(s.x,s.y); const b=toSvg(e.x,e.y); return <g key={`a-${sidx}`}><rect x={Math.min(a.x,b.x)-1.5} y={Math.min(a.y,b.y)-3} width={Math.max(Math.abs(b.x-a.x),3)} height={segment.orientation === 'horizontal' ? 6 : Math.max(Math.abs(b.y-a.y),3)} className="double-band-rect" rx={1.5} />{seg.end < segment.length - 0.05 && <line x1={b.x - 5} y1={b.y - 5} x2={b.x + 5} y2={b.y + 5} className="seam-tick" />}</g>;})}{staggeredSegments(segment.length,20,10).map((seg,sidx)=>{const s=pointAlong(inner,seg.start); const e=pointAlong(inner,seg.end); const a=toSvg(s.x,s.y); const b=toSvg(e.x,e.y); return <g key={`b-${sidx}`}><rect x={Math.min(a.x,b.x)-1.5} y={Math.min(a.y,b.y)-3} width={Math.max(Math.abs(b.x-a.x),3)} height={segment.orientation === 'horizontal' ? 6 : Math.max(Math.abs(b.y-a.y),3)} className="double-band-rect secondary" rx={1.5} />{seg.end < segment.length - 0.05 && <line x1={b.x - 5} y1={b.y + 5} x2={b.x + 5} y2={b.y - 5} className="seam-tick" />}</g>;})}{showExploded && <text x={(toSvg(segment.start.x,segment.start.y).x + toSvg(segment.end.x,segment.end.y).x)/2 - 18} y={(toSvg(segment.start.x,segment.start.y).y + toSvg(segment.end.x,segment.end.y).y)/2 - 12} className="svg-note">BB{segment.index+1}</text>}</g>;
        })}

        {showFraming && deck.beamLines.map((beam,index)=><g key={`bm-${index}`}>{beam.segments.map((segment,segIndex)=>{const y=toSvg(segment.startX,beam.y).y; const plan=stockPlan(segment.length); const mid=(toSvg(segment.startX,beam.y).x + toSvg(segment.endX,beam.y).x)/2; return <g key={`seg-${segIndex}`} onClick={() => setInspect({ title:`Beam ${index+1} segment ${segIndex+1}`, detail:`${feetAndInches(segment.length)} beam at ${feetAndInches(beam.offsetFromHouse)} off the house. Stock overlap plan: ${plan.map(v=>`${v}'`).join(' + ')}` })}>{staggeredSegments(segment.length,20,0).map((splice,sidx)=>{const x1=toSvg(segment.startX+splice.start,beam.y).x; const x2=toSvg(segment.startX+splice.end,beam.y).x; return <g key={`sa-${sidx}`}><rect x={Math.min(x1,x2)} y={y-7} width={Math.abs(x2-x1)} height={6} className="beam-rect primary" rx={1.5} />{splice.end < segment.length - 0.05 && <line x1={x2} y1={y-8} x2={x2} y2={y} className="seam-tick" />}</g>;})}{staggeredSegments(segment.length,20,10).map((splice,sidx)=>{const x1=toSvg(segment.startX+splice.start,beam.y).x; const x2=toSvg(segment.startX+splice.end,beam.y).x; return <g key={`sb-${sidx}`}><rect x={Math.min(x1,x2)} y={y-1} width={Math.abs(x2-x1)} height={6} className="beam-rect secondary" rx={1.5} />{splice.end < segment.length - 0.05 && <line x1={x2} y1={y} x2={x2} y2={y+8} className="seam-tick" />}</g>;})}{showExploded && <text x={mid-18} y={y-16} className="svg-note">BM{index+1}.{segIndex+1}</text>}</g>;})}{beam.postXs.map((postX,postIndex)=>{const p=toSvg(postX,beam.y); return <g key={`p-${postX}`} onClick={() => setInspect({ title:`Beam post ${index+1}.${postIndex+1}`, detail:`Post sits under a notched beam seat at ${feetAndInches(postX-deck.minX)} from the left reference and ${feetAndInches(beam.offsetFromHouse)} off the house.` })}><g><rect x={p.x-7} y={p.y+1} width="14" height="18" className={beam.lockedPostXs.includes(postX)?'post-node locked-post':'post-node'} rx="1.5" /><rect x={p.x-7} y={p.y-6} width="7" height="7" className="post-notch-seat" /></g>{showExploded && <text x={p.x+8} y={p.y-10} className="svg-note">P{index+1}.{postIndex+1}</text>}</g>;})}</g>)}

        {showRailing && railingSegments.map((segment)=>{const fakeEdge:DeckEdgeSegment={start:segment.start,end:segment.end,length:segment.length,orientation:'horizontal',index:segment.index}; const rail=offsetSegment(fakeEdge,segment.kind==='stair-side'?0.28:0.34,deck.points); const a=toSvg(rail.start.x,rail.start.y); const b=toSvg(rail.end.x,rail.end.y); return <g key={`r-${segment.index}`} onClick={() => setInspect({ title: segment.kind === 'stair-side' ? 'Angled railing section' : segment.direction === 'angled' ? 'Angled railing section' : 'Level railing section', detail: `${feetAndInches(segment.length)} ${segment.kind === 'stair-side' ? 'stair-side' : 'top-level'} railing run.` })}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={segment.kind==='stair-side'?'stair-rail-line':'railing-line'} /></g>;})}

        {showRailing && [...topLevelPosts.values()].map((post, idx) => { const p = toSvg(post.x, post.y); const label = post.role === 'corner-post' ? 'CP' : post.role === 'inside-corner-post' ? 'ICP' : post.role === 'inline-post' ? 'IP' : 'LP'; return <g key={`trl-${idx}`} onClick={() => setInspect({ title: post.role.replace(/-/g,' '), detail: `${post.role === 'corner-post' ? 'Outside corner' : post.role === 'inside-corner-post' ? 'Inside corner' : post.role === 'inline-post' ? 'Inline' : 'Level'} top-level railing post.` })}><rect x={p.x-4.5} y={p.y-4.5} width="9" height="9" className="railing-post-node" rx="1.5" />{showExploded && <text x={p.x + 6} y={p.y - 6} className="svg-note">{label}</text>}</g>; })}
        {showRailing && [...stairPosts.values()].map((post, idx) => { const p = toSvg(post.x, post.y); return <g key={`stp-${idx}`} onClick={() => setInspect({ title: 'Stair post', detail: 'Stair-side railing post.' })}><rect x={p.x-5} y={p.y-5} width="10" height="10" className="stair-post-node" rx="1.5" />{showExploded && <text x={p.x + 6} y={p.y - 6} className="svg-note">SP</text>}</g>; })}

        {showStairs && stairStart && stairEnd && <><line x1={stairStart.x} y1={stairStart.y} x2={stairEnd.x} y2={stairEnd.y} className="stair-edge-highlight" />{Array.from({length:Math.max(deck.stairStringers,0)},(_,index)=>{const ratio=deck.stairStringers<=1?0.5:index/(deck.stairStringers-1); const sx=stairStart.x + (stairEnd.x-stairStart.x)*ratio; const sy=stairStart.y + (stairEnd.y-stairStart.y)*ratio; const ex=sx + stairNx*deck.stairRunFt; const ey=sy + stairNy*deck.stairRunFt; return <g key={`s-${index}`} onClick={() => setInspect({ title:`Stringer ${index+1}`, detail:`${feetAndInches(deck.stairStringerLength)} 2x12 stringer serving ${deck.stairRisers} risers and ${deck.stairTreadsPerRun} treads.` })}><line x1={sx} y1={sy} x2={ex} y2={ey} className="stringer-line" />{showExploded && <text x={sx+5} y={sy+13} className="svg-note">S{index+1}</text>}</g>;})}{Array.from({length:Math.max(deck.stairTreadsPerRun,0)},(_,index)=>{const offset=((index+1)*stairLen*deck.stairRunFt)/Math.max(deck.stairTreadsPerRun+1,1); return <line key={`t-${index}`} x1={stairStart.x + (stairNx/stairLen)*offset} y1={stairStart.y + (stairNy/stairLen)*offset} x2={stairEnd.x + (stairNx/stairLen)*offset} y2={stairEnd.y + (stairNy/stairLen)*offset} className="tread-line" />;})}<text x={Math.min(stairStart.x,stairEnd.x)+10} y={Math.min(stairStart.y,stairEnd.y)-14} className="svg-note strong-note">{`${deck.stairRisers} risers · ${deck.stairTreadsPerRun} treads · ${deck.stairStringers} stringers`}</text></>}

        {deck.edgeSegments.map((segment) => { const a = toSvg(segment.start.x, segment.start.y); const b = toSvg(segment.end.x, segment.end.y); const dimOffset = segment.orientation === 'horizontal' ? (segment.start.y === deck.minY ? -44 : 44) : (segment.start.x === deck.minX ? -44 : 44); const tx = (a.x + b.x) / 2 + (segment.orientation === 'vertical' ? dimOffset : 0); const ty = (a.y + b.y) / 2 + (segment.orientation === 'horizontal' ? dimOffset : 0); return <g key={`dim-seg-${segment.index}`}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="segment-dimension" /><text x={tx - 12} y={ty} className="svg-note">{feetAndInches(segment.length)}</text></g>; })}

        <line x1={padLeft} y1={padTop + deck.depth * drawingScale + 40} x2={padLeft + deck.width * drawingScale} y2={padTop + deck.depth * drawingScale + 40} className="dimension-line" />
        <text x={padLeft + (deck.width * drawingScale)/2 - 18} y={padTop + deck.depth * drawingScale + 32} className="svg-note">{feetAndInches(deck.width)}</text>
        <line x1={padLeft - 40} y1={padTop} x2={padLeft - 40} y2={padTop + deck.depth * drawingScale} className="dimension-line" />
        <text x={padLeft - 78} y={padTop + (deck.depth * drawingScale)/2} className="svg-note">{feetAndInches(deck.depth)}</text>
      </svg></div>
      {inspect && <div className="callout-box preview-inspect"><h4>{inspect.title}</h4><p className="muted">{inspect.detail}</p></div>}
      <div className="callout-box preview-inspect"><h4>Railing naming</h4><p className="muted">Level railing, angled railing, corner post, inside corner post, inline post, level post, and stair post are now separated in the plan logic so the printed schematic and material list can speak the same language.</p></div>

      <div className="legend-row wrap-legend"><span><i className="legend-swatch deck-board-swatch" /> deck boards</span><span><i className="legend-swatch joist-line-swatch" /> joists</span><span><i className="legend-swatch beam-line-swatch" /> doubled beam</span><span><i className="legend-swatch band-line-swatch" /> double band</span><span><i className="legend-swatch railing-line-swatch" /> level railing</span><span><i className="legend-swatch stair-line-swatch" /> stair / angled railing</span></div>
      <div className="legend-row wrap-legend"><span><i className="legend-swatch post-swatch" /> beam post</span><span><i className="legend-swatch railing-post-swatch" /> level / corner / inline post</span><span><i className="legend-swatch stair-post-swatch" /> stair post</span><span><i className="legend-swatch seam-swatch" /> staggered seam</span></div>
      <div className="legend-row wrap-legend"><span><strong>Top-level railing:</strong> {topLevelSectionMix.six} × 6' + {topLevelSectionMix.eight} × 8'</span><span><strong>Angled / stair railing:</strong> {stairSectionCount} section(s)</span><span><strong>Top-level posts:</strong> {[...topLevelPosts.values()].length}</span><span><strong>Stair posts:</strong> {[...stairPosts.values()].length}</span></div>
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
function PatioPreview({ values, onValuesChange }: { values: Record<string, string | number | boolean>; onValuesChange?: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>> }) {
  const width = Number(values.width ?? 21);
  const projection = Number(values.projection ?? 10);
  const structureType = String(values.structureType ?? 'attached');
  const panelWidth = Number(values.panelWidth ?? 4);
  const fanBeam = String(values.fanBeam ?? 'none');
  const fanBeamCount = Math.max(1, Number(values.fanBeamCount ?? 1));
  const fanBeamPlacementMode = String(values.fanBeamPlacementMode ?? 'spread');
  const fanShift = Number(values.fanBeamShift ?? 0);
  const screenUnderneath = Boolean(values.screenUnderneath ?? false);
  const layout = useMemo(() => buildPatioPanelLayout(width, fanBeam, panelWidth, fanBeamCount, fanBeamPlacementMode, fanShift), [width, fanBeam, panelWidth, fanBeamCount, fanBeamPlacementMode, fanShift]);
  const panelThickness = Number(values.panelThickness ?? 3);
  const upgraded3 = String(values.metalGauge ?? '.26') === '.32' && Number(values.foamDensity ?? 1) === 2;
  const extraBeams = Math.max(0, Number(values.extraBeamCount ?? 0));
  const supportBeamCount = ((panelThickness === 3 && !upgraded3 && projection > 13) ? Math.ceil(projection / 13) - 1 : 0) + extraBeams;
  const scale = Math.min(560 / Math.max(width, 1), 340 / Math.max(projection, 1));
  const x0 = 48;
  const y0 = 48;
  const roofW = width * scale;
  const roofD = projection * scale;
  const beamStyle = screenUnderneath ? '3x3' : 'Atlas';
  const frontOverhang = Number(values.frontOverhang ?? 1);
  const beamLeft = x0 + frontOverhang * scale;
  const beamRight = x0 + roofW - frontOverhang * scale;
  const spanWidth = Math.max(0, width - frontOverhang * 2);
  const autoPostCount = beamStyle === 'Atlas' ? (spanWidth <= 14 ? 2 : spanWidth <= 22 ? 3 : Math.max(4, Math.ceil(spanWidth / 8))) : (spanWidth <= 10 ? 2 : spanWidth <= 16 ? 3 : spanWidth <= 22 ? 4 : Math.max(4, Math.ceil(spanWidth / 6)));
  const frontPostCount = Math.max(2, Number(values.postCount ?? 0) > 0 ? Number(values.postCount) : autoPostCount);
  const postXs = Array.from({ length: frontPostCount }, (_, index) => beamLeft + ((beamRight - beamLeft) * index) / Math.max(frontPostCount - 1, 1));
  const supportYs = Array.from({ length: supportBeamCount }, (_, index) => y0 + (((index + 1) * roofD) / (supportBeamCount + 1)));
  let cursor = x0;

  const shiftFan = (dir: -1 | 1) => {
    if (!onValuesChange) return;
    const count = Math.max(layout.fanOptions.length, 1);
    onValuesChange((current) => ({ ...current, fanBeamShift: (Number(current.fanBeamShift ?? 0) + dir + count) % count }));
  };

  return <div className="visual-card">
    <div className="visual-header">
      <div>
        <h3>Layout preview</h3>
        <span>Scaled roof plan with beam line, support beams, post layout, gutter, fascia, and strategic fan-beam placement.</span>
      </div>
      {fanBeam !== 'none' && onValuesChange && <div className="preview-toolbar"><button type="button" className="ghost-btn small-btn" onClick={() => shiftFan(-1)}>← Fan beam</button><button type="button" className="ghost-btn small-btn" onClick={() => shiftFan(1)}>Fan beam →</button></div>}
    </div>
    <svg viewBox={`0 0 ${roofW + 130} ${roofD + 180}`} className="layout-svg patio-sheet-svg">
      {Array.from({ length: Math.ceil(width) + 2 }, (_, index) => <line key={`px-${index}`} x1={x0 + index * scale} y1={y0 - 20} x2={x0 + index * scale} y2={y0 + roofD + 40} className="svg-grid" />)}
      {Array.from({ length: Math.ceil(projection) + 2 }, (_, index) => <line key={`py-${index}`} x1={x0 - 20} y1={y0 + index * scale} x2={x0 + roofW + 20} y2={y0 + index * scale} className="svg-grid" />)}
      <rect x={x0} y={y0} width={roofW} height={roofD} className="roof-box" rx="8" />
      {layout.pieces.map((piece, index) => {
        const pieceW = piece.widthFt * scale;
        const x = cursor;
        cursor += pieceW;
        const cls = piece.kind === 'fan-beam' ? 'fan-beam-panel' : piece.kind === 'cut' ? 'cut-panel' : 'roof-panel';
        const note = piece.kind === 'fan-beam' ? piece.note ?? 'fan beam' : piece.kind === 'cut' ? `${piece.widthFt} ft cut` : `${piece.panelWidth} ft panel`;
        const fanLineX = piece.kind === 'fan-beam' ? piece.fanPlacement === 'female-offset' ? x + scale : piece.fanPlacement === 'male-offset' ? x + pieceW - scale : x + pieceW / 2 : null;
        return <g key={`panel-${index}`}>
          <rect x={x} y={y0} width={pieceW} height={roofD} className={cls} />
          <line x1={x} y1={y0} x2={x} y2={y0 + roofD} className="roof-bay" />
          {fanLineX !== null && <line x1={fanLineX} y1={y0 + 8} x2={fanLineX} y2={y0 + roofD - 8} className="fan-axis-line" />}
          <text x={x + 6} y={y0 + 16} className="svg-note">{note}</text>
        </g>;
      })}
      <line x1={x0 + roofW} y1={y0} x2={x0 + roofW} y2={y0 + roofD} className="roof-bay" />
      <line x1={x0} y1={y0 - 10} x2={x0 + roofW} y2={y0 - 10} className="trim-line" />
      <text x={x0 + 6} y={y0 - 14} className="svg-note">{structureType === 'attached' ? 'C-channel / house side' : 'Freestanding back edge'}</text>
      <line x1={x0} y1={y0 + roofD + 10} x2={x0 + roofW} y2={y0 + roofD + 10} className="gutter-line" />
      <text x={x0 + 6} y={y0 + roofD + 26} className="svg-note">5 in gutter</text>
      <line x1={x0 - 10} y1={y0} x2={x0 - 10} y2={y0 + roofD + 10} className="fascia-line" />
      <line x1={x0 + roofW + 10} y1={y0} x2={x0 + roofW + 10} y2={y0 + roofD + 10} className="fascia-line" />
      <line x1={beamLeft} y1={y0 + roofD} x2={beamRight} y2={y0 + roofD} className="beam-line" />
      {supportYs.map((y, index) => <line key={`support-${index}`} x1={beamLeft} y1={y} x2={beamRight} y2={y} className="beam-line support" />)}
      {postXs.map((x, index) => <g key={`post-${index}`}><rect x={x - 6} y={y0 + roofD - 6} width="12" height="12" className="post-node" rx="2" /><text x={x - 10} y={y0 + roofD + 22} className="svg-note">P{index + 1}</text></g>)}
      <line x1={x0} y1={y0 + roofD + 40} x2={x0 + roofW} y2={y0 + roofD + 40} className="dimension-line" />
      <text x={x0 + roofW / 2 - 16} y={y0 + roofD + 34} className="svg-note">{feetAndInches(width)}</text>
      <line x1={x0 - 28} y1={y0} x2={x0 - 28} y2={y0 + roofD} className="dimension-line" />
      <text x={x0 - 62} y={y0 + roofD / 2} className="svg-note">{feetAndInches(projection)}</text>
      <text x={x0} y={y0 + roofD + 62} className="svg-note">{`${beamStyle} beam · ${frontPostCount} posts · ${supportBeamCount} intermediate beam(s) · ${frontOverhang}' overhang each side`}</text>
    </svg>
    <div className="legend-row wrap-legend"><span><i className="legend-swatch roof-panel-swatch" /> regular panel</span><span><i className="legend-swatch fan-panel-swatch" /> fan-beam panel</span><span><i className="legend-swatch cut-panel-swatch" /> cut closure panel</span><span><i className="legend-swatch beam-line-swatch" /> beam</span></div>
  </div>;
}

export function LayoutPreview({ serviceSlug, values, onValuesChange }: LayoutPreviewProps) { if (serviceSlug === 'decks') return <DeckPreview values={values} />; if (serviceSlug === 'patio-covers') return <PatioPreview values={values} onValuesChange={onValuesChange} />; if (serviceSlug === 'screen-rooms') return <ScreenPreview values={values} renaissance={false} />; return <ScreenPreview values={values} renaissance />; }
