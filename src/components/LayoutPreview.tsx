import React, { useMemo, useRef, useState } from 'react';
import { exportSvgAsPdf, exportSvgSectionsAsPdf } from '../lib/export';
import { buildDeckModel } from '../lib/deckModel';
import { buildPatioPanelLayout } from '../lib/patioLayout';
import { parseGableSections, parseSections, parseSunroomSections } from '../lib/sectioning';
import { DeckEdgeSegment, DeckPoint, DeckRailCoverage, SectionConfig } from '../lib/types';

interface LayoutPreviewProps {
  serviceSlug: string;
  values: Record<string, string | number | boolean>;
  onValuesChange?: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>;
}

type DeckLayer = 'overview' | 'boards' | 'framing' | 'railing' | 'stairs';
type InspectMember = { title: string; detail: string };
type RailSegment = { edgeIndex: number; start: DeckPoint; end: DeckPoint; length: number; kind: 'deck' | 'stair-side'; railKind: 'level' | 'angled'; coverageStart?: number; coverageEnd?: number };

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


function sectionChairRailCount(section: SectionConfig) {
  if (!section.chairRail || section.pickets) return 0;
  return Math.max(1, Math.round(section.chairRailCount || 1));
}

function sectionChairRailHeights(section: SectionConfig) {
  const count = sectionChairRailCount(section);
  if (count <= 0) return [] as number[];
  const kickHeight = section.kickPanel === 'none' ? 0 : Math.min(section.kickPanelHeight, section.kickPanel === 'trim-coil' ? 2 : 4);
  const clearHeight = Math.max(0, section.height - kickHeight);
  return Array.from({ length: count }, (_, index) => kickHeight + (clearHeight * (index + 1)) / (count + 1));
}

function sectionDoorJambHeight(section: SectionConfig) {
  const chairRailHeights = sectionChairRailHeights(section);
  return section.height > 12 && chairRailHeights.length ? chairRailHeights[0] : section.height;
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


function inwardNormal(segment: DeckEdgeSegment, points: DeckPoint[]) {
  const out = outwardNormal(segment, points);
  return { x: -out.x, y: -out.y };
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


function optimizeRailMix(length: number) {
  let best = { six: 0, eight: 0, waste: Number.POSITIVE_INFINITY, pieces: Number.POSITIVE_INFINITY };
  for (let six = 0; six < 12; six += 1) {
    for (let eight = 0; eight < 12; eight += 1) {
      const covered = six * 6 + eight * 8;
      if (covered + 1e-6 < length) continue;
      const waste = covered - length;
      const pieces = six + eight;
      if (waste < best.waste - 1e-6 || (Math.abs(waste - best.waste) < 1e-6 && pieces < best.pieces)) {
        best = { six, eight, waste, pieces };
      }
    }
  }
  if (!Number.isFinite(best.waste)) return { six: 1, eight: 0, waste: Math.max(0, 6 - length), pieces: 1 };
  return best;
}

function railPostCount(length: number, maxSection = 8) {
  const sectionCount = Math.max(1, Math.ceil(length / maxSection));
  return sectionCount + 1;
}

function railSummary(length: number) {
  const mix = optimizeRailMix(length);
  const posts = railPostCount(length);
  const parts = [] as string[];
  if (mix.eight) parts.push(`${mix.eight}×8'`);
  if (mix.six) parts.push(`${mix.six}×6'`);
  return {
    mix,
    posts,
    label: parts.length ? parts.join(' + ') : "1×6'",
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
  const result: RailSegment[] = [];
  deck.railCoverage.forEach((coverage) => {
    const edge = deck.edgeSegments[coverage.edgeIndex];
    if (!edge) return;
    if (edge.index !== deck.stairPlacement.edgeIndex || !deck.stairPlacement.start || !deck.stairPlacement.end) {
      result.push({ start: pointAlong(edge, coverage.start), end: pointAlong(edge, coverage.end), length: coverage.end - coverage.start, kind: 'deck', railKind: coverage.kind, edgeIndex: edge.index, coverageStart: coverage.start, coverageEnd: coverage.end });
      return;
    }
    const stairStart = deck.stairPlacement.offset;
    const stairEnd = deck.stairPlacement.offset + deck.stairPlacement.width;
    if (coverage.start < stairStart - 0.05) {
      result.push({ start: pointAlong(edge, coverage.start), end: pointAlong(edge, Math.min(coverage.end, stairStart)), length: Math.min(coverage.end, stairStart) - coverage.start, kind: 'deck', railKind: coverage.kind, edgeIndex: edge.index, coverageStart: coverage.start, coverageEnd: Math.min(coverage.end, stairStart) });
    }
    if (coverage.end > stairEnd + 0.05) {
      result.push({ start: pointAlong(edge, Math.max(coverage.start, stairEnd)), end: pointAlong(edge, coverage.end), length: coverage.end - Math.max(coverage.start, stairEnd), kind: 'deck', railKind: coverage.kind, edgeIndex: edge.index, coverageStart: Math.max(coverage.start, stairEnd), coverageEnd: coverage.end });
    }
  });
  if (deck.stairRisers > 3 && deck.stairPlacement.start && deck.stairPlacement.end) {
    const segment = deck.edgeSegments[deck.stairPlacement.edgeIndex ?? 0];
    const normal = outwardNormal(segment, deck.points);
    const run = deck.stairRunFt;
    result.push(
      { start: deck.stairPlacement.start, end: { x: deck.stairPlacement.start.x + normal.x * run, y: deck.stairPlacement.start.y + normal.y * run }, length: run, kind: 'stair-side', railKind: 'angled', edgeIndex: segment.index },
      { start: deck.stairPlacement.end, end: { x: deck.stairPlacement.end.x + normal.x * run, y: deck.stairPlacement.end.y + normal.y * run }, length: run, kind: 'stair-side', railKind: 'angled', edgeIndex: segment.index },
    );
  }
  return result.filter((item) => item.length > 0.05);
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
  const allRuns = railSegmentsForDeck(deck);
  const topRuns = allRuns.filter((segment) => segment.kind === 'deck');
  const stairRuns = allRuns.filter((segment) => segment.kind === 'stair-side');
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

function parseRailCoverageValue(raw: string | number | boolean | undefined) {
  if (typeof raw !== 'string' || !raw.trim()) return [] as DeckRailCoverage[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as DeckRailCoverage[] : [];
  } catch { return []; }
}

function serializeRailCoverage(items: DeckRailCoverage[]) {
  return JSON.stringify(items.map((item) => ({ ...item, start: Math.round(item.start * 12) / 12, end: Math.round(item.end * 12) / 12 })).sort((a, b) => a.edgeIndex - b.edgeIndex || a.start - b.start));
}

function DeckPreview({ values, onValuesChange }: { values: Record<string, string | number | boolean>; onValuesChange?: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>> }) {
  const deck = buildDeckModel(values);
  const [layer, setLayer] = useState<DeckLayer>('framing');
  const [inspect, setInspect] = useState<InspectMember | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedRail, setSelectedRail] = useState<number | null>(null);
  const [dragRail, setDragRail] = useState<{ index: number; handle: 'start' | 'end' } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ index: number; length: number; posts: number; breakdown: string; start: number; end: number } | null>(null);
  const panRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragPanRef = useRef<{ active: boolean; x: number; y: number; left: number; top: number }>({ active: false, x: 0, y: 0, left: 0, top: 0 });

  const stairEdgeForBounds = deck.stairPlacement.edgeIndex !== null ? deck.edgeSegments[deck.stairPlacement.edgeIndex] : null;
  const stairNormalForBounds = stairEdgeForBounds ? outwardNormal(stairEdgeForBounds, deck.points) : { x: 0, y: 1 };
  const stairBounds = deck.stairPlacement.start && deck.stairPlacement.end
    ? {
        minX: Math.min(deck.stairPlacement.start.x, deck.stairPlacement.end.x, deck.stairPlacement.start.x + stairNormalForBounds.x * deck.stairRunFt, deck.stairPlacement.end.x + stairNormalForBounds.x * deck.stairRunFt),
        maxX: Math.max(deck.stairPlacement.start.x, deck.stairPlacement.end.x, deck.stairPlacement.start.x + stairNormalForBounds.x * deck.stairRunFt, deck.stairPlacement.end.x + stairNormalForBounds.x * deck.stairRunFt),
        minY: Math.min(deck.stairPlacement.start.y, deck.stairPlacement.end.y, deck.stairPlacement.start.y + stairNormalForBounds.y * deck.stairRunFt, deck.stairPlacement.end.y + stairNormalForBounds.y * deck.stairRunFt),
        maxY: Math.max(deck.stairPlacement.start.y, deck.stairPlacement.end.y, deck.stairPlacement.start.y + stairNormalForBounds.y * deck.stairRunFt, deck.stairPlacement.end.y + stairNormalForBounds.y * deck.stairRunFt),
      }
    : { minX: deck.minX, maxX: deck.maxX, minY: deck.minY, maxY: deck.maxY };
  const layoutMinX = Math.min(deck.minX, stairBounds.minX);
  const layoutMaxX = Math.max(deck.maxX, stairBounds.maxX);
  const layoutMinY = Math.min(deck.minY, stairBounds.minY);
  const layoutMaxY = Math.max(deck.maxY, stairBounds.maxY);
  const widthFt = Math.max(layoutMaxX - layoutMinX, 1);
  const depthFt = Math.max(layoutMaxY - layoutMinY, 1);
  const titleBlockW = 430;
  const titleBlockH = 164;
  const sheetMarginX = 54;
  const sheetMarginTop = 110;
  const sheetMarginBottom = 54;
  const planScaleW = 1180;
  const planScaleH = 760;
  const scale = Math.min(planScaleW / widthFt, planScaleH / depthFt);
  const planW = widthFt * scale;
  const planH = depthFt * scale;
  const sheetW = Math.max(1580, planW + sheetMarginX * 2);
  const sheetH = Math.max(1260, planH + titleBlockH + sheetMarginTop + sheetMarginBottom + 90);
  const planX = (sheetW - planW) / 2;
  const planY = sheetMarginTop;
  const toSvg = (x: number, y: number) => ({ x: planX + (x - layoutMinX) * scale, y: planY + (y - layoutMinY) * scale });
  const pointString = deck.points.map((p) => `${toSvg(p.x, p.y).x},${toSvg(p.x, p.y).y}`).join(' ');
  const beamPlies = (segmentLength: number, offset: number) => {
    const pieces: { start: number; end: number; infill: boolean; label?: string }[] = [];
    if (segmentLength <= 20.01) return [{ start: 0, end: segmentLength, infill: false }];
    pieces.push({ start: 0, end: 20, infill: false, label: `20'` });
    let coverageEnd = 20;
    while (coverageEnd < segmentLength - 0.01) {
      const remaining = segmentLength - coverageEnd;
      const infillLen = Math.min(20, remaining + offset);
      const start = Math.max(0, coverageEnd - offset);
      const end = Math.min(segmentLength, start + infillLen);
      pieces.push({ start, end, infill: true, label: feetAndInches(end - start) });
      coverageEnd = start + 20;
      if (coverageEnd <= start + 0.01) break;
    }
    return pieces;
  };
  const showBoards = layer === 'overview' || layer === 'boards';
  const showFraming = layer === 'overview' || layer === 'framing';
  const showRailing = layer === 'overview' || layer === 'railing';
  const showStairs = layer === 'overview' || layer === 'stairs';

  const printPlan = () => { void exportSvgAsPdf(svgRef.current, 'Deck framing plan', 'sns-deck-plan.pdf'); };

  const boardRuns = deck.boardRun === 'width'
    ? Array.from({ length: Math.max(1, Math.floor(deck.depth / 0.47)) }, (_, i) => deck.minY + 0.22 + i * 0.47)
    : Array.from({ length: Math.max(1, Math.floor(deck.width / 0.47)) }, (_, i) => deck.minX + 0.22 + i * 0.47);
  const joistRuns = deck.joistDirection === 'vertical'
    ? Array.from({ length: Math.max(0, Math.floor(deck.width) - 1) }, (_, i) => deck.minX + 1 + i)
    : Array.from({ length: Math.max(0, Math.floor(deck.depth) - 1) }, (_, i) => deck.minY + 1 + i);
  const railingSegments = railSegmentsForDeck(deck);
  const editableCoverage = useMemo(() => parseRailCoverageValue(values.railCoverage), [values.railCoverage]);
  const railingInsetFt = 0.42;
  const railingNodes = Array.from(new Map(buildRailingNodes(deck).map((node) => { const edge = deck.exposedSegments.find((seg) => (Math.abs(seg.start.x - node.point.x) < 0.12 && Math.abs(seg.start.y - node.point.y) < 0.12) || (Math.abs(seg.end.x - node.point.x) < 0.12 && Math.abs(seg.end.y - node.point.y) < 0.12)); const shifted = edge ? (() => { const inward = inwardNormal(edge, deck.points); return { ...node, point: { x: node.point.x + inward.x * railingInsetFt, y: node.point.y + inward.y * railingInsetFt } }; })() : node; return [`${Math.round(shifted.point.x*12)}-${Math.round(shifted.point.y*12)}-${shifted.kind}`, shifted] as const; })).values());

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
    setDragRail(null);
    setDragPreview(null);
  };

  const updateCoverage = (next: DeckRailCoverage[]) => {
    if (!onValuesChange) return;
    onValuesChange((current) => ({ ...current, railCoverage: serializeRailCoverage(next), manualRailingEdges: JSON.stringify(Array.from(new Set(next.map((item) => item.edgeIndex))).sort((a, b) => a - b)) }));
  };

  const ensureEdgeCoverage = (edgeIndex: number) => {
    const edge = deck.edgeSegments[edgeIndex];
    if (!edge || !onValuesChange) return;
    const next = [...editableCoverage];
    if (!next.some((item) => item.edgeIndex === edgeIndex)) {
      next.push({ edgeIndex, start: 0, end: edge.length, kind: 'level' });
      updateCoverage(next);
      setSelectedRail(next.length - 1);
      return;
    }
    const firstIndex = next.findIndex((item) => item.edgeIndex === edgeIndex);
    setSelectedRail(firstIndex);
  };

  const nudgeRail = (direction: 'start' | 'end', delta: number) => {
    if (selectedRail === null || !editableCoverage[selectedRail]) return;
    const next = [...editableCoverage];
    const item = { ...next[selectedRail] };
    const minLen = 1;
    const edge = deck.edgeSegments[item.edgeIndex];
    if (!edge) return;
    if (direction === 'start') item.start = Math.max(0, Math.min(item.start + delta, item.end - minLen));
    else item.end = Math.min(edge.length, Math.max(item.end + delta, item.start + minLen));
    next[selectedRail] = item;
    updateCoverage(next);
  };

  const splitRail = () => {
    if (selectedRail === null || !editableCoverage[selectedRail]) return;
    const item = editableCoverage[selectedRail];
    const mid = Math.round((((item.start + item.end) / 2) * 12)) / 12;
    if (mid - item.start < 1 || item.end - mid < 1) return;
    const next = editableCoverage.filter((_, index) => index !== selectedRail);
    next.push({ ...item, end: mid }, { ...item, start: mid });
    updateCoverage(next);
    setSelectedRail(null);
  };

  const deleteRail = () => {
    if (selectedRail === null) return;
    updateCoverage(editableCoverage.filter((_, index) => index !== selectedRail));
    setSelectedRail(null);
  };

  const toggleRailKind = () => {
    if (selectedRail === null || !editableCoverage[selectedRail]) return;
    const next = [...editableCoverage];
    next[selectedRail] = { ...next[selectedRail], kind: next[selectedRail].kind === 'level' ? 'angled' : 'level' };
    updateCoverage(next);
  };

  const snappedRailPosition = (edge: DeckEdgeSegment, raw: number, item: DeckRailCoverage) => {
    const fineStep = zoom >= 1.75 ? 1 / 12 : 0.5;
    const stairStops = deck.stairPlacement.edgeIndex === edge.index
      ? [deck.stairPlacement.offset, deck.stairPlacement.offset + deck.stairPlacement.width]
      : [];
    const postStops = symmetricPostOffsets(edge.length, 8);
    const anchors = Array.from(new Set([
      0,
      edge.length,
      ...stairStops,
      ...postStops,
      ...editableCoverage.filter((coverage) => coverage.edgeIndex === edge.index).flatMap((coverage) => [coverage.start, coverage.end]),
    ].map((value) => Math.round(value * 12) / 12))).sort((a, b) => a - b);
    const stepped = Math.round(raw / fineStep) * fineStep;
    let snapped = Math.max(0, Math.min(edge.length, stepped));
    let bestDist = Infinity;
    anchors.forEach((anchor) => {
      const dist = Math.abs(anchor - raw);
      if (dist <= 0.34 && dist < bestDist) {
        snapped = anchor;
        bestDist = dist;
      }
    });
    const minLen = 1;
    if (dragRail?.handle === 'start') return Math.max(0, Math.min(snapped, item.end - minLen));
    return Math.min(edge.length, Math.max(snapped, item.start + minLen));
  };

  const moveRailHandle = (clientX: number, clientY: number) => {
    if (!dragRail || !svgRef.current || !editableCoverage[dragRail.index]) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * sheetW;
    const y = ((clientY - rect.top) / rect.height) * sheetH;
    const item = editableCoverage[dragRail.index];
    const edge = deck.edgeSegments[item.edgeIndex];
    if (!edge) return;
    const a = toSvg(edge.start.x, edge.start.y);
    const b = toSvg(edge.end.x, edge.end.y);
    const dx = b.x - a.x; const dy = b.y - a.y; const lenSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, (((x - a.x) * dx) + ((y - a.y) * dy)) / lenSq));
    const rawPos = edge.length * t;
    const next = [...editableCoverage];
    const updated = { ...item };
    const snapped = snappedRailPosition(edge, rawPos, updated);
    if (dragRail.handle === 'start') updated.start = snapped;
    else updated.end = snapped;
    next[dragRail.index] = updated;
    const summary = railSummary(updated.end - updated.start);
    setDragPreview({ index: dragRail.index, length: updated.end - updated.start, posts: summary.posts, breakdown: summary.label, start: updated.start, end: updated.end });
    updateCoverage(next);
  };

  const toggleManualEdge = (edgeIndex: number) => {
    ensureEdgeCoverage(edgeIndex);
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
          <button type="button" className="ghost-btn small-btn" onClick={printPlan}>Export PDF</button>
        </div>
      </div>
      <div ref={panRef} className="zoom-shell deck-sheet-shell" onMouseDown={startPan} onMouseMove={(event) => { movePan(event); moveRailHandle(event.clientX, event.clientY); }} onMouseUp={() => { endPan(); setDragRail(null); }} onMouseLeave={() => { endPan(); setDragRail(null); }}>
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
                  const primaryPieces = beamPlies(segment.length, 10);
                  const secondaryPieces = beamPlies(segment.length, 0);
                  return <g key={`beam-seg-${segIdx}`} onClick={() => setInspect({ title: `Beam ${beamIdx + 1}`, detail: `${feetAndInches(segment.length)} run at ${feetAndInches(beam.offsetFromHouse)} off house.` })}>
                    {primaryPieces.map((splice, idx) => {
                      const x1 = toSvg(segment.startX + splice.start, beam.y).x;
                      const x2 = toSvg(segment.startX + splice.end, beam.y).x;
                      return <g key={`bp1-${idx}`}><rect x={Math.min(x1, x2)} y={y - 11} width={Math.abs(x2 - x1)} height={8} className={splice.infill ? 'beam-rect infill' : 'beam-rect primary'} />{splice.infill && splice.label && <text x={(x1+x2)/2 - 10} y={y - 14} className="splice-label">{splice.label}</text>}{idx>0 && <line x1={x1} y1={y - 16} x2={x1} y2={y + 5} className="splice-line" />}</g>;
                    })}
                    {secondaryPieces.map((splice, idx) => {
                      const x1 = toSvg(segment.startX + splice.start, beam.y).x;
                      const x2 = toSvg(segment.startX + splice.end, beam.y).x;
                      return <g key={`bp2-${idx}`}><rect x={Math.min(x1, x2)} y={y - 1} width={Math.abs(x2 - x1)} height={8} className={splice.infill ? 'beam-rect infill secondary' : 'beam-rect secondary'} />{splice.infill && splice.label && <text x={(x1+x2)/2 - 10} y={y + 18} className="splice-label">{splice.label}</text>}{idx>0 && <line x1={x1} y1={y - 5} x2={x1} y2={y + 16} className="splice-line" />}</g>;
                    })}
                  </g>;
                })}
                {beam.postXs.map((postX, postIdx) => {
                  const cx = toSvg(postX, beam.y).x;
                  const cy = toSvg(postX, beam.y).y;
                  return <g key={`post-${beamIdx}-${postIdx}`} onClick={() => setInspect({ title: `Post ${postIdx + 1}`, detail: `Notched ${feetAndInches(deck.postLength)} post supporting doubled beam.` })}>
                    <rect x={cx - 16} y={cy + 4} width={32} height={32} className="post-node" />
                    <rect x={cx - 16} y={cy - 2} width={16} height={9} className="post-notch-seat" />
                    <line x1={cx} y1={cy - 12} x2={cx} y2={cy + 31} className="post-centerline" />
                  </g>;
                })}
              </g>
            ))}

            {showFraming && deck.edgeSegments.map((segment) => {
              const band = 9;
              const normal = inwardNormal(segment, deck.points);
              const normalPx = { x: normal.x * band, y: normal.y * band };
              const isHorizontal = segment.orientation === 'horizontal';
              const primaryTrim = isHorizontal ? 0 : 0.18;
              const secondaryTrim = isHorizontal ? 0.18 : 0;
              const pStart = pointAlong(segment, primaryTrim);
              const pEnd = pointAlong(segment, segment.length - primaryTrim);
              const sStart = pointAlong(segment, secondaryTrim);
              const sEnd = pointAlong(segment, segment.length - secondaryTrim);
              const rectProps = (x1:number,y1:number,x2:number,y2:number, offset:number)=>({
                x: Math.min(x1,x2) - (isHorizontal ? 0 : band/2) + normalPx.x * offset,
                y: Math.min(y1,y2) - (isHorizontal ? band/2 : 0) + normalPx.y * offset,
                width: Math.max(isHorizontal ? Math.abs(x2-x1) : band, band),
                height: Math.max(isHorizontal ? band : Math.abs(y2-y1), band)
              });
              const primaryLength = Math.max(0, segment.length - primaryTrim * 2);
              const secondaryLength = Math.max(0, segment.length - secondaryTrim * 2);
              const primarySegs = staggeredSegments(primaryLength, 20, 0);
              const secondarySegs = staggeredSegments(secondaryLength, 20, 10);
              return <g key={`band-${segment.index}`}>
                {primarySegs.map((seg, idx) => {
                  const st = pointAlong({ ...segment, length: primaryLength, start:pStart, end:pEnd }, seg.start);
                  const en = pointAlong({ ...segment, length: primaryLength, start:pStart, end:pEnd }, seg.end);
                  const aa = toSvg(st.x, st.y);
                  const bb = toSvg(en.x, en.y);
                  const props = rectProps(aa.x, aa.y, bb.x, bb.y, 0);
                  return <g key={`bp-${idx}`}><rect {...props} className="double-band-rect" />{seg.end < primaryLength - 0.05 && <line x1={bb.x + normalPx.x * 0.15 - 5} y1={bb.y + normalPx.y * 0.15 - 5} x2={bb.x + normalPx.x * 0.15 + 5} y2={bb.y + normalPx.y * 0.15 + 5} className="seam-tick" />}</g>;
                })}
                {secondarySegs.map((seg, idx) => {
                  const st = pointAlong({ ...segment, length: secondaryLength, start:sStart, end:sEnd }, seg.start);
                  const en = pointAlong({ ...segment, length: secondaryLength, start:sStart, end:sEnd }, seg.end);
                  const aa = toSvg(st.x, st.y);
                  const bb = toSvg(en.x, en.y);
                  const props = rectProps(aa.x, aa.y, bb.x, bb.y, 1.02);
                  return <g key={`bs-${idx}`}><rect {...props} className="double-band-rect secondary" />{seg.end < secondaryLength - 0.05 && <line x1={bb.x + normalPx.x * 1.02 - 5} y1={bb.y + normalPx.y * 1.02 + 5} x2={bb.x + normalPx.x * 1.02 + 5} y2={bb.y + normalPx.y * 1.02 - 5} className="seam-tick" />}</g>;
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

            {showFraming && Boolean(values.borderSameBoard) && deck.exposedSegments
              .filter((segment) => segment.orientation === 'vertical' || Math.abs(segment.start.y - deck.maxY) > 0.05)
              .map((segment, segIdx) => {
                const inset = inwardNormal(segment, deck.points);
                const tangent = directionBetween(segment.start, segment.end);
                const span = segment.length;
                const blocks = symmetricPostOffsets(span, 2).map((distance) => pointAlong(segment, distance));
                return <g key={`blocking-${segIdx}`}>{blocks.map((pt, idx) => {
                  const center = toSvg(pt.x + inset.x * 0.58, pt.y + inset.y * 0.58);
                  const blockW = 14;
                  const blockL = 22;
                  return <rect
                    key={idx}
                    x={center.x - blockL / 2}
                    y={center.y - blockW / 2}
                    width={blockL}
                    height={blockW}
                    rx={1.5}
                    transform={`rotate(${Math.atan2(tangent.y, tangent.x) * 180 / Math.PI} ${center.x} ${center.y})`}
                    className="blocking-node"
                  />;
                })}</g>;
              })}

            {onValuesChange && showRailing && deck.edgeSegments.map((segment) => {
              const inward = inwardNormal(segment, deck.points);
              const insetA = { x: segment.start.x + inward.x * railingInsetFt, y: segment.start.y + inward.y * railingInsetFt };
              const insetB = { x: segment.end.x + inward.x * railingInsetFt, y: segment.end.y + inward.y * railingInsetFt };
              const ia = toSvg(insetA.x, insetA.y);
              const ib = toSvg(insetB.x, insetB.y);
              const edgeItems = editableCoverage.map((item, index) => ({ item, index })).filter(({ item }) => item.edgeIndex === segment.index);
              return <g key={`edge-visual-${segment.index}`} className="edge-visual-layer">
                <line x1={ia.x} y1={ia.y} x2={ib.x} y2={ib.y} className="edge-visual-hit" onClick={() => toggleManualEdge(segment.index)} />
                {edgeItems.map(({ item, index }) => {
                  const start = pointAlong(segment, item.start);
                  const end = pointAlong(segment, item.end);
                  const sa = toSvg(start.x + inward.x * railingInsetFt, start.y + inward.y * railingInsetFt);
                  const sb = toSvg(end.x + inward.x * railingInsetFt, end.y + inward.y * railingInsetFt);
                  const selected = selectedRail === index;
                  const midX = (sa.x + sb.x) / 2;
                  const midY = (sa.y + sb.y) / 2;
                  const summary = railSummary(item.end - item.start);
                  const activePreview = dragPreview && dragPreview.index === index ? dragPreview : null;
                  return <g key={`coverage-${segment.index}-${index}`}>
                    <line x1={sa.x} y1={sa.y} x2={sb.x} y2={sb.y} className={selected ? `railing-line ${item.kind === 'angled' ? 'angled-rail' : 'level-rail'} selected-rail` : `railing-line ${item.kind === 'angled' ? 'angled-rail' : 'level-rail'}`} onClick={() => setSelectedRail(index)} />
                    <circle cx={sa.x} cy={sa.y} r={selected ? 8 : 6} className={dragRail?.index === index && dragRail.handle === 'start' ? 'rail-handle active' : 'rail-handle'} onMouseDown={(event) => { event.stopPropagation(); setSelectedRail(index); setDragRail({ index, handle: 'start' }); }} />
                    <circle cx={sb.x} cy={sb.y} r={selected ? 8 : 6} className={dragRail?.index === index && dragRail.handle === 'end' ? 'rail-handle active' : 'rail-handle'} onMouseDown={(event) => { event.stopPropagation(); setSelectedRail(index); setDragRail({ index, handle: 'end' }); }} />
                    <text x={midX} y={midY - 12} textAnchor="middle" className="rail-edit-label">{feetAndInches((activePreview?.length ?? (item.end - item.start)))}</text>
                    {selected && <text x={midX} y={midY + 2} textAnchor="middle" className="rail-edit-sub">{activePreview ? `${activePreview.breakdown} · ${activePreview.posts} posts` : `${summary.label} · ${summary.posts} posts`}</text>}
                  </g>;
                })}
              </g>;
            })}

            {showRailing && selectedRail !== null && editableCoverage[selectedRail] && (() => {
              const item = editableCoverage[selectedRail];
              const segment = deck.edgeSegments[item.edgeIndex];
              const inward = inwardNormal(segment, deck.points);
              const start = pointAlong(segment, item.start);
              const end = pointAlong(segment, item.end);
              const sa = toSvg(start.x + inward.x * railingInsetFt, start.y + inward.y * railingInsetFt);
              const sb = toSvg(end.x + inward.x * railingInsetFt, end.y + inward.y * railingInsetFt);
              const midX = (sa.x + sb.x) / 2;
              const midY = (sa.y + sb.y) / 2;
              const preview = dragPreview && dragPreview.index === selectedRail ? dragPreview : null;
              const summary = railSummary((preview?.length ?? (item.end - item.start)));
              const toolbarY = midY - 74;
              const buttons = [
                { x: midX - 138, w: 44, label: 'Ext L', onClick: () => nudgeRail('start', -0.5) },
                { x: midX - 88, w: 54, label: 'Short L', onClick: () => nudgeRail('start', 0.5) },
                { x: midX - 26, w: 58, label: 'Short R', onClick: () => nudgeRail('end', -0.5) },
                { x: midX + 40, w: 48, label: 'Ext R', onClick: () => nudgeRail('end', 0.5) },
                { x: midX + 96, w: 42, label: 'Split', onClick: splitRail },
              ];
              return <g className="rail-toolbar">
                <rect x={midX - 152} y={toolbarY} width={304} height={58} rx={16} className="rail-toolbar-box" />
                <text x={midX - 136} y={toolbarY + 18} className="rail-toolbar-title">{item.kind === 'angled' ? 'ANGLED RAIL' : 'LEVEL RAIL'}</text>
                <text x={midX - 136} y={toolbarY + 34} className="rail-toolbar-sub">{feetAndInches(preview?.length ?? (item.end - item.start))} · {preview?.breakdown ?? summary.label} · {preview?.posts ?? summary.posts} posts</text>
                {buttons.map((button) => <g key={button.label} onClick={button.onClick}><rect x={button.x} y={toolbarY + 40} width={button.w} height={14} rx={7} className="rail-toolbar-pill" /><text x={button.x + button.w / 2} y={toolbarY + 50} textAnchor="middle" className="rail-toolbar-pill-text">{button.label}</text></g>)}
                <g onClick={toggleRailKind}><rect x={midX + 146} y={toolbarY + 8} width={76} height={14} rx={7} className="rail-toolbar-pill accent" /><text x={midX + 184} y={toolbarY + 18} textAnchor="middle" className="rail-toolbar-pill-text accent">Toggle</text></g>
                <g onClick={deleteRail}><rect x={midX + 146} y={toolbarY + 28} width={76} height={14} rx={7} className="rail-toolbar-pill danger" /><text x={midX + 184} y={toolbarY + 38} textAnchor="middle" className="rail-toolbar-pill-text danger">Delete</text></g>
              </g>;
            })()}

            {showRailing && railingSegments.map((segment, idx) => {
              const sourceEdge = deck.edgeSegments.find((edge) => (Math.abs(edge.start.x - segment.start.x) < 0.01 && Math.abs(edge.start.y - segment.start.y) < 0.01 && Math.abs(edge.end.x - segment.end.x) < 0.01 && Math.abs(edge.end.y - segment.end.y) < 0.01) || (Math.abs(edge.start.x - segment.end.x) < 0.01 && Math.abs(edge.start.y - segment.end.y) < 0.01 && Math.abs(edge.end.x - segment.start.x) < 0.01 && Math.abs(edge.end.y - segment.start.y) < 0.01));
              const inward = sourceEdge ? inwardNormal(sourceEdge, deck.points) : { x: 0, y: 0 };
              const insetFt = sourceEdge ? railingInsetFt : 0;
              const start = { x: segment.start.x + inward.x * insetFt, y: segment.start.y + inward.y * insetFt };
              const end = { x: segment.end.x + inward.x * insetFt, y: segment.end.y + inward.y * insetFt };
              const a = toSvg(start.x, start.y);
              const b = toSvg(end.x, end.y);
              const midX = (a.x + b.x) / 2;
              const midY = (a.y + b.y) / 2;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const labelX = midX + (-dy / len) * 10;
              const labelY = midY + (dx / len) * 10 - 4;
              return <g key={`rail-${idx}`} onClick={() => setInspect({ title: segment.kind === 'stair-side' ? 'Angled railing section' : 'Level railing section', detail: `${feetAndInches(segment.length)} railing run.` })}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={segment.kind === 'stair-side' ? 'stair-rail-line' : 'railing-line'} />
                <text x={labelX} y={labelY} className="rail-label">{segment.kind === 'stair-side' ? 'ANGLED RAIL' : 'LEVEL RAIL'}</text>
              </g>;
            })}
            {showRailing && railingNodes.map((node, idx) => {
              const nearby = deck.edgeSegments.filter((edge) => Math.abs(edge.start.x - node.point.x) < 0.01 && Math.abs(edge.start.y - node.point.y) < 0.01 || Math.abs(edge.end.x - node.point.x) < 0.01 && Math.abs(edge.end.y - node.point.y) < 0.01);
              const offset = nearby.length ? nearby.map((edge) => inwardNormal(edge, deck.points)).reduce((acc, item) => ({ x: acc.x + item.x, y: acc.y + item.y }), { x: 0, y: 0 }) : { x: 0, y: 0 };
              const mag = Math.hypot(offset.x, offset.y) || 1;
              const p = toSvg(node.point.x + (offset.x / mag) * 0.26, node.point.y + (offset.y / mag) * 0.26);
              const cls = node.kind === 'stair-end' || node.kind === 'stair-inline' ? 'stair-post-node' : 'railing-post-node';
              return <g key={`rail-node-${idx}`} onClick={() => setInspect({ title: node.detail, detail: `${node.detail} at ${feetAndInches(node.point.x - deck.minX)}, ${feetAndInches(node.point.y - deck.minY)}.` })}>
                <rect x={p.x - 12} y={p.y - 12} width={24} height={24} className={cls} />
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
            {deck.edgeSegments.filter((segment) => segment.orientation === 'vertical' && Math.abs(segment.start.x - deck.minX) > 0.05).map((segment) => {
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


type GableWoodSegment = { x1: number; y1: number; x2: number; y2: number; boundary?: boolean; kind?: 'boundary' | 'style' | 'upright' };

function gableStyleWoodSegments(style: string, left: number, apexX: number, right: number, baseY: number, apexY: number, uprights = 0) {
  const midY = (baseY + apexY) / 2;
  const quarterLeft = left + (right - left) * 0.25;
  const quarterRight = right - (right - left) * 0.25;
  const nearApexLeft = left + (right - left) * 0.34;
  const nearApexRight = right - (right - left) * 0.34;
  const braceY = (baseY + apexY) * 0.56;
  const queenTopY = midY + 10;
  const segments: GableWoodSegment[] = [
    { x1: left, y1: baseY, x2: apexX, y2: apexY, boundary: true, kind: 'boundary' },
    { x1: apexX, y1: apexY, x2: right, y2: baseY, boundary: true, kind: 'boundary' },
    { x1: left, y1: baseY, x2: right, y2: baseY, boundary: true, kind: 'boundary' },
  ];
  if (style !== 'none') {
    segments.push({ x1: apexX, y1: apexY, x2: apexX, y2: baseY, kind: 'style' });
  }
  if (style === 'tied-king-post') {
    segments.push({ x1: quarterLeft, y1: midY, x2: apexX, y2: baseY, kind: 'style' });
    segments.push({ x1: quarterRight, y1: midY, x2: apexX, y2: baseY, kind: 'style' });
  }
  if (style === 'braced-king-post') {
    segments.push({ x1: nearApexLeft, y1: midY, x2: apexX, y2: braceY, kind: 'style' });
    segments.push({ x1: apexX, y1: braceY, x2: nearApexRight, y2: midY, kind: 'style' });
  }
  if (style === 'queen-king-post') {
    segments.push({ x1: quarterLeft, y1: baseY, x2: quarterLeft, y2: queenTopY, kind: 'style' });
    segments.push({ x1: quarterRight, y1: baseY, x2: quarterRight, y2: queenTopY, kind: 'style' });
  }
  const uprightCount = Math.max(0, Math.floor(uprights));
  for (let i = 1; i <= uprightCount; i += 1) {
    const x = left + ((right - left) * i) / (uprightCount + 1);
    const distToCenter = Math.abs(x - apexX);
    const halfW = Math.max(1, (right - left) / 2);
    const t = Math.max(0, 1 - distToCenter / halfW);
    const topY = baseY + (apexY - baseY) * t;
    segments.push({ x1: x, y1: baseY, x2: x, y2: topY, kind: 'upright' });
  }
  return segments;
}

function offsetTowardPoint(segment: GableWoodSegment, towardX: number, towardY: number, offset: number) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (segment.x1 + segment.x2) / 2;
  const my = (segment.y1 + segment.y2) / 2;
  const plusDist = Math.hypot(mx + nx * offset - towardX, my + ny * offset - towardY);
  const minusDist = Math.hypot(mx - nx * offset - towardX, my - ny * offset - towardY);
  return plusDist <= minusDist ? { x: nx * offset, y: ny * offset } : { x: -nx * offset, y: -ny * offset };
}

function gableFrameCuts(width: number, height: number, style: string, uprights = 0) {
  const half = width / 2;
  const rafter = Math.sqrt(half ** 2 + height ** 2);
  const diag = Math.sqrt((half * 0.42) ** 2 + (height * 0.45) ** 2);
  const cuts: number[] = [half, rafter, half, rafter];
  switch (style) {
    case 'none':
      break;
    case 'king-post':
      cuts.push(height, height);
      break;
    case 'tied-king-post':
      cuts.push(diag, diag, diag, diag, height * 0.55, height * 0.55);
      break;
    case 'braced-king-post':
      cuts.push(diag, diag, diag, diag, diag, diag, height * 0.55, height * 0.55);
      break;
    case 'queen-king-post':
      cuts.push(height, height, half * 0.2, half * 0.2, half * 0.2, half * 0.2);
      break;
    default:
      cuts.push(height, height);
      break;
  }
  const uprightCount = Math.max(0, Math.floor(uprights));
  for (let i = 1; i <= uprightCount; i += 1) {
    const x = (width * i) / (uprightCount + 1);
    const localHeight = x <= half ? (height * x) / half : (height * (width - x)) / half;
    if (localHeight > 0.05) cuts.push(localHeight, localHeight);
  }
  return cuts;
}

function ScreenPreview({ values, renaissance }: { values: Record<string, string | number | boolean>; renaissance: boolean }) {
  const sections = parseSections(values.sections, 3);
  const gableSections = parseGableSections(values.gableSections, 0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const scale = 34;
  const gutter = 20;
  const x0 = 48;
  const sectionMaxWidth = Math.max(...sections.map((section) => section.width * scale), 260);
  const sectionStackHeight = sections.reduce((sum, section) => sum + section.height * scale, 0) + Math.max(0, sections.length - 1) * gutter;
  const gableWidths = gableSections.reduce((sum, gable) => sum + gable.width * scale, 0) + Math.max(0, gableSections.length - 1) * gutter;
  const totalW = Math.max(sectionMaxWidth, gableWidths, 260);
  const gableHeight = gableSections.length ? Math.max(...gableSections.map((gable) => gable.height * scale)) : 0;
  const gableGap = gableSections.length ? 130 : 0;
  const legendRows = renaissance ? 2 : 2;
  const legendHeight = 124 + legendRows * 24;
  const totalH = sectionStackHeight + (gableSections.length ? gableHeight + gableGap : 0);
  const viewW = totalW + 140;
  const viewH = totalH + 240 + legendHeight;
  const gableStartX = x0 + (totalW - gableWidths) / 2;
  let runningGX = gableStartX;
  const screenLegendItems = renaissance
    ? [
        { label: '1x2 7/8', className: 'reno-1x2-line' },
        { label: '2x2 7/8 no groove', className: 'reno-2x2-line' },
        { label: '2x2 7/8 groove', className: 'reno-2x2-groove-line' },
        { label: 'pickets', className: 'reno-picket-line' },
        { label: 'wood gable structure', className: 'svg-outline' },
      ]
    : [
        { label: 'receiver', className: 'receiver-line' },
        { label: '1x2', className: 'onebytwo-line' },
        { label: '2x2', className: 'twobytwo-line' },
        { label: 'u-channel', className: 'picket-rail-line' },
        { label: 'pickets', className: 'picket-line' },
        { label: '1x2 v-groove', className: 'vgroove1-line' },
        { label: '2x2 v-groove', className: 'vgroove2-line' },
        { label: 'wood gable structure', className: 'svg-outline' },
      ];
  return (
    <div className="visual-card">
      <div className="visual-header">
        <div>
          <h3>Layout preview</h3>
          <span>Scaled installer plan with separate centered gable section layouts.</span>
        </div>
        <div className="preview-toolbar">
          <button type="button" className="ghost-btn small-btn" onClick={() => setZoom((z) => Math.max(0.8, z - 0.2))}>−</button><button type="button" className="ghost-btn small-btn" onClick={() => setZoom((z) => Math.min(2.2, z + 0.2))}>+</button><button type="button" className="ghost-btn small-btn" onClick={() => { void exportSvgSectionsAsPdf(svgRef.current, renaissance ? 'Renaissance screen room plan' : 'Screen room plan', renaissance ? 'sns-renaissance-plan.pdf' : 'sns-screen-room-plan.pdf'); }}>Export PDF</button>
        </div>
      </div>
      <div style={{ overflow: 'auto' }}><svg ref={svgRef} viewBox={`0 0 ${viewW} ${viewH}`} className="layout-svg" style={{ width: `${Math.max(100, zoom * 100)}%`, height: 'auto' }}>
        {Array.from({ length: Math.ceil(totalW / scale) + 4 }, (_, index) => <line key={`sx-${index}`} x1={x0 - 20 + index * scale} y1={28} x2={x0 - 20 + index * scale} y2={viewH - 20} className="svg-grid" />)}
        {Array.from({ length: Math.ceil(totalH / scale) + 4 }, (_, index) => <line key={`sy-${index}`} x1={20} y1={28 + index * scale} x2={viewW - 20} y2={28 + index * scale} className="svg-grid" />)}

        {gableSections.map((gable) => {
          const baseY = 92 + gableHeight;
          const gW = gable.width * scale;
          const baseLeft = runningGX;
          const baseRight = baseLeft + gW;
          runningGX += gW + gutter;
          const apexX = (baseLeft + baseRight) / 2;
          const apexY = baseY - gable.height * scale;
          const woodSegments = gableStyleWoodSegments(gable.style, baseLeft, apexX, baseRight, baseY, apexY, gable.uprights);
          const cuts = gableFrameCuts(gable.width, gable.height, gable.style, gable.uprights);
          const centroidX = apexX;
          const centroidY = (baseY * 2 + apexY) / 3;
          const materialOffset = renaissance ? 7 : 9;
          const secondaryOffset = renaissance ? 0 : 18;
          const boundaryFrameClass = renaissance ? 'reno-1x2-line' : 'onebytwo-line';
          return (
            <g key={gable.id} data-export-section="true">
              {woodSegments.map((seg, idx) => {
                const inward = offsetTowardPoint(seg, centroidX, centroidY, materialOffset);
                const outward = { x: -inward.x, y: -inward.y };
                const inwardSecondary = { x: inward.x + (renaissance ? 0 : (secondaryOffset * inward.x) / materialOffset), y: inward.y + (renaissance ? 0 : (secondaryOffset * inward.y) / materialOffset) };
                const outwardSecondary = { x: outward.x + (renaissance ? 0 : (secondaryOffset * outward.x) / materialOffset), y: outward.y + (renaissance ? 0 : (secondaryOffset * outward.y) / materialOffset) };
                if (seg.kind === 'upright') {
                  const cls = renaissance ? 'reno-2x2-line' : 'twobytwo-line';
                  return <line key={`mat-${idx}`} x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} className={cls} />;
                }
                if (seg.kind === 'boundary') {
                  return (
                    <g key={`mat-${idx}`}>
                      {!renaissance && <line x1={seg.x1 + inward.x} y1={seg.y1 + inward.y} x2={seg.x2 + inward.x} y2={seg.y2 + inward.y} className="receiver-line" />}
                      <line x1={seg.x1 + inwardSecondary.x} y1={seg.y1 + inwardSecondary.y} x2={seg.x2 + inwardSecondary.x} y2={seg.y2 + inwardSecondary.y} className={boundaryFrameClass} />
                    </g>
                  );
                }
                return (
                  <g key={`mat-${idx}`}>
                    {!renaissance && <>
                      <line x1={seg.x1 + inward.x} y1={seg.y1 + inward.y} x2={seg.x2 + inward.x} y2={seg.y2 + inward.y} className="receiver-line" />
                      <line x1={seg.x1 + outward.x} y1={seg.y1 + outward.y} x2={seg.x2 + outward.x} y2={seg.y2 + outward.y} className="receiver-line" />
                    </>}
                    <line x1={seg.x1 + inwardSecondary.x} y1={seg.y1 + inwardSecondary.y} x2={seg.x2 + inwardSecondary.x} y2={seg.y2 + inwardSecondary.y} className={boundaryFrameClass} />
                    <line x1={seg.x1 + outwardSecondary.x} y1={seg.y1 + outwardSecondary.y} x2={seg.x2 + outwardSecondary.x} y2={seg.y2 + outwardSecondary.y} className={boundaryFrameClass} />
                  </g>
                );
              })}
              {woodSegments.map((seg, idx) => <line key={`wood-${idx}`} x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} className="gable-wood-line" />)}
              <rect x={baseLeft - 10} y={apexY - 34} width={Math.min(gW + 20, 260)} height={26} rx="6" className="legend-box" />
              <text x={baseLeft} y={apexY - 18} className="svg-note">{`${gable.label} · ${feetAndInches(gable.width)} × ${feetAndInches(gable.height)}`}</text>
              <text x={baseLeft} y={baseY + 28} className="svg-note">{`${cuts.length} gable cuts`}</text>
            </g>
          );
        })}

        {(() => { let runningY = 154 + gableHeight; return sections.map((section) => {
          const sectionW = section.width * scale;
          const sectionH = section.height * scale;
          const left = x0 + (totalW - sectionW) / 2;
          const right = left + sectionW;
          const top = runningY;
          const bottom = top + sectionH;
          runningY += sectionH + gutter;
          const doorWidth = section.doorType === 'none' ? 0 : Math.min(section.doorWidth, section.width);
          const doorLeftFt = sectionDoorLeft(section) / 12;
          const doorRightFt = doorLeftFt + doorWidth;
          const doorLeft = left + doorLeftFt * scale;
          const doorRight = left + doorRightFt * scale;
          const spans = sectionSpansExcludingDoor(section);
          const kickHeight = section.kickPanel === 'none' ? 0 : Math.min(section.kickPanelHeight, section.kickPanel === 'trim-coil' ? 2 : 4);
          const kickTop = bottom - kickHeight * scale;
          const picketTop = bottom - 3 * scale;
          const chairRailYs = sectionChairRailHeights(section).map((height) => bottom - height * scale);
          const perimeterClass = renaissance ? 'reno-1x2-line' : section.kickPanel === 'trim-coil' ? 'vgroove1-line' : 'onebytwo-line';
          const uprightClass = renaissance ? ((section.pickets || section.kickPanel === 'insulated') ? 'reno-2x2-groove-line' : 'reno-2x2-line') : (section.kickPanel === 'trim-coil' ? 'vgroove2-line' : 'twobytwo-line');
          const chairRailClass = renaissance ? (section.pickets || section.kickPanel === 'insulated' ? 'reno-2x2-groove-line' : 'reno-2x2-line') : (section.kickPanel === 'trim-coil' ? 'vgroove2-line' : 'twobytwo-line');
          const doorFrameClass = renaissance ? 'reno-2x2-line' : 'twobytwo-line';
          const receiverInset = 4;
          const oneByInset = 12;
          const frameInset = 20;
          const doorHeight = Math.min(section.height, 6 + 8 / 12) * scale;
          const doorTop = bottom - frameInset - doorHeight;
          const doorJambTop = bottom - sectionDoorJambHeight(section) * scale;
          const picketBottom = section.kickPanel === 'none' ? bottom - 16 : kickTop + 10;
          const uprightXs = Array.from({ length: section.uprights }, (_, index) => ((index + 1) * section.width) / (section.uprights + 1)).filter((x) => spans.some((span) => x > span.start && x < span.end));
          return (
            <g key={section.id} data-export-section="true">
              <rect x={left} y={top} width={sectionW} height={sectionH} className="screen-box" rx="8" />
              <text x={left} y={top - 12} className="svg-note">{`${section.label} · ${feetAndInches(section.width)} x ${feetAndInches(section.height)}`}</text>
              {!renaissance && <>
                <line x1={left + receiverInset} y1={top + receiverInset} x2={left + receiverInset} y2={bottom - receiverInset} className="receiver-line" />
                <line x1={right - receiverInset} y1={top + receiverInset} x2={right - receiverInset} y2={bottom - receiverInset} className="receiver-line" />
                <line x1={left + receiverInset} y1={top + receiverInset} x2={right - receiverInset} y2={top + receiverInset} className="receiver-line" />
                {spans.map((span, idx) => <line key={`rb-${idx}`} x1={left + span.start * scale + receiverInset} y1={bottom - receiverInset} x2={left + span.end * scale - receiverInset} y2={bottom - receiverInset} className="receiver-line" />)}
                {section.kickPanel === 'insulated' && spans.map((span, idx) => <line key={`rk-${idx}`} x1={left + span.start * scale + receiverInset + 6} y1={kickTop + receiverInset + 4} x2={left + span.end * scale - receiverInset - 6} y2={kickTop + receiverInset + 4} className="receiver-line" />)}
              </>}
              {renaissance && <>
                <line x1={left + oneByInset} y1={top + oneByInset} x2={left + oneByInset} y2={bottom - oneByInset} className="reno-1x2-line" />
                <line x1={right - oneByInset} y1={top + oneByInset} x2={right - oneByInset} y2={bottom - oneByInset} className="reno-1x2-line" />
                <line x1={left + oneByInset} y1={top + oneByInset} x2={right - oneByInset} y2={top + oneByInset} className="reno-1x2-line" />
                {spans.map((span, idx) => <line key={`rbase-${idx}`} x1={left + span.start * scale + oneByInset} y1={bottom - oneByInset} x2={left + span.end * scale - oneByInset} y2={bottom - oneByInset} className="reno-1x2-line" />)}
              </>}
              {!renaissance && <>
                <line x1={left + oneByInset} y1={top + oneByInset} x2={left + oneByInset} y2={bottom - oneByInset} className={perimeterClass} />
                <line x1={right - oneByInset} y1={top + oneByInset} x2={right - oneByInset} y2={bottom - oneByInset} className={perimeterClass} />
                <line x1={left + oneByInset} y1={top + oneByInset} x2={right - oneByInset} y2={top + oneByInset} className={perimeterClass} />
                {section.kickPanel !== 'insulated' && spans.map((span, idx) => <line key={`base-${idx}`} x1={left + span.start * scale + oneByInset} y1={bottom - oneByInset} x2={left + span.end * scale - oneByInset} y2={bottom - oneByInset} className={perimeterClass} />)}
              </>}
              {section.kickPanel !== 'none' && spans.map((span, idx) => <g key={`kick-${idx}`}><rect x={left + span.start * scale + frameInset - 2} y={kickTop + 10} width={Math.max(0, (span.end - span.start) * scale - frameInset * 2 + 4)} height={Math.max(0, bottom - kickTop - 20)} className="kick-panel-fill" rx="4" /><line x1={left + span.start * scale + frameInset} y1={kickTop} x2={left + span.end * scale - frameInset} y2={kickTop} className={chairRailClass} /></g>)}
              {section.pickets && spans.map((span, idx) => <g key={`p-${idx}`}><line x1={left + span.start * scale + frameInset} y1={picketTop} x2={left + span.end * scale - frameInset} y2={picketTop} className={renaissance ? 'reno-picket-line' : 'picket-rail-line'} />{Array.from({ length: Math.max(0, Math.ceil(((span.end - span.start) * 12) / 4)) }, (_, picketIndex) => { const px = left + span.start * scale + frameInset + (((span.end - span.start) * scale - frameInset * 2) * (picketIndex + 0.5)) / Math.max(Math.ceil(((span.end - span.start) * 12) / 4), 1); return <line key={picketIndex} x1={px} y1={picketTop + 4} x2={px} y2={picketBottom} className="picket-line" />; })}</g>)}
              {chairRailYs.flatMap((chairY, railIdx) => spans.map((span, idx) => <line key={`chair-${railIdx}-${idx}`} x1={left + span.start * scale + frameInset} y1={chairY} x2={left + span.end * scale - frameInset} y2={chairY} className={chairRailClass} />))}
              {uprightXs.map((x, idx) => <line key={`upr-${idx}`} x1={left + x * scale} y1={top + frameInset} x2={left + x * scale} y2={bottom - frameInset} className={uprightClass} />)}
              {section.doorType !== 'none' && <><rect x={doorLeft + frameInset - 8} y={doorTop} width={Math.max(0, doorRight - doorLeft - frameInset * 2 + 16)} height={Math.max(0, bottom - doorTop - 18)} className="door-fill" rx="8" /><line x1={doorLeft + frameInset} y1={doorJambTop} x2={doorLeft + frameInset} y2={bottom - frameInset} className={doorFrameClass} /><line x1={doorRight - frameInset} y1={doorJambTop} x2={doorRight - frameInset} y2={bottom - frameInset} className={doorFrameClass} /><line x1={doorLeft + frameInset} y1={doorTop} x2={doorRight - frameInset} y2={doorTop} className={doorFrameClass} /></>}
            </g>
          );
        })})()}
        <g transform={`translate(${x0}, ${viewH - 86})`} data-export-legend="true">
          <rect x={-18} y={-30} width={Math.max(760, totalW + 36)} height={legendHeight - 18} rx="12" className="legend-box" />
          {screenLegendItems.map((item, idx) => {
            const row = Math.floor(idx / 4);
            const col = idx % 4;
            const baseX = col * 188;
            const baseY = row * 22;
            return <g key={`${item.label}-${idx}`} transform={`translate(${baseX}, ${baseY})`}><line x1={0} y1={0} x2={22} y2={0} className={item.className} /><text x={30} y={4} className="svg-note">{item.label}</text></g>;
          })}
        </g>
      </svg></div>
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
  const svgRef = useRef<SVGSVGElement | null>(null);

  return <div className="visual-card">
    <div className="visual-header">
      <div>
        <h3>Layout preview</h3>
        <span>Scaled roof plan with beam line, support beams, post layout, gutter, fascia, and strategic fan-beam placement.</span>
      </div>
      <div className="preview-toolbar">{fanBeam !== 'none' && onValuesChange && <><button type="button" className="ghost-btn small-btn" onClick={() => shiftFan(-1)}>← Fan beam</button><button type="button" className="ghost-btn small-btn" onClick={() => shiftFan(1)}>Fan beam →</button></>}<button type="button" className="ghost-btn small-btn" onClick={() => { void exportSvgAsPdf(svgRef.current, 'Patio cover plan', 'sns-patio-cover-plan.pdf'); }}>Export PDF</button></div>
    </div>
    <svg ref={svgRef} viewBox={`0 0 ${roofW + 130} ${roofD + 180}`} className="layout-svg patio-sheet-svg">
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
      <line x1={beamLeft} y1={y0 + roofD - projectionOverhang * scale} x2={beamRight} y2={y0 + roofD - projectionOverhang * scale} className="beam-line" />
      {supportYs.map((y, index) => <g key={`support-${index}`}><line x1={beamLeft} y1={y} x2={beamRight} y2={y} className="beam-line support" />{Array.from({ length: supportPostCount }, (_, postIndex) => {
        const x = beamLeft + ((beamRight - beamLeft) * postIndex) / Math.max(supportPostCount - 1, 1);
        return <rect key={`support-post-${index}-${postIndex}`} x={x - 5} y={y - 5} width="10" height="10" className="post-node support-post" rx="2" />;
      })}</g>)}
      {postXs.map((x, index) => <g key={`post-${index}`}><rect x={x - 6} y={y0 + roofD - projectionOverhang * scale - 6} width="12" height="12" className="post-node" rx="2" /><text x={x - 10} y={y0 + roofD + 22} className="svg-note">P{index + 1}</text></g>)}
      <line x1={x0} y1={y0 + roofD + 40} x2={x0 + roofW} y2={y0 + roofD + 40} className="dimension-line" />
      <text x={x0 + roofW / 2 - 16} y={y0 + roofD + 34} className="svg-note">{feetAndInches(width)}</text>
      <line x1={x0 - 28} y1={y0} x2={x0 - 28} y2={y0 + roofD} className="dimension-line" />
      <text x={x0 - 62} y={y0 + roofD / 2} className="svg-note">{feetAndInches(projection)}</text>
      <text x={x0} y={y0 + roofD + 62} className="svg-note">{`${beamStyle} beam · ${frontPostCount} front posts · ${supportBeamCount} intermediate beam(s)${supportBeamCount ? ` · ${supportPostCount} posts each` : ''} · ${frontOverhang}' side overhang · ${projectionOverhang}' projection overhang`}</text>
    </svg>
    <div className="legend-row wrap-legend"><span><i className="legend-swatch roof-panel-swatch" /> regular panel</span><span><i className="legend-swatch fan-panel-swatch" /> fan-beam panel</span><span><i className="legend-swatch cut-panel-swatch" /> cut closure panel</span><span><i className="legend-swatch beam-line-swatch" /> beam</span></div>
  </div>;
}

function SunroomPreview({ values }: { values: Record<string, string | number | boolean> }) {
  const sections = parseSunroomSections(values.sunroomSections, 3);
  const framingColor = String(values.framingColor ?? 'white');
  const panelColor = String(values.panelColor ?? framingColor);
  const windowColor = String(values.windowColor ?? framingColor);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scale = 34;
  const gutter = 22;
  const totalW = sections.reduce((sum, section) => sum + section.width * scale, 0) + Math.max(0, sections.length - 1) * gutter;
  const totalH = Math.max(...sections.map((section) => section.height * scale), 220);
  const viewW = totalW + 180;
  const viewH = totalH + 220;
  const x0 = (viewW - totalW) / 2;
  const y0 = 80;
  const frontWidth = sections.reduce((sum, section) => sum + section.width, 0);
  let runningX = x0;
  const windowFill = 'rgba(77,131,209,0.18)';
  const panelFill = 'rgba(255,255,255,0.72)';
  return (
    <div className="visual-card">
      <div className="visual-header">
        <div>
          <h3>Layout preview</h3>
          <span>Elite Add-A-Room wall sections with color-coded channels, DRC, uprights, and fill zones.</span>
        </div>
        <div className="preview-toolbar"><button type="button" className="ghost-btn small-btn" onClick={() => { void exportSvgAsPdf(svgRef.current, 'Sunroom plan', 'sns-sunroom-plan.pdf'); }}>Export PDF</button></div>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${viewW} ${viewH}`} className="layout-svg patio-sheet-svg">
        {Array.from({ length: Math.ceil(totalW / scale) + 4 }, (_, index) => <line key={`sun-gx-${index}`} x1={x0 - 20 + index * scale} y1={24} x2={x0 - 20 + index * scale} y2={viewH - 50} className="svg-grid" />)}
        {Array.from({ length: Math.ceil(totalH / scale) + 4 }, (_, index) => <line key={`sun-gy-${index}`} x1={24} y1={24 + index * scale} x2={viewW - 24} y2={24 + index * scale} className="svg-grid" />)}
        {sections.map((section) => {
          const w = section.width * scale;
          const h = section.height * scale;
          const left = runningX;
          const top = y0 + (totalH - h);
          const bottom = top + h;
          runningX += w + gutter;
          const kickHeight = Math.max(0, Math.min(section.kickHeight, 4));
          const transomNeeded = section.transomType === 'panel' || section.transomType === 'picture-window' || (section.transomType === 'auto' && section.height > 10 && section.mainSection !== 'picture-window');
          const transomMaxHeight = transomNeeded ? Math.max(section.leftTransomHeight, section.rightTransomHeight) : 0;
                    const mainTop = top + transomMaxHeight * scale;
          const kickTop = bottom - kickHeight * scale;
          const mainBottom = section.kickSection === 'none' ? bottom : kickTop;
          const receiverInset = 4;
          const frameInset = 12;
          const bayCount = Math.max(1, section.uprights + 1);
          const showKickUprights = section.uprightMode === 'main-kick' || section.uprightMode === 'all';
          const showTransomUprights = section.uprightMode === 'main-transom' || section.uprightMode === 'all';
          const uprightXs = Array.from({ length: section.uprights }, (_, idx) => left + ((idx + 1) * w) / (section.uprights + 1));
          const doorWidth = section.doorType === 'slider' ? 6 * scale : section.doorType === 'single' ? 3 * scale : 0;
          const doorLeft = left + Math.max(0, (w - doorWidth) / 2);
          const mainFillColor = section.mainSection === 'panel' ? panelFill : windowFill;
          const kickFillColor = section.kickSection === 'panel' || section.kickSection === 'insulated' ? panelFill : section.kickSection === 'window' ? windowFill : 'transparent';
          const transomFillColor = !transomNeeded ? 'transparent' : section.transomType === 'picture-window' ? windowFill : panelFill;
          const transomPoly = transomNeeded ? `${left + frameInset},${top + section.leftTransomHeight * scale} ${left + w - frameInset},${top + section.rightTransomHeight * scale} ${left + w - frameInset},${mainTop} ${left + frameInset},${mainTop}` : '';
          return (
            <g key={section.id} data-export-section="true">
              <rect x={left} y={top} width={w} height={h} className="screen-box" rx="6" />
              <text x={left} y={top - 10} className="svg-note">{`${section.label} · ${feetAndInches(section.width)}`}</text>
              <line x1={left + receiverInset} y1={top + receiverInset} x2={left + receiverInset} y2={bottom - receiverInset} className="sunroom-receiver-line" />
              <line x1={left + w - receiverInset} y1={top + receiverInset} x2={left + w - receiverInset} y2={bottom - receiverInset} className="sunroom-receiver-line" />
              <line x1={left + receiverInset} y1={top + receiverInset} x2={left + w - receiverInset} y2={top + receiverInset} className="sunroom-topcap-line" />
              {(section.mainSection !== 'panel' || transomNeeded) && <line x1={left + frameInset} y1={top + frameInset} x2={left + w - frameInset} y2={top + frameInset} className="sunroom-receiver-line" />}
              <line x1={left + receiverInset} y1={bottom - receiverInset} x2={left + w - receiverInset} y2={bottom - receiverInset} className="sunroom-base-line" />
              <line x1={left + frameInset} y1={top + frameInset} x2={left + frameInset} y2={bottom - frameInset} className="sunroom-drc-line" />
              <line x1={left + w - frameInset} y1={top + frameInset} x2={left + w - frameInset} y2={bottom - frameInset} className="sunroom-drc-line" />
              {uprightXs.map((x, idx) => {
                const y1 = showTransomUprights ? top + frameInset : mainTop;
                const y2 = showKickUprights ? bottom - frameInset : mainBottom;
                return <g key={idx}><line x1={x} y1={y1} x2={x} y2={y2} className="sunroom-hbeam-line" /><line x1={x - 6} y1={y1} x2={x - 6} y2={y2} className="sunroom-drc-line" /><line x1={x + 6} y1={y1} x2={x + 6} y2={y2} className="sunroom-drc-line" />{section.electricChase && <line x1={x} y1={y1} x2={x} y2={y2} className="sunroom-chase-line" />}</g>;
              })}
              {mainBottom > mainTop && <rect x={left + 18} y={mainTop + 6} width={Math.max(0, w - 36)} height={Math.max(0, mainBottom - mainTop - 12)} fill={mainFillColor} stroke="rgba(0,0,0,0.12)" rx="4" />}
              {section.kickSection !== 'none' && <rect x={left + 18} y={kickTop + 6} width={Math.max(0, w - 36)} height={Math.max(0, bottom - kickTop - 12)} fill={kickFillColor} stroke="rgba(0,0,0,0.12)" rx="4" />}
              {section.kickSection !== 'none' && !showKickUprights && <line x1={left + frameInset} y1={kickTop} x2={left + w - frameInset} y2={kickTop} className="sunroom-hbeam-support-line" />}
              {section.kickSection !== 'none' && <line x1={left + frameInset} y1={kickTop} x2={left + w - frameInset} y2={kickTop} className={section.kickSection === 'window' ? 'sunroom-receiver-line' : 'sunroom-hbeam-line'} />}
              {section.kickSection === 'window' && <>
                <line x1={left + frameInset} y1={kickTop - 6} x2={left + w - frameInset} y2={kickTop - 6} className="sunroom-drc-line" />
                <line x1={left + frameInset} y1={kickTop + 6} x2={left + w - frameInset} y2={kickTop + 6} className="sunroom-drc-line" />
                <line x1={left + frameInset} y1={bottom - frameInset} x2={left + w - frameInset} y2={bottom - frameInset} className="sunroom-receiver-line" />
              </>}
              {transomNeeded && <polygon points={transomPoly} fill={transomFillColor} stroke="rgba(0,0,0,0.12)" />}
              {transomNeeded && !showTransomUprights && <line x1={left + frameInset} y1={mainTop} x2={left + w - frameInset} y2={mainTop} className="sunroom-hbeam-support-line" />}
              {transomNeeded && <line x1={left + frameInset} y1={mainTop} x2={left + w - frameInset} y2={mainTop} className="sunroom-receiver-line" />}
              {transomNeeded && (section.transomType === 'picture-window') && <>
                <line x1={left + frameInset} y1={mainTop - 6} x2={left + w - frameInset} y2={mainTop - 6} className="sunroom-drc-line" />
                <line x1={left + frameInset} y1={mainTop + 6} x2={left + w - frameInset} y2={mainTop + 6} className="sunroom-drc-line" />
              </>}
              {section.doorType !== 'none' && <rect x={doorLeft} y={bottom - (6 + 8/12) * scale} width={doorWidth} height={(6 + 8/12) * scale} className="door-fill" rx="4" />}
              <text x={left + 6} y={bottom + 16} className="svg-note">{`${bayCount} bay${bayCount === 1 ? '' : 's'}`}</text>
            </g>
          );
        })}
        <text x={x0} y={y0 + totalH + 24} className="svg-note">{`Front ${feetAndInches(frontWidth)} · ${framingColor} frame · ${panelColor} panel · ${windowColor} window`}</text>
        <g transform={`translate(${x0}, ${viewH - 28})`}>
          <line x1={0} y1={0} x2={18} y2={0} className="sunroom-receiver-line" /><text x={24} y={4} className="svg-note">Receiver</text>
          <line x1={104} y1={0} x2={122} y2={0} className="sunroom-drc-line" /><text x={128} y={4} className="svg-note">DRC</text>
          <line x1={180} y1={0} x2={198} y2={0} className="sunroom-topcap-line" /><text x={204} y={4} className="svg-note">Top cap</text>
          <line x1={280} y1={0} x2={298} y2={0} className="sunroom-base-line" /><text x={304} y={4} className="svg-note">Base channel</text>
          <line x1={400} y1={0} x2={418} y2={0} className="sunroom-hbeam-line" /><text x={424} y={4} className="svg-note">H-beam</text>
          <line x1={500} y1={0} x2={518} y2={0} className="sunroom-chase-line" /><text x={524} y={4} className="svg-note">Electric chase</text>
          <rect x={620} y={-8} width={18} height={12} fill="rgba(77,131,209,0.18)" stroke="rgba(0,0,0,0.12)" /><text x={644} y={4} className="svg-note">Window zone</text>
          <rect x={744} y={-8} width={18} height={12} fill="rgba(255,255,255,0.72)" stroke="rgba(0,0,0,0.12)" /><text x={768} y={4} className="svg-note">Panel zone</text>
        </g>
      </svg>
    </div>
  );
}

export function LayoutPreview({ serviceSlug, values, onValuesChange }: LayoutPreviewProps) { if (serviceSlug === 'decks') return <DeckPreview values={values} onValuesChange={onValuesChange} />; if (serviceSlug === 'patio-covers') return <PatioPreview values={values} onValuesChange={onValuesChange} />; if (serviceSlug === 'screen-rooms') return <ScreenPreview values={values} renaissance={false} />; if (serviceSlug === 'renaissance-screen-rooms') return <ScreenPreview values={values} renaissance />; return <SunroomPreview values={values} />; }
