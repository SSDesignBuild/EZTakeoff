import { PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { buildDeckModel, parseDeckShape } from '../lib/deckModel';
import { DeckPoint } from '../lib/types';

const GRID_SIZE = 0.5;
const VIEW_SIZE = 520;
const PADDING = 28;

const defaultShape: DeckPoint[] = [
  { x: 0, y: 0 },
  { x: 16, y: 0 },
  { x: 16, y: 12 },
  { x: 0, y: 12 },
];

type EditMode = 'points' | 'railing' | 'stairs' | 'beams';

const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

const polygonArea = (points: DeckPoint[]) => {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum / 2);
};

const polygonPerimeter = (points: DeckPoint[]) => {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return sum;
};

const bounds = (points: DeckPoint[]) => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

const parseNumberArray = (raw: string | number | boolean | undefined) => {
  if (typeof raw !== 'string') return [] as number[];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  } catch {
    return [];
  }
  return [];
};

interface DeckDesignerProps {
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

export function DeckDesigner({ values, onValuesChange }: DeckDesignerProps) {
  const points = useMemo(() => parseDeckShape(values.deckShape), [values.deckShape]);
  const model = useMemo(() => buildDeckModel(values), [values]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<EditMode>('points');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [draggingBeamIndex, setDraggingBeamIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const limits = bounds(points);
  const spanX = Math.max(limits.maxX - limits.minX, 1);
  const spanY = Math.max(limits.maxY - limits.minY, 1);
  const scale = Math.min((VIEW_SIZE - PADDING * 2) / spanX, (VIEW_SIZE - PADDING * 2) / spanY);
  const railingEdges = useMemo(() => new Set(parseNumberArray(values.manualRailingEdges).map((value) => Math.round(value))), [values.manualRailingEdges]);
  const beamOffsets = useMemo(() => {
    const parsed = parseNumberArray(values.customBeamYs);
    return parsed.length > 0 ? parsed : model.beamLines.map((line) => line.offsetFromHouse);
  }, [model.beamLines, values.customBeamYs]);

  const updateShape = (nextPoints: DeckPoint[]) => {
    onValuesChange((current) => ({ ...current, deckShape: JSON.stringify(nextPoints) }));
  };

  const updateNumberArray = (key: string, next: number[]) => {
    onValuesChange((current) => ({ ...current, [key]: JSON.stringify(next.map((value) => snap(value))) }));
  };

  const toSvgPoint = (point: DeckPoint) => ({
    x: PADDING + (point.x - limits.minX) * scale,
    y: PADDING + (point.y - limits.minY) * scale,
  });

  const fromClientToModelPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VIEW_SIZE;
    const y = ((clientY - rect.top) / rect.height) * VIEW_SIZE;
    return {
      x: snap(limits.minX + (x - PADDING) / scale),
      y: snap(limits.minY + (y - PADDING) / scale),
    };
  };

  const updatePoint = (index: number, axis: 'x' | 'y', nextValue: number) => {
    const next = points.map((point, currentIndex) => (
      currentIndex === index ? { ...point, [axis]: snap(nextValue) } : point
    ));
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
    const next = points.filter((_, index) => index !== selectedIndex);
    setSelectedIndex(null);
    updateShape(next);
  };

  const resetShape = () => {
    setSelectedIndex(null);
    onValuesChange((current) => ({
      ...current,
      deckShape: JSON.stringify(defaultShape),
      manualRailingEdges: JSON.stringify([]),
      customBeamYs: JSON.stringify([]),
      stairEdgeIndex: -1,
      stairOffset: 0,
    }));
  };

  const toggleRailingEdge = (edgeIndex: number) => {
    const next = new Set(railingEdges);
    if (next.has(edgeIndex)) next.delete(edgeIndex);
    else next.add(edgeIndex);
    updateNumberArray('manualRailingEdges', Array.from(next.values()));
  };

  const selectStairEdge = (edgeIndex: number) => {
    onValuesChange((current) => ({ ...current, stairEdgeIndex: edgeIndex, stairOffset: 0 }));
  };

  const addBeamLine = () => {
    const next = [...beamOffsets, Math.max(0, snap(model.depth / 2))].sort((a, b) => a - b);
    updateNumberArray('customBeamYs', next);
  };

  const removeBeamLine = (index: number) => {
    const next = beamOffsets.filter((_, currentIndex) => currentIndex !== index);
    updateNumberArray('customBeamYs', next);
  };

  const updateBeamLine = (index: number, nextOffset: number) => {
    const clamped = model.isFreestanding
      ? Math.max(0, Math.min(model.depth, snap(nextOffset)))
      : Math.max(0.5, Math.min(model.depth - 0.5, snap(nextOffset)));
    const next = beamOffsets.map((value, currentIndex) => (currentIndex === index ? clamped : value)).sort((a, b) => a - b);
    updateNumberArray('customBeamYs', next);
  };

  const onPointPointerDown = (event: PointerEvent<SVGCircleElement>, index: number) => {
    event.preventDefault();
    setMode('points');
    setSelectedIndex(index);
    setDraggingIndex(index);
  };

  const onBeamPointerDown = (event: PointerEvent<SVGLineElement>, index: number) => {
    event.preventDefault();
    setMode('beams');
    setDraggingBeamIndex(index);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (draggingIndex !== null) {
      const point = fromClientToModelPoint(event.clientX, event.clientY);
      if (!point) return;
      const next = points.map((current, index) => index === draggingIndex ? point : current);
      updateShape(next);
      return;
    }
    if (draggingBeamIndex !== null) {
      const point = fromClientToModelPoint(event.clientX, event.clientY);
      if (!point) return;
      updateBeamLine(draggingBeamIndex, point.y - model.minY);
    }
  };

  useEffect(() => {
    const release = () => {
      setDraggingIndex(null);
      setDraggingBeamIndex(null);
    };
    window.addEventListener('pointerup', release);
    return () => window.removeEventListener('pointerup', release);
  }, []);

  return (
    <div className="content-card deck-designer-card">
      <div className="section-heading inline-heading">
        <div>
          <p className="eyebrow">Deck layout</p>
          <h3>Draw, drag, and tune the footprint</h3>
        </div>
        <div className="tag-row">
          <span className="tag">Snap: 6 in</span>
          <span className="tag">Points: {points.length}</span>
          <span className="tag">Mode: {mode}</span>
        </div>
      </div>

      <div className="designer-mode-row">
        {(['points', 'railing', 'stairs', 'beams'] as EditMode[]).map((item) => (
          <button
            key={item}
            type="button"
            className={mode === item ? 'secondary-btn mode-btn active' : 'ghost-btn mode-btn'}
            onClick={() => setMode(item)}
          >
            {item === 'points' ? 'Drag points' : item === 'railing' ? 'Pick railing edges' : item === 'stairs' ? 'Place stairs' : 'Move beam lines'}
          </button>
        ))}
      </div>

      <div className="deck-designer-grid">
        <div className="deck-canvas-wrap">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
            className="deck-canvas"
            onPointerMove={handlePointerMove}
            onPointerUp={() => {
              setDraggingIndex(null);
              setDraggingBeamIndex(null);
            }}
          >
            {Array.from({ length: 13 }, (_, index) => {
              const offset = PADDING + index * ((VIEW_SIZE - PADDING * 2) / 12);
              return (
                <g key={index}>
                  <line x1={PADDING} y1={offset} x2={VIEW_SIZE - PADDING} y2={offset} className="grid-line" />
                  <line x1={offset} y1={PADDING} x2={offset} y2={VIEW_SIZE - PADDING} className="grid-line" />
                </g>
              );
            })}

            <polygon
              points={points.map((point) => {
                const svgPoint = toSvgPoint(point);
                return `${svgPoint.x},${svgPoint.y}`;
              }).join(' ')}
              className="deck-polygon"
            />

            {model.edgeSegments.map((segment) => {
              const start = toSvgPoint(segment.start);
              const end = toSvgPoint(segment.end);
              const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
              const isRailing = railingEdges.has(segment.index) || (!values.manualRailingEdges && model.exposedSegments.some((item) => item.index === segment.index));
              const isStairEdge = Number(values.stairEdgeIndex ?? -1) === segment.index;
              return (
                <g key={`edge-${segment.index}`}>
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    className={isRailing ? 'interactive-edge active-railing' : isStairEdge ? 'interactive-edge active-stair' : 'interactive-edge'}
                    onClick={() => {
                      if (mode === 'points') insertPointAtEdge(segment.index);
                      if (mode === 'railing') toggleRailingEdge(segment.index);
                      if (mode === 'stairs') selectStairEdge(segment.index);
                    }}
                  />
                  <circle cx={mid.x} cy={mid.y} r={6} className="edge-midpoint" />
                </g>
              );
            })}

            {model.beamLines.map((beam, index) => {
              const y = PADDING + (beam.y - limits.minY) * scale;
              return (
                <g key={`beam-${index}`}>
                  {beam.segments.map((segment) => (
                    <line
                      key={`${segment.startX}-${segment.endX}`}
                      x1={PADDING + (segment.startX - limits.minX) * scale}
                      y1={y}
                      x2={PADDING + (segment.endX - limits.minX) * scale}
                      y2={y}
                      className="beam-line beam-line-editable"
                      onPointerDown={(event) => onBeamPointerDown(event, index)}
                    />
                  ))}
                  {beam.segments[0] && (
                    <circle
                      cx={PADDING + (beam.segments[0].startX - limits.minX) * scale + 12}
                      cy={y}
                      r={8}
                      className="beam-handle"
                    />
                  )}
                </g>
              );
            })}

            {points.map((point, index) => {
              const svgPoint = toSvgPoint(point);
              return (
                <g key={`${point.x}-${point.y}-${index}`}>
                  <circle
                    cx={svgPoint.x}
                    cy={svgPoint.y}
                    r={selectedIndex === index ? 9 : 7}
                    className={selectedIndex === index ? 'deck-point active' : 'deck-point'}
                    onPointerDown={(event) => onPointPointerDown(event, index)}
                    onClick={() => setSelectedIndex(index)}
                  />
                  <text x={svgPoint.x + 10} y={svgPoint.y - 10} className="deck-point-label">P{index + 1}</text>
                </g>
              );
            })}

            {model.stairPlacement.start && model.stairPlacement.end && (
              <line
                x1={toSvgPoint(model.stairPlacement.start).x}
                y1={toSvgPoint(model.stairPlacement.start).y}
                x2={toSvgPoint(model.stairPlacement.end).x}
                y2={toSvgPoint(model.stairPlacement.end).y}
                className="stair-edge-highlight"
              />
            )}
          </svg>
        </div>

        <div className="deck-designer-controls">
          <div className="callout-box">
            <h4>Geometry summary</h4>
            <div className="metrics-mini-grid">
              <div>
                <span>Area</span>
                <strong>{polygonArea(points).toFixed(1)} sq ft</strong>
              </div>
              <div>
                <span>Perimeter</span>
                <strong>{polygonPerimeter(points).toFixed(1)} lf</strong>
              </div>
              <div>
                <span>Width</span>
                <strong>{spanX.toFixed(1)} ft</strong>
              </div>
              <div>
                <span>Projection</span>
                <strong>{spanY.toFixed(1)} ft</strong>
              </div>
            </div>
          </div>

          <div className="callout-box">
            <h4>Quick tips</h4>
            <ul className="plain-list compact">
              <li>Drag any point directly in the drawing.</li>
              <li>In point mode, click an edge to insert a new point at the midpoint.</li>
              <li>In railing mode, click edges to mark where railing belongs.</li>
              <li>In stair mode, click the edge where stairs should land.</li>
              <li>In beam mode, drag beam lines up or down to match field layout.</li>
            </ul>
          </div>

          <div className="callout-box">
            <h4>Selected point</h4>
            {selectedIndex === null ? (
              <p className="muted">Click a point in the drawing to fine-tune it.</p>
            ) : (
              <div className="form-grid compact-grid">
                <label className="form-field">
                  <span>X (ft)</span>
                  <input
                    type="number"
                    step={GRID_SIZE}
                    value={points[selectedIndex].x}
                    onChange={(event) => updatePoint(selectedIndex, 'x', Number(event.target.value))}
                  />
                </label>
                <label className="form-field">
                  <span>Y (ft)</span>
                  <input
                    type="number"
                    step={GRID_SIZE}
                    value={points[selectedIndex].y}
                    onChange={(event) => updatePoint(selectedIndex, 'y', Number(event.target.value))}
                  />
                </label>
                <button type="button" className="secondary-btn block-btn" onClick={removeSelected}>
                  Remove point
                </button>
              </div>
            )}
          </div>

          <div className="callout-box">
            <h4>Manual framing controls</h4>
            <div className="form-grid compact-grid">
              <label className="form-field">
                <span>Stair offset along selected edge (ft)</span>
                <input
                  type="number"
                  step={GRID_SIZE}
                  value={Number(values.stairOffset ?? 0)}
                  onChange={(event) => onValuesChange((current) => ({ ...current, stairOffset: snap(Number(event.target.value)) }))}
                />
              </label>
              <label className="form-field">
                <span>Railing edges selected</span>
                <input type="text" value={Array.from(railingEdges.values()).join(', ')} readOnly />
              </label>
              <button type="button" className="ghost-btn block-btn" onClick={addBeamLine}>
                Add beam line
              </button>
              <button type="button" className="ghost-btn block-btn" onClick={() => updateNumberArray('customBeamYs', [])}>
                Reset auto beam lines
              </button>
            </div>
            <div className="stack-list beam-editor-list">
              {beamOffsets.map((beamOffset, index) => (
                <div key={`beam-edit-${index}`} className="beam-editor-row">
                  <span>Beam {index + 1}</span>
                  <strong>{beamOffset.toFixed(1)} ft</strong>
                  <button type="button" className="ghost-btn small-btn" onClick={() => removeBeamLine(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="callout-box">
            <h4>Reset</h4>
            <button type="button" className="ghost-btn block-btn" onClick={resetShape}>
              Reset shape and manual overrides
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
