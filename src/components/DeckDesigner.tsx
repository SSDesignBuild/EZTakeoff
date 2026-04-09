import { MouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { buildDeckModel, parseDeckShape } from '../lib/deckModel';
import { DeckPoint, LockedPostPoint } from '../lib/types';

const GRID_SIZE = 1 / 12;
const VIEW_SIZE = 1800;
const PADDING = 72;
const BASE_VIEW_FEET = 25;
const TEN_FOOT_GRID = 10;
const ONE_FOOT_GRID = 1;
const INCH_GRID = 1 / 12;
const SNAP_TOLERANCE = 0.4;
const defaultShape: DeckPoint[] = [];

type EditMode = 'points' | 'railing' | 'stairs' | 'beams' | 'posts';
type BeamEdit = { beamIndex: number; startTrim: number; endTrim: number };
type Snapshot = Pick<Record<string, string | number | boolean>, 'deckShape' | 'manualRailingEdges' | 'customBeamYs' | 'stairEdgeIndex' | 'stairOffset' | 'lockedPosts' | 'beamEdits'>;
type DesignerHistory = { shot: Snapshot; drawingSequence: boolean; selectedIndex: number | null };

const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;
const parseNumberArray = (raw: string | number | boolean | undefined) => typeof raw === 'string' && raw.trim() ? JSON.parse(raw) as number[] : [];
const parseLockedPosts = (raw: string | number | boolean | undefined): LockedPostPoint[] => typeof raw === 'string' && raw.trim() ? JSON.parse(raw) as LockedPostPoint[] : [];
const parseBeamEdits = (raw: string | number | boolean | undefined): BeamEdit[] => typeof raw === 'string' && raw.trim() ? JSON.parse(raw) as BeamEdit[] : [];

const polygonArea = (points: DeckPoint[]) => points.length < 3 ? 0 : Math.abs(points.reduce((sum, current, index) => {
  const next = points[(index + 1) % points.length];
  return sum + (current.x * next.y - next.x * current.y);
}, 0) / 2);

const polygonPerimeter = (points: DeckPoint[]) => points.length < 2 ? 0 : points.reduce((sum, current, index) => {
  const next = points[(index + 1) % points.length];
  return sum + Math.hypot(next.x - current.x, next.y - current.y);
}, 0);


const feetAndInches = (value: number) => {
  const totalInches = Math.round(value * 12);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches ? `${feet}' ${inches}"` : `${feet}'`;
};

interface DeckDesignerProps {
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

export function DeckDesigner({ values, onValuesChange }: DeckDesignerProps) {
  const points = useMemo(() => {
    if (typeof values.deckShape === 'string') {
      try {
        const parsed = JSON.parse(values.deckShape);
        if (Array.isArray(parsed)) return parsed as DeckPoint[];
      } catch {}
    }
    return parseDeckShape(values.deckShape);
  }, [values.deckShape]);

  const model = useMemo(() => buildDeckModel(values), [values]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<EditMode>('points');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [draggingBeamIndex, setDraggingBeamIndex] = useState<number | null>(null);
  const [draggingStair, setDraggingStair] = useState(false);
  const [drawingSequence, setDrawingSequence] = useState(points.length === 0);
  const [previewPoint, setPreviewPoint] = useState<DeckPoint | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewCenter] = useState({ x: BASE_VIEW_FEET / 2, y: BASE_VIEW_FEET / 2 });
  const [history, setHistory] = useState<DesignerHistory[]>([]);
  const [future, setFuture] = useState<DesignerHistory[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const viewFeet = Math.max(8, BASE_VIEW_FEET / zoom);
  const limits = {
    minX: viewCenter.x - viewFeet / 2,
    maxX: viewCenter.x + viewFeet / 2,
    minY: viewCenter.y - viewFeet / 2,
    maxY: viewCenter.y + viewFeet / 2,
  };
  const spanX = Math.max(limits.maxX - limits.minX, 1);
  const spanY = Math.max(limits.maxY - limits.minY, 1);
  const scale = Math.min((VIEW_SIZE - PADDING * 2) / spanX, (VIEW_SIZE - PADDING * 2) / spanY);
  const drawingScale = scale;
  const railingEdges = useMemo(() => new Set(parseNumberArray(values.manualRailingEdges).map((value) => Math.round(value))), [values.manualRailingEdges]);
  const beamOffsets = useMemo(() => {
    const parsed = parseNumberArray(values.customBeamYs);
    return parsed.length > 0 ? parsed : model.beamLines.map((line) => line.offsetFromHouse);
  }, [model.beamLines, values.customBeamYs]);
  const lockedPosts = useMemo(() => parseLockedPosts(values.lockedPosts), [values.lockedPosts]);
  const beamEdits = useMemo(() => parseBeamEdits(values.beamEdits), [values.beamEdits]);

  const snapshot = (): DesignerHistory => ({
    shot: {
      deckShape: values.deckShape,
      manualRailingEdges: values.manualRailingEdges,
      customBeamYs: values.customBeamYs,
      stairEdgeIndex: values.stairEdgeIndex,
      stairOffset: values.stairOffset,
      lockedPosts: values.lockedPosts,
      beamEdits: values.beamEdits,
    },
    drawingSequence,
    selectedIndex,
  });

  const applySnapshot = (entry: DesignerHistory) => {
    onValuesChange((current) => ({ ...current, ...entry.shot }));
    setDrawingSequence(entry.drawingSequence);
    setSelectedIndex(entry.selectedIndex);
    setPreviewPoint(null);
  };

  const pushHistory = () => setHistory((current) => [...current.slice(-39), snapshot()]);

  const commitChange = (producer: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => {
    pushHistory();
    setFuture([]);
    onValuesChange(producer);
  };

  const updateShape = (nextPoints: DeckPoint[], keepSelected?: number | null) => {
    commitChange((current) => ({ ...current, deckShape: JSON.stringify(nextPoints) }));
    if (keepSelected !== undefined) setSelectedIndex(keepSelected);
  };
  const updateNumberArray = (key: string, next: number[]) => commitChange((current) => ({ ...current, [key]: JSON.stringify(next.map((value) => snap(value))) }));
  const updateLockedPosts = (next: LockedPostPoint[]) => commitChange((current) => ({ ...current, lockedPosts: JSON.stringify(next) }));

  const toSvgPoint = (point: DeckPoint) => ({ x: PADDING + (point.x - limits.minX) * drawingScale, y: PADDING + (point.y - limits.minY) * drawingScale });
  const fromClientToModelPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VIEW_SIZE;
    const y = ((clientY - rect.top) / rect.height) * VIEW_SIZE;
    return { x: snap(limits.minX + (x - PADDING) / drawingScale), y: snap(limits.minY + (y - PADDING) / drawingScale) };
  };

  useEffect(() => {
    if (points.length === 0) {
      setDrawingSequence(true);
      setSelectedIndex(null);
      setPreviewPoint(null);
    }
  }, [points.length]);

  const constrainedPoint = (index: number, point: DeckPoint) => {
    if (points.length < 3) return { x: snap(point.x), y: snap(point.y) };
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    let x = point.x;
    let y = point.y;
    [prev.x, next.x].forEach((candidate) => { if (Math.abs(candidate - x) <= SNAP_TOLERANCE) x = candidate; });
    [prev.y, next.y].forEach((candidate) => { if (Math.abs(candidate - y) <= SNAP_TOLERANCE) y = candidate; });
    return { x: snap(x), y: snap(y) };
  };

  const appendPoint = (point: DeckPoint) => {
    const next = [...points, { x: snap(point.x), y: snap(point.y) }];
    commitChange((current) => ({ ...current, deckShape: JSON.stringify(next) }));
    setSelectedIndex(next.length - 1);
  };

  const finishDrawing = () => {
    if (points.length < 3) return;
    pushHistory();
    setFuture([]);
    setDrawingSequence(false);
    setSelectedIndex(null);
    setPreviewPoint(null);
  };

  const handleCanvasClick = (event: MouseEvent<SVGSVGElement>) => {
    if (mode !== 'points') return;
    const point = fromClientToModelPoint(event.clientX, event.clientY);
    if (!point) return;
    if (drawingSequence) {
      appendPoint(point);
      return;
    }
  };

  const updatePoint = (index: number, axis: 'x' | 'y', nextValue: number) => {
    const next = points.map((point, currentIndex) => currentIndex === index ? { ...point, [axis]: snap(nextValue) } : point);
    updateShape(next, index);
  };

  const nudgeSelectedPoint = (axis: 'x' | 'y', direction: -1 | 1) => {
    if (selectedIndex === null) return;
    const currentPoint = points[selectedIndex];
    updatePoint(selectedIndex, axis, currentPoint[axis] + (direction * INCH_GRID));
  };

  const insertPointAtEdge = (edgeIndex: number) => {
    const start = points[edgeIndex];
    const end = points[(edgeIndex + 1) % points.length];
    const mid = { x: snap((start.x + end.x) / 2), y: snap((start.y + end.y) / 2) };
    const next = [...points.slice(0, edgeIndex + 1), mid, ...points.slice(edgeIndex + 1)];
    updateShape(next, edgeIndex + 1);
  };

  const removeSelected = () => {
    if (selectedIndex === null || points.length <= 3) return;
    setSelectedIndex(null);
    updateShape(points.filter((_, index) => index !== selectedIndex), null);
  };

  const resetShape = () => {
    pushHistory();
    setFuture([]);
    setDrawingSequence(true);
    setSelectedIndex(null);
    setPreviewPoint(null);
    onValuesChange((current) => ({ ...current, deckShape: JSON.stringify(defaultShape), manualRailingEdges: JSON.stringify([]), customBeamYs: JSON.stringify([]), lockedPosts: JSON.stringify([]), beamEdits: JSON.stringify([]), stairEdgeIndex: -1, stairOffset: 0 }));
  };

  const toggleRailingEdge = (edgeIndex: number) => {
    const next = new Set(railingEdges);
    if (next.has(edgeIndex)) next.delete(edgeIndex); else next.add(edgeIndex);
    updateNumberArray('manualRailingEdges', Array.from(next.values()));
  };

  const selectStairEdge = (edgeIndex: number) => commitChange((current) => ({ ...current, stairEdgeIndex: edgeIndex, stairOffset: 0 }));
  const addBeamLine = () => updateNumberArray('customBeamYs', [...beamOffsets, Math.max(0.5, snap(model.depth / 2))].sort((a, b) => a - b));
  const removeBeamLine = (index: number) => commitChange((current) => ({
    ...current,
    customBeamYs: JSON.stringify(beamOffsets.filter((_, currentIndex) => currentIndex !== index)),
    beamEdits: JSON.stringify(beamEdits.filter((item) => item.beamIndex !== index).map((item) => ({ ...item, beamIndex: item.beamIndex > index ? item.beamIndex - 1 : item.beamIndex }))),
  }));
  const updateBeamEdit = (index: number, key: 'startTrim' | 'endTrim', value: number) => commitChange((current) => {
    const next = [...beamEdits];
    const match = next.findIndex((item) => item.beamIndex === index);
    const safe = Math.max(0, snap(value));
    if (match >= 0) next[match] = { ...next[match], [key]: safe };
    else next.push({ beamIndex: index, startTrim: key === 'startTrim' ? safe : 0, endTrim: key === 'endTrim' ? safe : 0 });
    return { ...current, beamEdits: JSON.stringify(next.sort((a, b) => a.beamIndex - b.beamIndex)) };
  });
  const toggleLockedPost = (beamIndex: number, x: number) => {
    const matchIndex = lockedPosts.findIndex((item) => item.beamIndex === beamIndex && Math.abs(item.x - x) < 0.1);
    const next = [...lockedPosts];
    if (matchIndex >= 0) next.splice(matchIndex, 1); else next.push({ beamIndex, x: snap(x) });
    updateLockedPosts(next);
  };

  const undo = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [snapshot(), ...current]);
    applySnapshot(previous);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture((current) => current.slice(1));
    setHistory((current) => [...current, snapshot()]);
    applySnapshot(next);
  };

  const onPointPointerDown = (event: PointerEvent<SVGCircleElement>, index: number) => {
    if (drawingSequence) return;
    event.preventDefault();
    setMode('points');
    setSelectedIndex(index);
    pushHistory();
    setFuture([]);
    setDraggingIndex(index);
  };

  const onBeamPointerDown = (event: PointerEvent<SVGLineElement>, index: number) => {
    event.preventDefault();
    setMode('beams');
    pushHistory();
    setFuture([]);
    setDraggingBeamIndex(index);
  };

  const onStairPointerDown = (event: PointerEvent<SVGLineElement>) => {
    event.preventDefault();
    setMode('stairs');
    pushHistory();
    setFuture([]);
    setDraggingStair(true);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = fromClientToModelPoint(event.clientX, event.clientY);
    if (!point) return;
    if (drawingSequence && mode === 'points') {
      setPreviewPoint(point);
      return;
    }
    if (draggingIndex !== null) {
      const next = points.map((current, index) => index === draggingIndex ? constrainedPoint(index, point) : current);
      onValuesChange((current) => ({ ...current, deckShape: JSON.stringify(next) }));
      return;
    }
    if (draggingBeamIndex !== null) {
      onValuesChange((current) => ({ ...current, customBeamYs: JSON.stringify(beamOffsets.map((value, currentIndex) => currentIndex === draggingBeamIndex ? snap(point.y - model.minY) : value).sort((a, b) => a - b)) }));
      return;
    }
    if (draggingStair && model.stairPlacement.edgeIndex !== null) {
      const edge = model.edgeSegments[model.stairPlacement.edgeIndex];
      const dx = edge.end.x - edge.start.x;
      const dy = edge.end.y - edge.start.y;
      const lenSq = (dx * dx) + (dy * dy) || 1;
      const projection = ((((point.x - edge.start.x) * dx) + ((point.y - edge.start.y) * dy)) / lenSq) * edge.length;
      const nextOffset = Math.max(0, Math.min(edge.length - model.stairPlacement.width, projection));
      onValuesChange((current) => ({ ...current, stairOffset: snap(nextOffset) }));
    }
  };

  useEffect(() => {
    const release = () => {
      setDraggingIndex(null);
      setDraggingBeamIndex(null);
      setDraggingStair(false);
    };
    window.addEventListener('pointerup', release);
    return () => window.removeEventListener('pointerup', release);
  }, []);

  const lastPoint = points[points.length - 1] ?? null;
  const previewDelta = lastPoint && previewPoint ? { dx: previewPoint.x - lastPoint.x, dy: previewPoint.y - lastPoint.y, distance: Math.hypot(previewPoint.x - lastPoint.x, previewPoint.y - lastPoint.y) } : null;
  const previewMid = lastPoint && previewPoint ? { x: (lastPoint.x + previewPoint.x) / 2, y: (lastPoint.y + previewPoint.y) / 2 } : null;

  return (
    <div className="content-card deck-designer-card">
      <div className="section-heading inline-heading">
        <div>
          <p className="eyebrow">Deck layout</p>
          <h3>Draw, drag, snap, and lock the footprint</h3>
        </div>
        <div className="tag-row">
          <span className="tag">Snap: 1 in</span>
          <span className="tag">Points: {points.length}</span>
          <span className="tag">Mode: {drawingSequence ? 'drawing' : mode}</span>
          <span className="tag">View: {feetAndInches(viewFeet)} × {feetAndInches(viewFeet)}</span>
          <button type="button" className="ghost-btn small-btn" onClick={() => setZoom((current) => Math.max(0.5, Number((current - 0.1).toFixed(2))))}>−</button>
          <span className="tag">Zoom {Math.round(zoom * 100)}%</span>
          <button type="button" className="ghost-btn small-btn" onClick={() => setZoom((current) => Math.min(2.5, Number((current + 0.1).toFixed(2))))}>+</button>
        </div>
      </div>
      <div className="designer-mode-row tidy-mode-row">
        {(['points', 'railing', 'stairs', 'beams', 'posts'] as EditMode[]).map((item) => (
          <button key={item} type="button" className={mode === item ? 'secondary-btn mode-btn active' : 'ghost-btn mode-btn'} onClick={() => setMode(item)}>
            {item === 'points' ? (drawingSequence ? 'Draw footprint' : 'Edit points') : item === 'railing' ? 'Pick railing edges' : item === 'stairs' ? 'Place stairs' : item === 'beams' ? 'Move beam lines' : 'Lock posts'}
          </button>
        ))}
        <button type="button" className="ghost-btn mode-btn" onClick={undo} disabled={!history.length}>Undo</button>
        <button type="button" className="ghost-btn mode-btn" onClick={redo} disabled={!future.length}>Redo</button>
      </div>
      <div className="deck-designer-grid enhanced-deck-grid">
        <div className="deck-canvas-wrap centered-canvas-wrap">
          <div className="designer-scroll-shell fixed-canvas-shell">
          {points.length === 0 && <div className="empty-designer-state"><p>Click anywhere on the canvas to place point P1. Each next click places the next corner. Click back on P1 to close the shape.</p></div>}
          {drawingSequence && points.length > 0 && <div className="empty-designer-state drawing-hint drawing-hint-bottom"><p>Place point P{points.length + 1}. When ready, click P1 to close the deck. Live segment: {previewDelta ? `${feetAndInches(previewDelta.distance)} · ΔX ${feetAndInches(Math.abs(previewDelta.dx))} · ΔY ${feetAndInches(Math.abs(previewDelta.dy))}` : 'move the cursor to preview the next segment'}</p></div>}
          <svg ref={svgRef} viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="deck-canvas" onClick={handleCanvasClick} onPointerMove={handlePointerMove} onPointerLeave={() => setPreviewPoint(null)}>
            <rect x={PADDING} y={PADDING} width={VIEW_SIZE - PADDING * 2} height={VIEW_SIZE - PADDING * 2} className="canvas-background" rx="8" />
            {(() => {
              const inchXs: number[] = [];
              const inchYs: number[] = [];
              const footXs: number[] = [];
              const footYs: number[] = [];
              const tenXs: number[] = [];
              const tenYs: number[] = [];
              for (let x = Math.ceil(limits.minX / INCH_GRID) * INCH_GRID; x <= limits.maxX + 1e-6; x += INCH_GRID) inchXs.push(Number(x.toFixed(6)));
              for (let y = Math.ceil(limits.minY / INCH_GRID) * INCH_GRID; y <= limits.maxY + 1e-6; y += INCH_GRID) inchYs.push(Number(y.toFixed(6)));
              for (let x = Math.ceil(limits.minX / ONE_FOOT_GRID) * ONE_FOOT_GRID; x <= limits.maxX + 1e-6; x += ONE_FOOT_GRID) footXs.push(Number(x.toFixed(6)));
              for (let y = Math.ceil(limits.minY / ONE_FOOT_GRID) * ONE_FOOT_GRID; y <= limits.maxY + 1e-6; y += ONE_FOOT_GRID) footYs.push(Number(y.toFixed(6)));
              for (let x = Math.ceil(limits.minX / TEN_FOOT_GRID) * TEN_FOOT_GRID; x <= limits.maxX + 1e-6; x += TEN_FOOT_GRID) tenXs.push(Number(x.toFixed(6)));
              for (let y = Math.ceil(limits.minY / TEN_FOOT_GRID) * TEN_FOOT_GRID; y <= limits.maxY + 1e-6; y += TEN_FOOT_GRID) tenYs.push(Number(y.toFixed(6)));
              return <g>
                {zoom >= 1.8 && inchXs.map((x, index) => {
                  const sx = toSvgPoint({ x, y: limits.minY }).x;
                  return <line key={`ix-${index}`} x1={sx} y1={PADDING} x2={sx} y2={VIEW_SIZE - PADDING} className="grid-line inch-grid" />;
                })}
                {zoom >= 1.8 && inchYs.map((y, index) => {
                  const sy = toSvgPoint({ x: limits.minX, y }).y;
                  return <line key={`iy-${index}`} x1={PADDING} y1={sy} x2={VIEW_SIZE - PADDING} y2={sy} className="grid-line inch-grid" />;
                })}
                {footXs.map((x, index) => {
                  const sx = toSvgPoint({ x, y: limits.minY }).x;
                  return <line key={`fx-${index}`} x1={sx} y1={PADDING} x2={sx} y2={VIEW_SIZE - PADDING} className="grid-line foot-grid" />;
                })}
                {footYs.map((y, index) => {
                  const sy = toSvgPoint({ x: limits.minX, y }).y;
                  return <line key={`fy-${index}`} x1={PADDING} y1={sy} x2={VIEW_SIZE - PADDING} y2={sy} className="grid-line foot-grid" />;
                })}
                {tenXs.map((x, index) => {
                  const sx = toSvgPoint({ x, y: limits.minY }).x;
                  return <g key={`tx-${index}`}><line x1={sx} y1={PADDING} x2={sx} y2={VIEW_SIZE - PADDING} className="grid-line ten-grid" /><text x={sx + 4} y={PADDING - 16} className="grid-label">{`${x}'`}</text></g>;
                })}
                {tenYs.map((y, index) => {
                  const sy = toSvgPoint({ x: limits.minX, y }).y;
                  return <g key={`ty-${index}`}><line x1={PADDING} y1={sy} x2={VIEW_SIZE - PADDING} y2={sy} className="grid-line ten-grid" /><text x={PADDING - 30} y={sy - 4} className="grid-label">{`${y}'`}</text></g>;
                })}
              </g>;
            })()}
            {(!drawingSequence && points.length >= 3) ? <polygon points={points.map((point) => { const svgPoint = toSvgPoint(point); return `${svgPoint.x},${svgPoint.y}`; }).join(' ')} className="deck-polygon" /> : points.length > 1 ? <polyline points={points.map((point) => { const svgPoint = toSvgPoint(point); return `${svgPoint.x},${svgPoint.y}`; }).join(' ')} className="deck-polyline" fill="none" /> : null}
            {drawingSequence && points.length > 0 && previewPoint && lastPoint && <>
              <line x1={toSvgPoint(lastPoint).x} y1={toSvgPoint(lastPoint).y} x2={toSvgPoint(previewPoint).x} y2={toSvgPoint(previewPoint).y} className="preview-segment" />
              <circle cx={toSvgPoint(previewPoint).x} cy={toSvgPoint(previewPoint).y} r={5} className="preview-point" />
              {previewMid && previewDelta && <text x={toSvgPoint(previewMid).x} y={toSvgPoint(previewMid).y - 12} textAnchor="middle" className="preview-distance-label">{`${feetAndInches(previewDelta.distance)} · ΔX ${feetAndInches(Math.abs(previewDelta.dx))} · ΔY ${feetAndInches(Math.abs(previewDelta.dy))}`}</text>}
            </>}
            {!drawingSequence && model.edgeSegments.map((segment) => {
              const start = toSvgPoint(segment.start); const end = toSvgPoint(segment.end); const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
              const isRailing = railingEdges.has(segment.index) || (!values.manualRailingEdges && model.exposedSegments.some((item) => item.index === segment.index));
              const isStairEdge = Number(values.stairEdgeIndex ?? -1) === segment.index;
              return <g key={`edge-${segment.index}`}><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={isRailing ? 'interactive-edge active-railing' : isStairEdge ? 'interactive-edge active-stair' : 'interactive-edge'} onClick={() => { if (mode === 'points') insertPointAtEdge(segment.index); if (mode === 'railing') toggleRailingEdge(segment.index); if (mode === 'stairs') selectStairEdge(segment.index); }} /><circle cx={mid.x} cy={mid.y} r={6} className="edge-midpoint" /></g>;
            })}
            {!drawingSequence && model.beamLines.map((beam, index) => {
              const y = PADDING + (beam.y - limits.minY) * scale;
              return <g key={`beam-${index}`}>{beam.segments.map((segment) => <g key={`${segment.startX}-${segment.endX}`}><line x1={PADDING + (segment.startX - limits.minX) * scale} y1={y - 3} x2={PADDING + (segment.endX - limits.minX) * scale} y2={y - 3} className="beam-line beam-line-editable" onPointerDown={(event) => onBeamPointerDown(event, index)} /><line x1={PADDING + (segment.startX - limits.minX) * scale} y1={y + 3} x2={PADDING + (segment.endX - limits.minX) * scale} y2={y + 3} className="beam-line beam-line-secondary" onPointerDown={(event) => onBeamPointerDown(event, index)} /></g>)}{beam.segments[0] && <circle cx={PADDING + (beam.segments[0].startX - limits.minX) * scale + 12} cy={y} r={8} className="beam-handle" />}{beam.postXs.map((postX) => <rect key={`${index}-${postX}`} x={PADDING + (postX - limits.minX) * scale - 4} y={y - 4} width={8} height={8} className={beam.lockedPostXs.includes(postX) ? 'post-lock locked' : 'post-lock'} onClick={() => mode === 'posts' && toggleLockedPost(index, postX)} />)}</g>;
            })}
            {points.map((point, index) => { const svgPoint = toSvgPoint(point); const isClosePoint = drawingSequence && index === 0 && points.length >= 3; return <g key={`${point.x}-${point.y}-${index}`}><circle cx={svgPoint.x} cy={svgPoint.y} r={selectedIndex === index ? 9 : 7} className={selectedIndex === index ? 'deck-point active' : isClosePoint ? 'deck-point close-target' : 'deck-point'} onPointerDown={(event) => onPointPointerDown(event, index)} onClick={(event) => { event.stopPropagation(); if (drawingSequence && !isClosePoint) return; if (isClosePoint) { finishDrawing(); return; } setSelectedIndex(index); }} /><text x={svgPoint.x + 10} y={svgPoint.y - 10} className="deck-point-label">P{index + 1}{isClosePoint ? ' · close' : ''}</text></g>; })}
            {model.stairPlacement.start && model.stairPlacement.end && <><line x1={toSvgPoint(model.stairPlacement.start).x} y1={toSvgPoint(model.stairPlacement.start).y} x2={toSvgPoint(model.stairPlacement.end).x} y2={toSvgPoint(model.stairPlacement.end).y} className="stair-edge-highlight" onPointerDown={onStairPointerDown} /><circle cx={(toSvgPoint(model.stairPlacement.start).x + toSvgPoint(model.stairPlacement.end).x) / 2} cy={(toSvgPoint(model.stairPlacement.start).y + toSvgPoint(model.stairPlacement.end).y) / 2} r={8} className="stair-handle" /></>}
          </svg>
          </div>
        </div>
        <div className="deck-designer-controls organized-controls">
          <div className="callout-box compact-card"><h4>Geometry summary</h4><div className="metrics-mini-grid"><div><span>Area</span><strong>{polygonArea(points).toFixed(1)} sq ft</strong></div><div><span>Perimeter</span><strong>{polygonPerimeter(points).toFixed(1)} lf</strong></div><div><span>Viewport</span><strong>{feetAndInches(viewFeet)} × {feetAndInches(viewFeet)}</strong></div><div><span>Origin</span><strong>{feetAndInches(limits.minX)} , {feetAndInches(limits.minY)}</strong></div></div></div>
          <div className="callout-box compact-card"><h4>Drawing workflow</h4><ul className="plain-list compact"><li>Click to place P1, then keep clicking each next corner.</li><li>The live line follows your cursor and snaps by the inch.</li><li>Click back on P1 to close the shape.</li><li>After closing, drag any point or insert a new one on any edge.</li></ul></div>
          <div className="callout-box compact-card"><h4>Selected point</h4>{selectedIndex === null ? <p className="muted">{drawingSequence ? 'Keep drawing the footprint, then click P1 to close it.' : 'Click a point in the drawing to fine-tune it.'}</p> : <div className="stack-list"><div className="form-grid compact-grid"><label className="form-field"><span>X (ft)</span><input type="number" step={GRID_SIZE} value={points[selectedIndex].x} onChange={(event) => updatePoint(selectedIndex, 'x', Number(event.target.value))} /><small>{feetAndInches(points[selectedIndex].x)}</small></label><label className="form-field"><span>Y (ft)</span><input type="number" step={GRID_SIZE} value={points[selectedIndex].y} onChange={(event) => updatePoint(selectedIndex, 'y', Number(event.target.value))} /><small>{feetAndInches(points[selectedIndex].y)}</small></label></div><div className="point-nudge-grid"><span className="muted">Move by inches</span><div className="point-nudge-row"><button type="button" className="ghost-btn small-btn" onClick={() => nudgeSelectedPoint('x', -1)}>X −1"</button><button type="button" className="ghost-btn small-btn" onClick={() => nudgeSelectedPoint('x', 1)}>X +1"</button><button type="button" className="ghost-btn small-btn" onClick={() => nudgeSelectedPoint('y', -1)}>Y −1"</button><button type="button" className="ghost-btn small-btn" onClick={() => nudgeSelectedPoint('y', 1)}>Y +1"</button></div></div><button type="button" className="secondary-btn block-btn" onClick={removeSelected}>Remove point</button></div>}</div>
          <div className="callout-box compact-card"><h4>Manual framing controls</h4><div className="form-grid compact-grid"><label className="form-field"><span>Stair offset along selected edge</span><input type="number" step={GRID_SIZE} value={Number(values.stairOffset ?? 0)} onChange={(event) => commitChange((current) => ({ ...current, stairOffset: snap(Number(event.target.value)) }))} /></label><label className="form-field"><span>Locked posts</span><input type="text" value={lockedPosts.length ? lockedPosts.map((item) => `B${item.beamIndex + 1}@${feetAndInches(item.x)}`).join(', ') : 'none'} readOnly /></label><button type="button" className="ghost-btn block-btn" onClick={addBeamLine}>Add beam line</button><button type="button" className="ghost-btn block-btn" onClick={() => updateNumberArray('customBeamYs', [])}>Reset auto beam lines</button></div><div className="stack-list beam-editor-list">{model.beamLines.map((beam, index) => <div key={`beam-edit-${index}`} className="beam-editor-row beam-edit-grid"><span>Beam {index + 1}</span><strong>{feetAndInches(beam.offsetFromHouse)}</strong><label className="inline-mini-field"><span>Start trim</span><input type="number" step={GRID_SIZE} value={beam.startTrim} onChange={(event) => updateBeamEdit(index, 'startTrim', Number(event.target.value))} /></label><label className="inline-mini-field"><span>End trim</span><input type="number" step={GRID_SIZE} value={beam.endTrim} onChange={(event) => updateBeamEdit(index, 'endTrim', Number(event.target.value))} /></label><button type="button" className="ghost-btn small-btn" onClick={() => removeBeamLine(index)}>Remove</button></div>)}</div></div>
          <div className="callout-box compact-card"><h4>Reset</h4><button type="button" className="ghost-btn block-btn" onClick={resetShape}>Reset shape and manual overrides</button></div>
        </div>
      </div>
    </div>
  );
}
