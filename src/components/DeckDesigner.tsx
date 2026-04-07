import { useMemo, useState } from 'react';
import { DeckPoint } from '../lib/types';

const GRID_SIZE = 0.5;
const VIEW_SIZE = 420;
const PADDING = 28;

const defaultShape: DeckPoint[] = [
  { x: 0, y: 0 },
  { x: 16, y: 0 },
  { x: 16, y: 12 },
  { x: 0, y: 12 },
];

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

const parseShape = (raw: string | number | boolean | undefined): DeckPoint[] => {
  if (typeof raw !== 'string') return defaultShape;
  try {
    const parsed = JSON.parse(raw) as DeckPoint[];
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    }
  } catch {
    return defaultShape;
  }
  return defaultShape;
};

interface DeckDesignerProps {
  value: string | number | boolean | undefined;
  onChange: (next: string) => void;
}

export function DeckDesigner({ value, onChange }: DeckDesignerProps) {
  const points = useMemo(() => parseShape(value), [value]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [newPoint, setNewPoint] = useState<DeckPoint>({ x: 8, y: 6 });
  const limits = bounds(points);
  const spanX = Math.max(limits.maxX - limits.minX, 1);
  const spanY = Math.max(limits.maxY - limits.minY, 1);
  const scale = Math.min((VIEW_SIZE - PADDING * 2) / spanX, (VIEW_SIZE - PADDING * 2) / spanY);

  const toSvgPoint = (point: DeckPoint) => ({
    x: PADDING + (point.x - limits.minX) * scale,
    y: PADDING + (point.y - limits.minY) * scale,
  });

  const updatePoint = (index: number, axis: 'x' | 'y', nextValue: number) => {
    const next = points.map((point, currentIndex) => (
      currentIndex === index ? { ...point, [axis]: snap(nextValue) } : point
    ));
    onChange(JSON.stringify(next));
  };

  const addPoint = () => {
    const next = [...points, { x: snap(newPoint.x), y: snap(newPoint.y) }];
    onChange(JSON.stringify(next));
  };

  const removeSelected = () => {
    if (selectedIndex === null || points.length <= 3) return;
    const next = points.filter((_, index) => index !== selectedIndex);
    setSelectedIndex(null);
    onChange(JSON.stringify(next));
  };

  const resetShape = () => {
    setSelectedIndex(null);
    onChange(JSON.stringify(defaultShape));
  };

  return (
    <div className="content-card deck-designer-card">
      <div className="section-heading inline-heading">
        <div>
          <p className="eyebrow">Deck layout</p>
          <h3>Draw the footprint</h3>
        </div>
        <div className="tag-row">
          <span className="tag">Snap: 6 in</span>
          <span className="tag">Points: {points.length}</span>
        </div>
      </div>

      <div className="deck-designer-grid">
        <div className="deck-canvas-wrap">
          <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="deck-canvas">
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
            {points.map((point, index) => {
              const svgPoint = toSvgPoint(point);
              return (
                <g key={`${point.x}-${point.y}-${index}`}>
                  <circle
                    cx={svgPoint.x}
                    cy={svgPoint.y}
                    r={selectedIndex === index ? 8 : 6}
                    className={selectedIndex === index ? 'deck-point active' : 'deck-point'}
                    onClick={() => setSelectedIndex(index)}
                  />
                  <text x={svgPoint.x + 10} y={svgPoint.y - 10} className="deck-point-label">P{index + 1}</text>
                </g>
              );
            })}
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
            <h4>Add point</h4>
            <div className="form-grid compact-grid">
              <label className="form-field">
                <span>X (ft)</span>
                <input type="number" step={GRID_SIZE} value={newPoint.x} onChange={(event) => setNewPoint((current) => ({ ...current, x: Number(event.target.value) }))} />
              </label>
              <label className="form-field">
                <span>Y (ft)</span>
                <input type="number" step={GRID_SIZE} value={newPoint.y} onChange={(event) => setNewPoint((current) => ({ ...current, y: Number(event.target.value) }))} />
              </label>
              <button type="button" className="primary-btn block-btn" onClick={addPoint}>
                Add point to shape
              </button>
              <button type="button" className="ghost-btn block-btn" onClick={resetShape}>
                Reset to rectangle
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
