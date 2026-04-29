import { useMemo, useRef, useState } from 'react';
import { DeckPoint } from '../lib/types';

type ObstructionType = 'bump-out' | 'cutout' | 'roof-area' | 'wall-offset' | 'chimney' | 'note';
interface ObstructionRect {
  id: string;
  type: ObstructionType;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface WoodenStructureEditorProps {
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

const VIEW_SIZE = 780;
const PAD = 42;
const GRID_MAJOR = 1;
const GRID_MINOR = 1 / 2;
const SNAP = 1 / 12;

const snap = (value: number) => Math.round(value / SNAP) * SNAP;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const fmt = (value: number) => Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

function rectFromDims(width: number, depth: number): DeckPoint[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

function parseShape(raw: string | number | boolean | undefined, width: number, depth: number) {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 3) return parsed as DeckPoint[];
    } catch {}
  }
  return rectFromDims(width, depth);
}

function parseRects(raw: string | number | boolean | undefined): ObstructionRect[] {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ObstructionRect[];
    } catch {}
  }
  return [];
}

function feetAndInches(value: number) {
  const totalInches = Math.round(value * 12);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches ? `${feet}' ${inches}\"` : `${feet}'`;
}

function polygonBounds(points: DeckPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function WoodenStructureEditor({ values, onValuesChange }: WoodenStructureEditorProps) {
  const width = Math.max(1, Number(values.width ?? 16));
  const depth = Math.max(1, Number(values.projection ?? 12));
  const shape = useMemo(() => parseShape(values.woodenShape, width, depth), [values.woodenShape, width, depth]);
  const obstructions = useMemo(() => parseRects(values.woodenObstructions), [values.woodenObstructions]);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [selectedRect, setSelectedRect] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bounds = polygonBounds(shape);
  const spanX = Math.max(width, bounds.maxX - bounds.minX, ...obstructions.map((item) => item.x + item.width)) + 2;
  const spanY = Math.max(depth, bounds.maxY - bounds.minY, ...obstructions.map((item) => item.y + item.height)) + 2;
  const scale = Math.min((VIEW_SIZE - PAD * 2) / Math.max(1, spanX), (VIEW_SIZE - PAD * 2) / Math.max(1, spanY));
  const toSvg = (point: DeckPoint) => ({ x: PAD + point.x * scale, y: PAD + point.y * scale });
  const selectedObstacle = obstructions.find((item) => item.id === selectedRect) ?? null;

  const updateValues = (nextShape: DeckPoint[], nextObstructions = obstructions) => {
    onValuesChange((current) => ({
      ...current,
      woodenShape: JSON.stringify(nextShape.map((point) => ({ x: fmt(point.x), y: fmt(point.y) }))),
      woodenObstructions: JSON.stringify(nextObstructions.map((item) => ({ ...item, x: fmt(item.x), y: fmt(item.y), width: fmt(item.width), height: fmt(item.height) }))),
    }));
  };

  const updatePoint = (index: number, axis: 'x' | 'y', nextValue: number) => {
    const next = shape.map((point, pointIndex) => pointIndex === index ? { ...point, [axis]: snap(Math.max(0, nextValue)) } : point);
    updateValues(next);
  };

  const addMidPoint = (edgeIndex: number) => {
    const start = shape[edgeIndex];
    const end = shape[(edgeIndex + 1) % shape.length];
    const nextPoint = { x: snap((start.x + end.x) / 2), y: snap((start.y + end.y) / 2) };
    const next = [...shape.slice(0, edgeIndex + 1), nextPoint, ...shape.slice(edgeIndex + 1)];
    setSelectedPoint(edgeIndex + 1);
    updateValues(next);
  };

  const removePoint = () => {
    if (selectedPoint === null || shape.length <= 4) return;
    const next = shape.filter((_, index) => index !== selectedPoint);
    setSelectedPoint(null);
    updateValues(next);
  };

  const resetFootprint = () => {
    setSelectedPoint(null);
    setSelectedRect(null);
    updateValues(rectFromDims(width, depth), []);
  };

  const addObstruction = (type: ObstructionType) => {
    const nextRect: ObstructionRect = {
      id: `${type}-${Date.now()}`,
      type,
      x: Math.max(0.5, width / 3),
      y: Math.max(0.5, depth / 3),
      width: type === 'chimney' ? 2 : 4,
      height: type === 'chimney' ? 2 : 3,
      label: type === 'chimney' ? 'Chimney' : type === 'roof-area' ? 'Existing roof area' : type === 'wall-offset' ? 'Wall offset' : type === 'bump-out' ? 'Bump-out' : type === 'cutout' ? 'Jog / cutout' : 'Engineer note',
    };
    const next = [...obstructions, nextRect];
    setSelectedRect(nextRect.id);
    updateValues(shape, next);
  };

  const updateObstruction = (id: string, patch: Partial<ObstructionRect>) => {
    const next = obstructions.map((item) => item.id === id ? { ...item, ...patch } : item);
    updateValues(shape, next);
  };

  const removeObstruction = () => {
    if (!selectedRect) return;
    const next = obstructions.filter((item) => item.id !== selectedRect);
    setSelectedRect(null);
    updateValues(shape, next);
  };

  return (
    <article className="content-card full-width-card">
      <div className="section-heading">
        <p className="eyebrow">Drawing board</p>
        <h3>Wooden structure footprint + obstruction markup</h3>
      </div>
      <div className="wooden-editor-shell">
        <div className="wooden-editor-toolbar" data-export-ignore="true">
          <button type="button" className="secondary-btn" onClick={resetFootprint}>Reset to rectangle</button>
          <button type="button" className="ghost-btn" onClick={() => addObstruction('bump-out')}>Add bump-out</button>
          <button type="button" className="ghost-btn" onClick={() => addObstruction('cutout')}>Add jog / cutout</button>
          <button type="button" className="ghost-btn" onClick={() => addObstruction('roof-area')}>Add existing roof area</button>
          <button type="button" className="ghost-btn" onClick={() => addObstruction('wall-offset')}>Add wall offset</button>
          <button type="button" className="ghost-btn" onClick={() => addObstruction('chimney')}>Add chimney</button>
          <button type="button" className="ghost-btn" onClick={() => addObstruction('note')}>Add note box</button>
        </div>
        <div className="wooden-editor-grid">
          <div className="wooden-editor-canvas">
            <svg ref={svgRef} viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="layout-svg wooden-editor-svg">
              <rect x="0" y="0" width={VIEW_SIZE} height={VIEW_SIZE} fill="var(--canvas)" rx="18" />
              {Array.from({ length: Math.ceil(spanX / GRID_MINOR) + 1 }, (_, index) => {
                const xFt = index * GRID_MINOR;
                const x = PAD + xFt * scale;
                const major = Math.abs((xFt / GRID_MAJOR) - Math.round(xFt / GRID_MAJOR)) < 0.001;
                return <line key={`gx-${index}`} x1={x} y1={PAD} x2={x} y2={VIEW_SIZE - PAD} className={major ? 'wood-grid-major' : 'wood-grid-minor'} />;
              })}
              {Array.from({ length: Math.ceil(spanY / GRID_MINOR) + 1 }, (_, index) => {
                const yFt = index * GRID_MINOR;
                const y = PAD + yFt * scale;
                const major = Math.abs((yFt / GRID_MAJOR) - Math.round(yFt / GRID_MAJOR)) < 0.001;
                return <line key={`gy-${index}`} x1={PAD} y1={y} x2={VIEW_SIZE - PAD} y2={y} className={major ? 'wood-grid-major' : 'wood-grid-minor'} />;
              })}
              {obstructions.map((item) => {
                const x = PAD + item.x * scale;
                const y = PAD + item.y * scale;
                const w = item.width * scale;
                const h = item.height * scale;
                return (
                  <g key={item.id} onClick={() => setSelectedRect(item.id)}>
                    <rect x={x} y={y} width={w} height={h} className={`wood-obstruction wood-obstruction-${item.type}${selectedRect === item.id ? ' active' : ''}`} rx="8" />
                    <text x={x + 8} y={y + 18} className="svg-note">{item.label}</text>
                  </g>
                );
              })}
              <polygon points={shape.map((point) => {
                const svgPoint = toSvg(point);
                return `${svgPoint.x},${svgPoint.y}`;
              }).join(' ')} className="wood-footprint" />
              {shape.map((point, index) => {
                const svgPoint = toSvg(point);
                return (
                  <g key={`pt-${index}`} onClick={() => setSelectedPoint(index)}>
                    <circle cx={svgPoint.x} cy={svgPoint.y} r="8" className={`wood-point${selectedPoint === index ? ' active' : ''}`} />
                    <text x={svgPoint.x + 10} y={svgPoint.y - 10} className="svg-note">P{index + 1}</text>
                  </g>
                );
              })}
              {shape.map((point, index) => {
                const next = shape[(index + 1) % shape.length];
                const start = toSvg(point);
                const end = toSvg(next);
                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2;
                const len = Math.hypot(next.x - point.x, next.y - point.y);
                return (
                  <g key={`edge-${index}`}>
                    <text x={midX + 6} y={midY - 6} className="svg-note">{feetAndInches(len)}</text>
                    <circle cx={midX} cy={midY} r="7" className="wood-midpoint" onClick={() => addMidPoint(index)} />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="wooden-editor-side" data-export-ignore="true">
            <div className="content-card subtle-card">
              <p className="eyebrow">Footprint points</p>
              <p className="small-muted">Start with the width/depth rectangle, then drag coordinates or add midpoint handles to shape around jogs, bump-outs, and offsets.</p>
              <div className="stack-list wooden-points-list">
                {shape.map((point, index) => (
                  <div key={`point-row-${index}`} className={`wood-point-row${selectedPoint === index ? ' active' : ''}`}>
                    <button type="button" className="ghost-btn" onClick={() => setSelectedPoint(index)}>P{index + 1}</button>
                    <label className="form-field compact-form-field"><span>X (ft)</span><input type="number" step="0.0833" value={fmt(point.x)} onChange={(event) => updatePoint(index, 'x', Number(event.target.value))} /></label>
                    <label className="form-field compact-form-field"><span>Y (ft)</span><input type="number" step="0.0833" value={fmt(point.y)} onChange={(event) => updatePoint(index, 'y', Number(event.target.value))} /></label>
                  </div>
                ))}
              </div>
              <div className="preview-toolbar" style={{ marginTop: '0.75rem' }}>
                <button type="button" className="ghost-btn small-btn" onClick={removePoint}>Remove selected point</button>
              </div>
            </div>
            <div className="content-card subtle-card">
              <p className="eyebrow">Selected note / obstruction</p>
              {selectedObstacle ? (
                <div className="stack-list">
                  <label className="form-field compact-form-field"><span>Label</span><input value={selectedObstacle.label} onChange={(event) => updateObstruction(selectedObstacle.id, { label: event.target.value })} /></label>
                  <div className="compact-grid-2">
                    <label className="form-field compact-form-field"><span>X (ft)</span><input type="number" step="0.25" value={fmt(selectedObstacle.x)} onChange={(event) => updateObstruction(selectedObstacle.id, { x: clamp(Number(event.target.value), 0, 200) })} /></label>
                    <label className="form-field compact-form-field"><span>Y (ft)</span><input type="number" step="0.25" value={fmt(selectedObstacle.y)} onChange={(event) => updateObstruction(selectedObstacle.id, { y: clamp(Number(event.target.value), 0, 200) })} /></label>
                    <label className="form-field compact-form-field"><span>Width (ft)</span><input type="number" step="0.25" value={fmt(selectedObstacle.width)} onChange={(event) => updateObstruction(selectedObstacle.id, { width: clamp(Number(event.target.value), 0.5, 200) })} /></label>
                    <label className="form-field compact-form-field"><span>Height (ft)</span><input type="number" step="0.25" value={fmt(selectedObstacle.height)} onChange={(event) => updateObstruction(selectedObstacle.id, { height: clamp(Number(event.target.value), 0.5, 200) })} /></label>
                  </div>
                  <button type="button" className="ghost-btn small-btn" onClick={removeObstruction}>Remove selected note / obstruction</button>
                </div>
              ) : <p className="small-muted">Select a markup box to edit its size, location, and note.</p>}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
