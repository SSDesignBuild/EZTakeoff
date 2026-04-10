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


function symmetricPostOffsets(length: number, maxSection = 8) {
  const sectionCount = Math.max(1, Math.ceil(length / maxSection));
  return Array.from({ length: Math.max(0, sectionCount - 1) }, (_, index) => ((index + 1) * length) / sectionCount);
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

function pointKey(point: DeckPoint) {
  return `${Math.round(point.x * 12)}-${Math.round(point.y * 12)}`;
}

function directionBetween(start: DeckPoint, end: DeckPoint) {
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  return { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
}

type RailingNodeKind = 'corner' | 'inside-corner' | 'inline' | 'level-end' | 'stair-end' | 'stair-inline';
type RailingNode = { point: DeckPoint; kind: RailingNodeKind; detail: string };

function buildRailingNodes(deck: ReturnType<typeof buildDeckModel>) {
  const topRuns = railSegmentsForDeck(deck).filter((segment) => segment.kind === 'deck');
  const stairRuns = railSegmentsForDeck(deck).filter((segment) => segment.kind === 'stair-side');
  const orientation = polygonOrientation(deck.points);
  const reflexVertices = new Set<number>();
  deck.points.forEach((_, index) => {
    const prev = deck.points[(index - 1 + deck.points.length) % deck.points.length];
    const curr = deck.points[index];
    const next = deck.points[(index + 1) % deck.points.length];
    const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    if ((orientation === 'counterclockwise' && cross < 0) || (orientation === 'clockwise' && cross > 0)) reflexVertices.add(index);
  });
  const vertexIndexByKey = new Map(deck.points.map((point, index) => [pointKey(point), index] as const));
  const nodeMap = new Map<string, { point: DeckPoint; directions: { x: number; y: number }[] }>();
  const addNode = (point: DeckPoint, direction: { x: number; y: number }) => {
    const key = pointKey(point);
    const existing = nodeMap.get(key);
    if (existing) existing.directions.push(direction);
    else nodeMap.set(key, { point, directions: [direction] });
  };
  topRuns.forEach((segment) => {
    addNode(segment.start, directionBetween(segment.start, segment.end));
    addNode(segment.end, directionBetween(segment.end, segment.start));
  });
  const nodes: RailingNode[] = [];
  nodeMap.forEach((entry, key) => {
    const vertexIndex = vertexIndexByKey.get(key);
    let kind: RailingNodeKind = 'inline';
    if (entry.directions.length <= 1) kind = 'level-end';
    else {
      const [a, b] = entry.directions;
      const cross = Math.abs(a.x * b.y - a.y * b.x);
      if (vertexIndex !== undefined && reflexVertices.has(vertexIndex)) kind = 'inside-corner';
      else if (cross > 0.2) kind = 'corner';
      else kind = 'inline';
    }
    const detail = kind === 'inside-corner' ? 'Inside corner post' : kind === 'corner' ? 'Corner post' : kind === 'level-end' ? 'Level end post' : 'Inline post';
    nodes.push({ point: entry.point, kind, detail });
  });
  topRuns.forEach((segment) => {
    symmetricPostOffsets(segment.length, 8).forEach((distance) => {
      const point = pointAlong({ start: segment.start, end: segment.end, length: segment.length, orientation: 'angled', index: -1 }, distance);
      nodes.push({ point, kind: 'inline', detail: 'Inline post' });
    });
  });
  stairRuns.forEach((segment) => {
    nodes.push({ point: segment.start, kind: 'stair-end', detail: 'Stair end post' });
    nodes.push({ point: segment.end, kind: 'stair-end', detail: 'Stair end post' });
    symmetricPostOffsets(segment.length, 8).forEach((distance) => {
      const point = pointAlong({ start: segment.start, end: segment.end, length: segment.length, orientation: 'angled', index: -1 }, distance);
      nodes.push({ point, kind: 'stair-inline', detail: 'Stair inline post' });
    });
  });
  return nodes;
}

function DeckPreview({ values }: { values: Record<string, string | number | boolean> }) {
  const deck = buildDeckModel(values);
  const [layer, setLayer] = useState<DeckLayer>('framing');
  const [inspect, setInspect] = useState<InspectMember | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<HTMLDivElement | null>(null);
  const dragPanRef = useRef<{ active: boolean; x: number; y: number; left: number; top: number }>({ active: false, x: 0, y: 0, left: 0, top: 0 });

  const widthFt = Math.max(deck.width, 1);
  const depthFt = Math.max(deck.depth, 1);
  const titleBlockW = 430;
  const titleBlockH = 164;
  const sheetMarginX = 54;
  const sheetMarginTop = 110;
  const sheetMarginBottom = 54;
  const planScaleW = 1180;
  const planScaleH = 720;
  const scale = Math.min(planScaleW / widthFt, planScaleH / depthFt);
  const planW = widthFt * scale;
  const planH = depthFt * scale;
  const sheetW = Math.max(1580, planW + sheetMarginX * 2);
  const sheetH = Math.max(1260, planH + titleBlockH + sheetMarginTop + sheetMarginBottom + 90);
  const planX = (sheetW - planW) / 2;
  const planY = sheetMarginTop;
  const toSvg = (x: number, y: number) => ({ x: planX + (x - deck.minX) * scale, y: planY + (y - deck.minY) * scale });
  const pointString = deck.points.map((p) => `${toSvg(p.x, p.y).x},${toSvg(p.x, p.y).y}`).join(' ');
  const showBoards = layer === 'overview' || layer === 'boards';
  const showFraming = layer === 'overview' || layer === 'framing';
  const showRailing = layer === 'overview' || layer === 'railing';
  const showStairs = layer === 'overview' || layer === 'stairs';

  const printPlan = () => {
    if (!svgRef.current) return;
    const win = window.open('', '_blank', 'width=1700,height=1100');
    if (!win) return;
    const svgMarkup = svgRef.current.outerHTML
      .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" style="background:#ffffff;display:block;width:100%;height:auto"');
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    win.document.write(`<!doctype html><html><head><title>Deck framing plan</title><style>@page{size:landscape;margin:0.25in}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Inter,Arial,sans-serif}body{padding:12px}img{display:block;width:100%;height:auto}</style></head><body><img src="${dataUri}" alt="Deck framing plan" /><script>window.onload=()=>setTimeout(()=>window.print(),220);</script></body></html>`);
    win.document.close();
  };

  const boardRuns = deck.boardRun === 'width'
    ? Array.from({ length: Math.max(1, Math.floor(deck.depth / 0.47)) }, (_, i) => deck.minY + 0.22 + i * 0.47)
    : Array.from({ length: Math.max(1, Math.floor(deck.width / 0.47)) }, (_, i) => deck.minX + 0.22 + i * 0.47);
  const joistRuns = deck.joistDirection === 'vertical'
    ? Array.from({ length: Math.max(0, Math.floor(deck.width) - 1) }, (_, i) => deck.minX + 1 + i)
    : Array.from({ length: Math.max(0, Math.floor(deck.depth) - 1) }, (_, i) => deck.minY + 1 + i);
  const railingSegments = railSegmentsForDeck(deck);
  const railingNodes = buildRailingNodes(deck);

  const stairSegment = deck.stairPlacement.edgeIndex !== null ? deck.edgeSegments[deck.stairPlacement.edgeIndex] : null;
  const stairNormal = stairSegment ? outwardNormal(stairSegment, deck.points) : { x: 0, y: 1 };
  const stairRunPx = deck.stairRunFt * scale;

  const renderDim = (a:{x:number;y:number}, b:{x:number;y:number}, text:string, offsetX:number, offsetY:number, key:string) => {
    const x1 = a.x + offsetX;
    const y1 = a.y + offsetY;
    const x2 = b.x + offsetX;
    const y2 = b.y + offsetY;
    return <g key={key}>
      <line x1={a.x} y1={a.y} x2={x1} y2={y1} className="dimension-line" />
      <line x1={b.x} y1={b.y} x2={x2} y2={y2} className="dimension-line" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="dimension-line" />
      <text x={(x1+x2)/2 + (Math.abs(offsetX) > Math.abs(offsetY) ? 0 : -14)} y={(y1+y2)/2 + (Math.abs(offsetY) > Math.abs(offsetX) ? 0 : -10)} className="dimension-text">{text}</text>
    </g>;
  };



  const startPan = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!panRef.current || zoom <= 1) return;
    dragPanRef.current = { active: true, x: event.clientX, y: event.clientY, left: panRef.current.scrollLeft, top: panRef.current.scrollTop };
  };

  const movePan = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!panRef.current || !dragPanRef.current.active) return;
    const dx = event.clientX - dragPanRef.current.x;
    const dy = event.clientY - dragPanRef.current.y;
    panRef.current.scrollLeft = dragPanRef.current.left - dx;
    panRef.current.scrollTop = dragPanRef.current.top - dy;
  };

  const endPan = () => {
    dragPanRef.current.active = false;
  };

  return (
    <div className="visual-card cad-card">
      <div className="visual-header compact-preview-header cad-preview-header">
        <div>
          <h3>Deck framing sheet</h3>
        </div>
        <div className="preview-toolbar">
          {(['overview', 'boards', 'framing', 'railing', 'stairs'] as DeckLayer[]).map((item) => (
            <button key={item} type="button" className={layer === item ? 'ghost-btn small-btn active-chip' : 'ghost-btn small-btn'} onClick={() => setLayer(item)}>{item}</button>
          ))}
          <button type="button" className="ghost-btn small-btn" onClick={() => setZoom((current) => Math.max(0.7, Number((current - 0.15).toFixed(2))))}>−</button>
          <span className="tag">{Math.round(zoom * 100)}%</span>
          <button type="button" className="ghost-btn small-btn" onClick={() => setZoom((current) => Math.min(3, Number((current + 0.15).toFixed(2))))}>+</button>
          <button type="button" className="ghost-btn small-btn" onClick={printPlan}>Print plan</button>
        </div>
      </div>
      <div ref={panRef} className="zoom-shell deck-sheet-shell" onMouseDown={startPan} onMouseMove={movePan} onMouseUp={endPan} onMouseLeave={endPan}>
        <div className="deck-sheet-stage">
          <svg ref={svgRef} viewBox={`0 0 ${sheetW} ${sheetH}`} className="layout-svg deck-sheet-svg" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            <rect x="18" y="18" width={sheetW - 36} height={sheetH - 36} className="sheet-border" />
            <rect x="34" y="34" width={sheetW - 68} height={sheetH - 68} className="sheet-border inner" />
            <text x={60} y={68} className="sheet-title">PLAN VIEW CONSTRUCTION</text>
            <text x={60} y={90} className="sheet-subtitle">S&S DESIGN BUILD · DECK FRAMING SCHEMATIC · DOUBLE BAND STANDARD</text>

            <polygon points={pointString} className="deck-polygon muted-fill" />

            {showBoards && boardRuns.map((value, idx) => deck.boardRun === 'width'
              ? scanlineIntersections(deck.points, 'horizontal', value).map((pair, pairIdx) => {
                  const y = toSvg(pair.start, value).y;
                  return staggeredSegments(pair.end - pair.start, 20, (idx % 4) * 4).map((seg, segIdx) => {
                    const x1 = toSvg(pair.start + seg.start, value).x;
                    const x2 = toSvg(pair.start + seg.end, value).x;
                    return <g key={`board-h-${idx}-${pairIdx}-${segIdx}`} onClick={() => setInspect({ title: `Deck board`, detail: `${feetAndInches(seg.end - seg.start)} piece in a ${feetAndInches(pair.end - pair.start)} run.` })}>
                      <rect x={Math.min(x1, x2)} y={y - Math.max(4, scale * 0.22)} width={Math.abs(x2 - x1)} height={Math.max(8, scale * 0.44)} className="deck-board-strip" />
                      {seg.end < (pair.end - pair.start) - 0.05 && <line x1={x2} y1={y - 8} x2={x2} y2={y + 8} className="seam-tick" />}
                    </g>;
                  });
                })
              : scanlineIntersections(deck.points, 'vertical', value).map((pair, pairIdx) => {
                  const x = toSvg(value, pair.start).x;
                  return staggeredSegments(pair.end - pair.start, 20, (idx % 4) * 4).map((seg, segIdx) => {
                    const y1 = toSvg(value, pair.start + seg.start).y;
                    const y2 = toSvg(value, pair.start + seg.end).y;
                    return <g key={`board-v-${idx}-${pairIdx}-${segIdx}`} onClick={() => setInspect({ title: `Deck board`, detail: `${feetAndInches(seg.end - seg.start)} piece in a ${feetAndInches(pair.end - pair.start)} run.` })}>
                      <rect x={x - Math.max(4, scale * 0.22)} y={Math.min(y1, y2)} width={Math.max(8, scale * 0.44)} height={Math.abs(y2 - y1)} className="deck-board-strip" />
                      {seg.end < (pair.end - pair.start) - 0.05 && <line x1={x - 8} y1={y2} x2={x + 8} y2={y2} className="seam-tick" />}
                    </g>;
                  });
                }))}

            {showFraming && deck.beamLines.map((beam, beamIdx) => (
              <g key={`beam-${beamIdx}`}>
                {beam.segments.map((segment, segIdx) => {
                  const y = toSvg(segment.startX, beam.y).y;
                  return <g key={`beam-seg-${segIdx}`} onClick={() => setInspect({ title: `Beam ${beamIdx + 1}`, detail: `${feetAndInches(segment.length)} run at ${feetAndInches(beam.offsetFromHouse)} off house.` })}>
                    {staggeredSegments(segment.length, 20, 0).map((splice, idx) => {
                      const x1 = toSvg(segment.startX + splice.start, beam.y).x;
                      const x2 = toSvg(segment.startX + splice.end, beam.y).x;
                      return <g key={`bp1-${idx}`}><rect x={Math.min(x1, x2)} y={y - 10} width={Math.abs(x2 - x1)} height={8} className="beam-rect primary" />{splice.end < segment.length - 0.05 && <g><line x1={x2} y1={y - 16} x2={x2} y2={y + 4} className="splice-line" /><text x={x2 + 4} y={y - 12} className="splice-label">splice</text></g>}</g>;
                    })}
                    {staggeredSegments(segment.length, 20, 10).map((splice, idx) => {
                      const x1 = toSvg(segment.startX + splice.start, beam.y).x;
                      const x2 = toSvg(segment.startX + splice.end, beam.y).x;
                      return <g key={`bp2-${idx}`}><rect x={Math.min(x1, x2)} y={y - 1} width={Math.abs(x2 - x1)} height={8} className="beam-rect secondary" />{splice.end < segment.length - 0.05 && <g><line x1={x2} y1={y - 4} x2={x2} y2={y + 16} className="splice-line" /><text x={x2 + 4} y={y + 13} className="splice-label">splice</text></g>}</g>;
                    })}
                  </g>;
                })}
                {beam.postXs.map((postX, postIdx) => {
                  const cx = toSvg(postX, beam.y).x;
                  const cy = toSvg(postX, beam.y).y;
                  return <g key={`post-${beamIdx}-${postIdx}`} onClick={() => setInspect({ title: `Post ${postIdx + 1}`, detail: `Notched ${feetAndInches(deck.postLength)} post supporting doubled beam.` })}>
                    <rect x={cx - 12} y={cy + 2} width={24} height={24} className="post-node" />
                    <rect x={cx - 12} y={cy - 2} width={12} height={8} className="post-notch-seat" />
                    <line x1={cx} y1={cy - 12} x2={cx} y2={cy + 26} className="post-centerline" />
                  </g>;
                })}
              </g>
            ))}

            {showFraming && deck.edgeSegments.map((segment) => {
              const outer = { ...offsetSegment(segment, 0.08, deck.points), length: segment.length } as DeckEdgeSegment;
              const inner = { ...offsetSegment(segment, -0.24, deck.points), length: segment.length } as DeckEdgeSegment;
              return <g key={`edge-${segment.index}`} onClick={() => setInspect({ title: `Double band`, detail: `${feetAndInches(segment.length)} double band run.` })}>
                {staggeredSegments(segment.length, 20, 0).map((seg, idx) => {
                  const s = pointAlong(outer, seg.start);
                  const e = pointAlong(outer, seg.end);
                  const a = toSvg(s.x, s.y);
                  const b = toSvg(e.x, e.y);
                  const band = 9;
                  const trim = segment.orientation === 'vertical' ? band : 0;
                  const w = segment.orientation === 'horizontal' ? Math.max(0, Math.abs(b.x - a.x) - trim * 2) : band;
                  const h = segment.orientation === 'vertical' ? Math.max(0, Math.abs(b.y - a.y) - trim * 2) : band;
                  return <g key={`do-${idx}`}><rect x={Math.min(a.x, b.x) - (segment.orientation === 'vertical' ? band / 2 : 0) + (segment.orientation === 'horizontal' ? trim : 0)} y={Math.min(a.y, b.y) - (segment.orientation === 'horizontal' ? band / 2 : 0) + (segment.orientation === 'vertical' ? trim : 0)} width={Math.max(w, band)} height={Math.max(h, band)} className="double-band-rect" />{seg.end < segment.length - 0.05 && <line x1={b.x - 5} y1={b.y - 5} x2={b.x + 5} y2={b.y + 5} className="seam-tick" />}</g>;
                })}
                {staggeredSegments(segment.length, 20, 10).map((seg, idx) => {
                  const s = pointAlong(inner, seg.start);
                  const e = pointAlong(inner, seg.end);
                  const a = toSvg(s.x, s.y);
                  const b = toSvg(e.x, e.y);
                  const band = 9;
                  const trim = segment.orientation === 'horizontal' ? band : 0;
                  const w = segment.orientation === 'horizontal' ? Math.max(0, Math.abs(b.x - a.x) - trim * 2) : band;
                  const h = segment.orientation === 'vertical' ? Math.max(0, Math.abs(b.y - a.y) - trim * 2) : band;
                  return <g key={`di-${idx}`}><rect x={Math.min(a.x, b.x) - (segment.orientation === 'vertical' ? band / 2 : 0) + (segment.orientation === 'horizontal' ? trim : 0)} y={Math.min(a.y, b.y) - (segment.orientation === 'horizontal' ? band / 2 : 0) + (segment.orientation === 'vertical' ? trim : 0)} width={Math.max(w, band)} height={Math.max(h, band)} className="double-band-rect secondary" />{seg.end < segment.length - 0.05 && <line x1={b.x - 5} y1={b.y + 5} x2={b.x + 5} y2={b.y - 5} className="seam-tick" />}</g>;
                })}
              </g>;
            })}

            {showFraming && joistRuns.map((value, idx) => deck.joistDirection === 'vertical'
              ? scanlineIntersections(deck.points, 'vertical', value).map((pair, pairIdx) => {
                  const x = toSvg(value, pair.start).x;
                  const inset = Math.min(10, Math.abs(toSvg(value, pair.start + 0.22).y - toSvg(value, pair.start).y) || 10);
                  const y1 = toSvg(value, pair.start).y + inset;
                  const y2 = toSvg(value, pair.end).y - inset;
                  return <rect key={`joist-v-${idx}-${pairIdx}`} x={x - 3} y={Math.min(y1, y2)} width={6} height={Math.max(0, Math.abs(y2 - y1))} className="joist-rect" onClick={() => setInspect({ title: `Joist ${idx + 1}`, detail: `${deck.joistSize} joist at 12 in O.C.` })} />;
                })
              : scanlineIntersections(deck.points, 'horizontal', value).map((pair, pairIdx) => {
                  const y = toSvg(pair.start, value).y;
                  const inset = Math.min(10, Math.abs(toSvg(pair.start + 0.22, value).x - toSvg(pair.start, value).x) || 10);
                  const x1 = toSvg(pair.start, value).x + inset;
                  const x2 = toSvg(pair.end, value).x - inset;
                  return <rect key={`joist-h-${idx}-${pairIdx}`} x={Math.min(x1, x2)} y={y - 3} width={Math.max(0, Math.abs(x2 - x1))} height={6} className="joist-rect" onClick={() => setInspect({ title: `Joist ${idx + 1}`, detail: `${deck.joistSize} joist at 12 in O.C.` })} />;
                }))}

            {showRailing && railingSegments.map((segment, idx) => {
              const a = toSvg(segment.start.x, segment.start.y);
              const b = toSvg(segment.end.x, segment.end.y);
              const midX = (a.x + b.x) / 2;
              const midY = (a.y + b.y) / 2;
              return <g key={`rail-${idx}`} onClick={() => setInspect({ title: segment.kind === 'stair-side' ? 'Angled railing section' : 'Level railing section', detail: `${feetAndInches(segment.length)} railing run.` })}>
                {(() => { const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1; const nx = -dy / len * 10; const ny = dx / len * 10; return <><line x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny} className={segment.kind === 'stair-side' ? 'stair-rail-line' : 'railing-line'} />
                <text x={midX + nx + 6} y={midY + ny - 6} className="rail-label">{segment.kind === 'stair-side' ? 'ANGLED RAIL' : 'LEVEL RAIL'}</text></>; })()}
              </g>;
            })}
            {showRailing && railingNodes.map((node, idx) => {
              const p = toSvg(node.point.x, node.point.y);
              const cls = node.kind === 'stair-end' || node.kind === 'stair-inline' ? 'stair-post-node' : 'railing-post-node';
              return <g key={`rail-node-${idx}`} onClick={() => setInspect({ title: node.detail, detail: `${node.detail} at ${feetAndInches(node.point.x - deck.minX)}, ${feetAndInches(node.point.y - deck.minY)}.` })}>
                <rect x={p.x - 7} y={p.y - 7} width={14} height={14} className={cls} />
              </g>;
            })}

            {showStairs && stairSegment && deck.stairPlacement.start && deck.stairPlacement.end && (() => {
              const a = toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y);
              const b = toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y);
              const nx = stairNormal.x * stairRunPx;
              const ny = stairNormal.y * stairRunPx;
              const count = Math.max(2, deck.stairStringers);
              const treadCount = Math.max(1, deck.stairTreadsPerRun);
              return <g>
                {Array.from({ length: count }, (_, idx) => {
                  const ratio = count === 1 ? 0 : idx / (count - 1);
                  const sx = a.x + (b.x - a.x) * ratio;
                  const sy = a.y + (b.y - a.y) * ratio;
                  return <line key={`stringer-${idx}`} x1={sx} y1={sy} x2={sx + nx} y2={sy + ny} className="stringer-line" />;
                })}
                {Array.from({ length: treadCount }, (_, idx) => {
                  const ratio = (idx + 1) / (treadCount + 1);
                  const tx1 = a.x + nx * ratio;
                  const ty1 = a.y + ny * ratio;
                  const tx2 = b.x + nx * ratio;
                  const ty2 = b.y + ny * ratio;
                  return <line key={`tread-${idx}`} x1={tx1} y1={ty1} x2={tx2} y2={ty2} className="tread-line" />;
                })}
              </g>;
            })()}


            {renderDim({ x: planX, y: planY - 34 }, { x: planX + planW, y: planY - 34 }, feetAndInches(deck.width), 0, 0, 'overall-top')}

            {deck.edgeSegments.filter((segment) => segment.orientation === 'horizontal').map((segment) => {
              const a = toSvg(segment.start.x, segment.start.y);
              const b = toSvg(segment.end.x, segment.end.y);
              const outward = outwardNormal(segment, deck.points);
              const offset = 26;
              return renderDim(a, b, feetAndInches(segment.length), outward.x * offset, outward.y * offset, `seg-h-${segment.index}`);
            })}
            {deck.edgeSegments.filter((segment) => segment.orientation === 'vertical').map((segment) => {
              const a = toSvg(segment.start.x, segment.start.y);
              const b = toSvg(segment.end.x, segment.end.y);
              const outward = outwardNormal(segment, deck.points);
              const offset = 28;
              return renderDim(a, b, feetAndInches(segment.length), outward.x * offset, outward.y * offset, `seg-v-${segment.index}`);
            })}

            {stairSegment && deck.stairPlacement.start && deck.stairPlacement.end && (() => {
              const a = toSvg(stairSegment.start.x, stairSegment.start.y);
              const s = toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y);
              const e = toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y);
              const b = toSvg(stairSegment.end.x, stairSegment.end.y);
              const outward = outwardNormal(stairSegment, deck.points);
              const offX = outward.x * 48;
              const offY = outward.y * 48;
              const chunks = [] as React.ReactNode[];
              const leftLen = Math.hypot(deck.stairPlacement.start.x - stairSegment.start.x, deck.stairPlacement.start.y - stairSegment.start.y);
              const rightLen = Math.hypot(stairSegment.end.x - deck.stairPlacement.end.x, stairSegment.end.y - deck.stairPlacement.end.y);
              if (leftLen > 0.05) chunks.push(renderDim(a, s, feetAndInches(leftLen), offX, offY, 'stair-left'));
              chunks.push(renderDim(s, e, feetAndInches(deck.stairPlacement.width), offX, offY, 'stair-opening'));
              if (rightLen > 0.05) chunks.push(renderDim(e, b, feetAndInches(rightLen), offX, offY, 'stair-right'));
              return chunks;
            })()}

            <g transform={`translate(${sheetW - titleBlockW - 52}, ${planY + planH + 34})`}>
              <rect x="0" y="0" width={titleBlockW} height={titleBlockH} className="title-block" />
              <line x1="0" y1="28" x2={titleBlockW} y2="28" className="title-block-line" />
              <line x1="0" y1="58" x2={titleBlockW} y2="58" className="title-block-line" />
              <line x1="0" y1="88" x2={titleBlockW} y2="88" className="title-block-line" />
              <line x1="0" y1="116" x2={titleBlockW} y2="116" className="title-block-line" />
              <line x1="132" y1="28" x2="132" y2={titleBlockH} className="title-block-line" />
              <line x1="244" y1="28" x2="244" y2={titleBlockH} className="title-block-line" />
              <text x="12" y="18" className="title-block-title">S&S DESIGN BUILD · DECK FRAMING PLAN</text>
              <text x="12" y="46" className="title-block-label">Width</text>
              <text x="76" y="46" className="title-block-value">{feetAndInches(deck.width)}</text>
              <text x="144" y="46" className="title-block-label">Projection</text>
              <text x="220" y="46" className="title-block-value">{feetAndInches(deck.depth)}</text>
              <text x="256" y="46" className="title-block-label">Area</text>
              <text x="302" y="46" className="title-block-value">{deck.area.toFixed(1)} sf</text>
              <text x="12" y="76" className="title-block-label">Joists</text>
              <text x="76" y="76" className="title-block-value">{deck.joistSize} @ 12&quot; O.C.</text>
              <text x="144" y="76" className="title-block-label">Beam</text>
              <text x="220" y="76" className="title-block-value">2-{deck.beamMemberSize}</text>
              <text x="256" y="76" className="title-block-label">Posts</text>
              <text x="302" y="76" className="title-block-value">{deck.postCount}</text>
              <text x="12" y="106" className="title-block-label">Attachment</text>
              <text x="76" y="106" className="title-block-value">{deck.attachment}</text>
              <text x="144" y="106" className="title-block-label">Cantilever</text>
              <text x="220" y="106" className="title-block-value">{feetAndInches(Number(values.beamCantilever ?? 2))}</text>
              <text x="256" y="106" className="title-block-label">Stairs</text>
              <text x="302" y="106" className="title-block-value">{deck.stairCount ? `${deck.stairRisers}R/${deck.stairTreadsPerRun}T` : 'none'}</text>
              <text x="12" y="132" className="title-block-note">Double band boards shown on all edges. Doubled beam plies staggered with explicit splice markers.</text>
            </g>
          </svg>
        </div>
      </div>
      <div className="legend-row wrap-legend deck-legend-strong">
        <span><i className="legend-swatch board-swatch" /> boards</span>
        <span><i className="legend-swatch joist-line-swatch" /> joists</span>
        <span><i className="legend-swatch beam-line-swatch" /> doubled beams</span>
        <span><i className="legend-swatch fascia-swatch" /> double band</span>
        <span><i className="legend-swatch post-swatch" /> posts</span>
        <span><i className="legend-swatch railing-swatch" /> railing</span>
        <span><i className="legend-swatch stair-post-swatch" /> stair / rail posts</span>
      </div>
      {inspect && <div className="callout-box inspect-card"><h4>{inspect.title}</h4><p>{inspect.detail}</p></div>}
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
          {section.doorType !== 'none' && <><rect x={doorLeft} y={doorTop} width={(doorRightFt - doorLeftFt) * scale} height={bottom - doorTop} className="door-panel" rx="6" /><line x1={doorLeft} y1={top + frameInset} x2={doorLeft} y2={bottom} className={doorFrameClass} /><line x1={doorRight} y1={top + frameInset} x2={doorRight} y2={bottom} className={doorFrameClass} /><line x1={doorLeft} y1={doorTop} x2={doorRight} y2={doorTop} className={doorFrameClass} />{section.doorType === 'french' && <line x1={(doorLeft + doorRight) / 2} y1={doorTop + 8} x2={(doorLeft + doorRight) / 2} y2={bottom - 8} className="door-split-line" />}<text x={doorLeft + 6} y={doorTop + 16} className="svg-note">{`${feetAndInches(section.doorWidth)}${section.dogDoor !== 'none' ? ` · ${section.dogDoor} dog door` : ''}`}</text></>}
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
  const projectionOverhang = Math.max(0, Math.min(2, Number(values.projectionOverhang ?? 2)));
  const layout = useMemo(() => buildPatioPanelLayout(width, fanBeam, panelWidth, fanBeamCount, fanBeamPlacementMode, fanShift), [width, fanBeam, panelWidth, fanBeamCount, fanBeamPlacementMode, fanShift]);
  const panelThickness = Number(values.panelThickness ?? 3);
  const upgraded3 = String(values.metalGauge ?? '.26') === '.32' && Number(values.foamDensity ?? 1) === 2;
  const extraBeams = Math.max(0, Number(values.extraBeamCount ?? 0));
  const effectiveProjection = Math.max(0, projection - projectionOverhang);
  const supportBeamCount = ((panelThickness === 3 && !upgraded3 && effectiveProjection > 13) ? Math.ceil(effectiveProjection / 13) - 1 : 0) + extraBeams;
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
  const supportYs = Array.from({ length: supportBeamCount }, (_, index) => y0 + roofD - (projectionOverhang * scale) - ((((index + 1) * (roofD - projectionOverhang * scale)) / (supportBeamCount + 1))));
  let cursor = x0;

  const supportPostCount = Math.max(2, Number(values.supportBeamPostCount ?? 0) > 0 ? Number(values.supportBeamPostCount) : frontPostCount);

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
      {supportYs.map((y, index) => <g key={`support-${index}`}><line x1={beamLeft} y1={y} x2={beamRight} y2={y} className="beam-line support" />{Array.from({ length: supportPostCount }, (_, postIndex) => {
        const x = beamLeft + ((beamRight - beamLeft) * postIndex) / Math.max(supportPostCount - 1, 1);
        return <rect key={`support-post-${index}-${postIndex}`} x={x - 5} y={y - 5} width="10" height="10" className="post-node support-post" rx="2" />;
      })}</g>)}
      {postXs.map((x, index) => <g key={`post-${index}`}><rect x={x - 6} y={y0 + roofD - 6} width="12" height="12" className="post-node" rx="2" /><text x={x - 10} y={y0 + roofD + 22} className="svg-note">P{index + 1}</text></g>)}
      <line x1={x0} y1={y0 + roofD + 40} x2={x0 + roofW} y2={y0 + roofD + 40} className="dimension-line" />
      <text x={x0 + roofW / 2 - 16} y={y0 + roofD + 34} className="svg-note">{feetAndInches(width)}</text>
      <line x1={x0 - 28} y1={y0} x2={x0 - 28} y2={y0 + roofD} className="dimension-line" />
      <text x={x0 - 62} y={y0 + roofD / 2} className="svg-note">{feetAndInches(projection)}</text>
      <text x={x0} y={y0 + roofD + 62} className="svg-note">{`${beamStyle} beam · ${frontPostCount} front posts · ${supportBeamCount} intermediate beam(s)${supportBeamCount ? ` · ${supportPostCount} posts each` : ''} · ${frontOverhang}' side overhang · ${projectionOverhang}' projection overhang`}</text>
    </svg>
    <div className="legend-row wrap-legend"><span><i className="legend-swatch roof-panel-swatch" /> regular panel</span><span><i className="legend-swatch fan-panel-swatch" /> fan-beam panel</span><span><i className="legend-swatch cut-panel-swatch" /> cut closure panel</span><span><i className="legend-swatch beam-line-swatch" /> beam</span></div>
  </div>;
}

export function LayoutPreview({ serviceSlug, values, onValuesChange }: LayoutPreviewProps) { if (serviceSlug === 'decks') return <DeckPreview values={values} />; if (serviceSlug === 'patio-covers') return <PatioPreview values={values} onValuesChange={onValuesChange} />; if (serviceSlug === 'screen-rooms') return <ScreenPreview values={values} renaissance={false} />; return <ScreenPreview values={values} renaissance />; }
