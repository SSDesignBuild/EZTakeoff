import { MouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { buildDeckModel, parseDeckShape } from '../lib/deckModel';
import { DeckPoint, LockedPostPoint } from '../lib/types';

const GRID_SIZE = 0.5;
const VIEW_SIZE = 520;
const PADDING = 28;
const SNAP_TOLERANCE = 0.75;

const defaultShape: DeckPoint[] = [];
const starterPoints: DeckPoint[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 10 }];

type EditMode = 'points' | 'railing' | 'stairs' | 'beams' | 'posts';
type BeamEdit = { beamIndex: number; startTrim: number; endTrim: number };
type Snapshot = Pick<Record<string, string | number | boolean>, 'deckShape' | 'manualRailingEdges' | 'customBeamYs' | 'stairEdgeIndex' | 'stairOffset' | 'lockedPosts' | 'beamEdits'>;

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

const bounds = (points: DeckPoint[]) => ({
  minX: Math.min(...points.map((point) => point.x)),
  maxX: Math.max(...points.map((point) => point.x)),
  minY: Math.min(...points.map((point) => point.y)),
  maxY: Math.max(...points.map((point) => point.y)),
});

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
  const svgRef = useRef<SVGSVGElement | null>(null);
  const limits = points.length ? bounds(points) : { minX: 0, maxX: 16, minY: 0, maxY: 12 };
  const spanX = Math.max(limits.maxX - limits.minX, 1);
  const spanY = Math.max(limits.maxY - limits.minY, 1);
  const scale = Math.min((VIEW_SIZE - PADDING * 2) / spanX, (VIEW_SIZE - PADDING * 2) / spanY);
  const railingEdges = useMemo(() => new Set(parseNumberArray(values.manualRailingEdges).map((value) => Math.round(value))), [values.manualRailingEdges]);
  const beamOffsets = useMemo(() => {
    const parsed = parseNumberArray(values.customBeamYs);
    return parsed.length > 0 ? parsed : model.beamLines.map((line) => line.offsetFromHouse);
  }, [model.beamLines, values.customBeamYs]);
  const lockedPosts = useMemo(() => parseLockedPosts(values.lockedPosts), [values.lockedPosts]);
  const beamEdits = useMemo(() => parseBeamEdits(values.beamEdits), [values.beamEdits]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);

  const snapshot = (): Snapshot => ({
    deckShape: values.deckShape,
    manualRailingEdges: values.manualRailingEdges,
    customBeamYs: values.customBeamYs,
    stairEdgeIndex: values.stairEdgeIndex,
    stairOffset: values.stairOffset,
    lockedPosts: values.lockedPosts,
    beamEdits: values.beamEdits,
  });

  const applySnapshot = (shot: Snapshot) => onValuesChange((current) => ({ ...current, ...shot }));
  const commitChange = (producer: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => {
    setHistory((current) => [...current.slice(-39), snapshot()]);
    setFuture([]);
    onValuesChange(producer);
  };

  const updateShape = (nextPoints: DeckPoint[]) => commitChange((current) => ({ ...current, deckShape: JSON.stringify(nextPoints) }));
  const updateNumberArray = (key: string, next: number[]) => commitChange((current) => ({ ...current, [key]: JSON.stringify(next.map((value) => snap(value))) }));
  const updateLockedPosts = (next: LockedPostPoint[]) => commitChange((current) => ({ ...current, lockedPosts: JSON.stringify(next) }));

  const toSvgPoint = (point: DeckPoint) => ({ x: PADDING + (point.x - limits.minX) * scale, y: PADDING + (point.y - limits.minY) * scale });
  const fromClientToModelPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VIEW_SIZE;
    const y = ((clientY - rect.top) / rect.height) * VIEW_SIZE;
    return { x: snap(limits.minX + (x - PADDING) / scale), y: snap(limits.minY + (y - PADDING) / scale) };
  };

  useEffect(() => {
    if (points.length === 0) {
      setDrawingSequence(true);
      setSelectedIndex(null);
      return;
    }
  }, [points.length]);

  const appendPoint = (point: DeckPoint) => {
    const next = [...points, { x: snap(point.x), y: snap(point.y) }];
    updateShape(next);
    setSelectedIndex(next.length - 1);
  };

  const finishDrawing = () => {
    if (points.length < 3) return;
    setDrawingSequence(false);
    setSelectedIndex(null);
  };

  const handleCanvasClick = (event: MouseEvent<SVGSVGElement>) => {
    if (mode !== 'points') return;
    if (event.target !== event.currentTarget) return;
    const point = fromClientToModelPoint(event.clientX, event.clientY);
    if (!point) return;
    if (!drawingSequence && points.length > 0) return;
    appendPoint(point);
  };

  const constrainedPoint = (index: number, point: DeckPoint) => {
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    let x = point.x;
    let y = point.y;
    [prev.x, next.x].forEach((candidate) => { if (Math.abs(candidate - x) <= SNAP_TOLERANCE) x = candidate; });
    [prev.y, next.y].forEach((candidate) => { if (Math.abs(candidate - y) <= SNAP_TOLERANCE) y = candidate; });
    return { x: snap(x), y: snap(y) };
  };

  const updatePoint = (index: number, axis: 'x' | 'y', nextValue: number) => {
    const next = points.map((point, currentIndex) => currentIndex === index ? { ...point, [axis]: snap(nextValue) } : point);
    updateShape(next);
  };

  const insertPointAtEdge = (edgeIndex: number) => {
    const start = points[edgeIndex];
    const end = points[(edgeIndex + 1) % points.length];
    const mid = { x: snap((start.x + end.x) / 2), y: snap((start.y + end.y) / 2) };
    const next = [...points.slice(0, edgeIndex + 1), mid, ...points.slice(edgeIndex + 1)];
    updateShape(next);
    setSelectedIndex(edgeIndex + 1);
  };

  const removeSelected = () => {
    if (selectedIndex === null || points.length <= 3) return;
    setSelectedIndex(null);
    updateShape(points.filter((_, index) => index !== selectedIndex));
  };

  const resetShape = () => {
    setDrawingSequence(true);
    setSelectedIndex(null);
    commitChange((current) => ({ ...current, deckShape: JSON.stringify(defaultShape), manualRailingEdges: JSON.stringify([]), customBeamYs: JSON.stringify([]), lockedPosts: JSON.stringify([]), beamEdits: JSON.stringify([]), stairEdgeIndex: -1, stairOffset: 0 }));
  };

  const toggleRailingEdge = (edgeIndex: number) => {
    const next = new Set(railingEdges);
    if (next.has(edgeIndex)) next.delete(edgeIndex); else next.add(edgeIndex);
    updateNumberArray('manualRailingEdges', Array.from(next.values()));
  };

  const selectStairEdge = (edgeIndex: number) => commitChange((current) => ({ ...current, stairEdgeIndex: edgeIndex, stairOffset: 0 }));
  const addBeamLine = () => updateNumberArray('customBeamYs', [...beamOffsets, Math.max(0.5, snap(model.depth / 2))].sort((a, b) => a - b));
  const removeBeamLine = (index: number) => commitChange((current) => ({ ...current, customBeamYs: JSON.stringify(beamOffsets.filter((_, currentIndex) => currentIndex !== index)), beamEdits: JSON.stringify(beamEdits.filter((item) => item.beamIndex !== index).map((item) => ({ ...item, beamIndex: item.beamIndex > index ? item.beamIndex - 1 : item.beamIndex }))) }));
  const updateBeamEdit = (index: number, key: 'startTrim' | 'endTrim', value: number) => commitChange((current) => { const next = [...beamEdits]; const match = next.findIndex((item) => item.beamIndex === index); const safe = Math.max(0, snap(value)); if (match >= 0) next[match] = { ...next[match], [key]: safe }; else next.push({ beamIndex: index, startTrim: key === 'startTrim' ? safe : 0, endTrim: key === 'endTrim' ? safe : 0 }); return { ...current, beamEdits: JSON.stringify(next.sort((a,b)=>a.beamIndex-b.beamIndex)) }; });
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

  const onPointPointerDown = (event: PointerEvent<SVGCircleElement>, index: number) => { event.preventDefault(); setMode('points'); setSelectedIndex(index); setDraggingIndex(index); };
  const onBeamPointerDown = (event: PointerEvent<SVGLineElement>, index: number) => { event.preventDefault(); setMode('beams'); setDraggingBeamIndex(index); };
  const onStairPointerDown = (event: PointerEvent<SVGLineElement>) => { event.preventDefault(); setMode('stairs'); setDraggingStair(true); };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (draggingIndex !== null) {
      const point = fromClientToModelPoint(event.clientX, event.clientY); if (!point) return;
      const next = points.map((current, index) => index === draggingIndex ? constrainedPoint(index, point) : current);
      onValuesChange((current) => ({ ...current, deckShape: JSON.stringify(next) }));
      return;
    }
    if (draggingBeamIndex !== null) {
      const point = fromClientToModelPoint(event.clientX, event.clientY); if (!point) return;
      onValuesChange((current) => ({ ...current, customBeamYs: JSON.stringify(beamOffsets.map((value, currentIndex) => currentIndex === draggingBeamIndex ? snap(point.y - model.minY) : value).sort((a,b)=>a-b)) }));
      return;
    }
    if (draggingStair && model.stairPlacement.edgeIndex !== null) {
      const point = fromClientToModelPoint(event.clientX, event.clientY); if (!point) return;
      const edge = model.edgeSegments[model.stairPlacement.edgeIndex];
      const dx = edge.end.x - edge.start.x; const dy = edge.end.y - edge.start.y; const lenSq = (dx * dx) + (dy * dy) || 1;
      const projection = (((point.x - edge.start.x) * dx) + ((point.y - edge.start.y) * dy)) / lenSq * edge.length;
      const nextOffset = Math.max(0, Math.min(edge.length - model.stairPlacement.width, projection));
      onValuesChange((current) => ({ ...current, stairOffset: snap(nextOffset) }));
    }
  };

  useEffect(() => {
    const release = () => {
      if (draggingIndex !== null || draggingBeamIndex !== null || draggingStair) setHistory((current) => [...current.slice(-39), snapshot()]);
      setDraggingIndex(null); setDraggingBeamIndex(null); setDraggingStair(false);
    };
    window.addEventListener('pointerup', release);
    return () => window.removeEventListener('pointerup', release);
  });

  return (
    <div className="content-card deck-designer-card">
      <div className="section-heading inline-heading">
        <div><p className="eyebrow">Deck layout</p><h3>Draw, drag, snap, and lock the footprint</h3></div>
        <div className="tag-row"><span className="tag">Snap: 6 in</span><span className="tag">Points: {points.length}</span><span className="tag">Mode: {drawingSequence ? 'drawing' : mode}</span></div>
      </div>
      <div className="designer-mode-row">
        {(['points', 'railing', 'stairs', 'beams', 'posts'] as EditMode[]).map((item) => <button key={item} type="button" className={mode === item ? 'secondary-btn mode-btn active' : 'ghost-btn mode-btn'} onClick={() => setMode(item)}>{item === 'points' ? 'Drag points' : item === 'railing' ? 'Pick railing edges' : item === 'stairs' ? 'Place stairs' : item === 'beams' ? 'Move beam lines' : 'Lock posts'}</button>)}
        <button type="button" className="ghost-btn mode-btn" onClick={undo} disabled={!history.length}>Undo</button>
        <button type="button" className="ghost-btn mode-btn" onClick={redo} disabled={!future.length}>Redo</button>
      </div>
      <div className="deck-designer-grid">
        <div className="deck-canvas-wrap">
          {points.length === 0 && <div className="empty-designer-state"><p>Click anywhere on the canvas to place the first point, then keep clicking to continue the outline.</p><div className="preview-toolbar"><button type="button" className="ghost-btn small-btn" onClick={() => { setDrawingSequence(true); updateShape(starterPoints); }}>Load starter triangle</button></div></div>}
          {drawingSequence && points.length > 0 && <div className="empty-designer-state drawing-hint"><p>Click to place the next point. Click back on point P1 to close the deck shape.</p></div>}
          <svg ref={svgRef} viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="deck-canvas" onClick={handleCanvasClick} onPointerMove={handlePointerMove} onPointerUp={() => { setDraggingIndex(null); setDraggingBeamIndex(null); setDraggingStair(false); }}>
            {Array.from({ length: 13 }, (_, index) => { const offset = PADDING + index * ((VIEW_SIZE - PADDING * 2) / 12); return <g key={index}><line x1={PADDING} y1={offset} x2={VIEW_SIZE - PADDING} y2={offset} className="grid-line" /><line x1={offset} y1={PADDING} x2={offset} y2={VIEW_SIZE - PADDING} className="grid-line" /></g>; })}
            {(!drawingSequence && points.length >= 3) ? <polygon points={points.map((point) => { const svgPoint = toSvgPoint(point); return `${svgPoint.x},${svgPoint.y}`; }).join(' ')} className="deck-polygon" /> : points.length > 1 ? <polyline points={points.map((point) => { const svgPoint = toSvgPoint(point); return `${svgPoint.x},${svgPoint.y}`; }).join(' ')} className="deck-polyline" fill="none" /> : null}
            {!drawingSequence && model.edgeSegments.map((segment) => {
              const start = toSvgPoint(segment.start); const end = toSvgPoint(segment.end); const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
              const isRailing = railingEdges.has(segment.index) || (!values.manualRailingEdges && model.exposedSegments.some((item) => item.index === segment.index));
              const isStairEdge = Number(values.stairEdgeIndex ?? -1) === segment.index;
              return <g key={`edge-${segment.index}`}><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={isRailing ? 'interactive-edge active-railing' : isStairEdge ? 'interactive-edge active-stair' : 'interactive-edge'} onClick={() => { if (mode === 'points') insertPointAtEdge(segment.index); if (mode === 'railing') toggleRailingEdge(segment.index); if (mode === 'stairs') selectStairEdge(segment.index); }} /><circle cx={mid.x} cy={mid.y} r={6} className="edge-midpoint" /></g>;
            })}
            {!drawingSequence && model.beamLines.map((beam, index) => {
              const y = PADDING + (beam.y - limits.minY) * scale;
              return <g key={`beam-${index}`}>{beam.segments.map((segment) => <line key={`${segment.startX}-${segment.endX}`} x1={PADDING + (segment.startX - limits.minX) * scale} y1={y} x2={PADDING + (segment.endX - limits.minX) * scale} y2={y} className="beam-line beam-line-editable" onPointerDown={(event) => onBeamPointerDown(event, index)} />)}{beam.segments[0] && <circle cx={PADDING + (beam.segments[0].startX - limits.minX) * scale + 12} cy={y} r={8} className="beam-handle" />}{beam.postXs.map((postX) => <circle key={`${index}-${postX}`} cx={PADDING + (postX - limits.minX) * scale} cy={y} r={mode === 'posts' ? 8 : 6} className={beam.lockedPostXs.includes(postX) ? 'post-lock locked' : 'post-lock'} onClick={() => mode === 'posts' && toggleLockedPost(index, postX)} />)}</g>;
            })}
            {points.map((point, index) => { const svgPoint = toSvgPoint(point); const isClosePoint = drawingSequence && index === 0 && points.length >= 3; return <g key={`${point.x}-${point.y}-${index}`}><circle cx={svgPoint.x} cy={svgPoint.y} r={selectedIndex === index ? 9 : 7} className={selectedIndex === index ? 'deck-point active' : isClosePoint ? 'deck-point close-target' : 'deck-point'} onPointerDown={(event) => !drawingSequence && onPointPointerDown(event, index)} onClick={(event) => { event.stopPropagation(); if (isClosePoint) { finishDrawing(); return; } setSelectedIndex(index); }} /><text x={svgPoint.x + 10} y={svgPoint.y - 10} className="deck-point-label">P{index + 1}{isClosePoint ? ' · close' : ''}</text></g>; })}
            {model.stairPlacement.start && model.stairPlacement.end && <><line x1={toSvgPoint(model.stairPlacement.start).x} y1={toSvgPoint(model.stairPlacement.start).y} x2={toSvgPoint(model.stairPlacement.end).x} y2={toSvgPoint(model.stairPlacement.end).y} className="stair-edge-highlight" onPointerDown={onStairPointerDown} /><circle cx={(toSvgPoint(model.stairPlacement.start).x + toSvgPoint(model.stairPlacement.end).x) / 2} cy={(toSvgPoint(model.stairPlacement.start).y + toSvgPoint(model.stairPlacement.end).y) / 2} r={8} className="stair-handle" /></>}
          </svg>
        </div>
        <div className="deck-designer-controls">
          <div className="callout-box"><h4>Geometry summary</h4><div className="metrics-mini-grid"><div><span>Area</span><strong>{polygonArea(points).toFixed(1)} sq ft</strong></div><div><span>Perimeter</span><strong>{polygonPerimeter(points).toFixed(1)} lf</strong></div><div><span>Width</span><strong>{spanX.toFixed(1)} ft</strong></div><div><span>Projection</span><strong>{spanY.toFixed(1)} ft</strong></div></div></div>
          <div className="callout-box"><h4>Quick tips</h4><ul className="plain-list compact"><li>From a blank deck, click the canvas to place each corner in order.</li><li>Click back on point P1 to close the outline and finish the shape.</li><li>After closing, drag any point directly in the drawing.</li><li>Click an edge in point mode to insert a new corner.</li><li>Undo and redo keep complex shape editing safer.</li></ul></div>
          <div className="callout-box"><h4>Selected point</h4>{selectedIndex === null ? <p className="muted">{drawingSequence ? 'Keep placing points, then click P1 to close the deck.' : 'Click a point in the drawing to fine-tune it.'}</p> : <div className="form-grid compact-grid"><label className="form-field"><span>X (ft)</span><input type="number" step={GRID_SIZE} value={points[selectedIndex].x} onChange={(event) => updatePoint(selectedIndex, 'x', Number(event.target.value))} /></label><label className="form-field"><span>Y (ft)</span><input type="number" step={GRID_SIZE} value={points[selectedIndex].y} onChange={(event) => updatePoint(selectedIndex, 'y', Number(event.target.value))} /></label><button type="button" className="secondary-btn block-btn" onClick={removeSelected}>Remove point</button></div>}</div>
          <div className="callout-box"><h4>Manual framing controls</h4><div className="form-grid compact-grid"><label className="form-field"><span>Stair offset along selected edge (ft)</span><input type="number" step={GRID_SIZE} value={Number(values.stairOffset ?? 0)} onChange={(event) => commitChange((current) => ({ ...current, stairOffset: snap(Number(event.target.value)) }))} /></label><label className="form-field"><span>Locked posts</span><input type="text" value={lockedPosts.length ? lockedPosts.map((item) => `B${item.beamIndex + 1}@${item.x}`).join(', ') : 'none'} readOnly /></label><button type="button" className="ghost-btn block-btn" onClick={addBeamLine}>Add beam line</button><button type="button" className="ghost-btn block-btn" onClick={() => updateNumberArray('customBeamYs', [])}>Reset auto beam lines</button></div><div className="stack-list beam-editor-list">{model.beamLines.map((beam, index) => <div key={`beam-edit-${index}`} className="beam-editor-row beam-edit-grid"><span>Beam {index + 1}</span><strong>{beam.offsetFromHouse.toFixed(1)} ft</strong><label className="inline-mini-field"><span>Start trim</span><input type="number" step={GRID_SIZE} value={beam.startTrim} onChange={(event) => updateBeamEdit(index, 'startTrim', Number(event.target.value))} /></label><label className="inline-mini-field"><span>End trim</span><input type="number" step={GRID_SIZE} value={beam.endTrim} onChange={(event) => updateBeamEdit(index, 'endTrim', Number(event.target.value))} /></label><button type="button" className="ghost-btn small-btn" onClick={() => removeBeamLine(index)}>Remove</button></div>)}</div></div>
          <div className="callout-box"><h4>Reset</h4><button type="button" className="ghost-btn block-btn" onClick={resetShape}>Reset shape and manual overrides</button></div>
        </div>
      </div>
    </div>
  );
}
