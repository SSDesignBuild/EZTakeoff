import { MouseEvent, useMemo, useRef, useState } from 'react';
import { DeckPoint } from '../lib/types';

interface WoodenStructureEditorProps {
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

type HouseSides = Record<string, boolean>;

const VIEW_SIZE = 780;
const PAD = 46;
const SNAP = 1 / 12;

const snap = (value: number) => Math.round(value / SNAP) * SNAP;
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
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed as DeckPoint[];
    } catch {}
  }
  return rectFromDims(width, depth);
}

function parseHouseSides(raw: string | number | boolean | undefined): HouseSides {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as HouseSides;
    } catch {}
  }
  return { '0': true };
}

function feetAndInches(value: number) {
  const totalInches = Math.round(value * 12);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches ? `${feet}' ${inches}\"` : `${feet}'`;
}

function dist(a: DeckPoint, b: DeckPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleSnapPoint(origin: DeckPoint, raw: DeckPoint): DeckPoint {
  const dx = raw.x - origin.x;
  const dy = raw.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.01) return origin;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snappedAngle = Math.round(angle / step) * step;
  return { x: snap(origin.x + Math.cos(snappedAngle) * length), y: snap(origin.y + Math.sin(snappedAngle) * length) };
}

function boundsFor(points: DeckPoint[], width: number, depth: number) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(0, ...xs),
    maxX: Math.max(width, ...xs),
    minY: Math.min(0, ...ys),
    maxY: Math.max(depth, ...ys),
  };
}

export function WoodenStructureEditor({ values, onValuesChange }: WoodenStructureEditorProps) {
  const width = Math.max(1, Number(values.width ?? 16));
  const depth = Math.max(1, Number(values.projection ?? 12));
  const shape = useMemo(() => parseShape(values.woodenShape, width, depth), [values.woodenShape, width, depth]);
  const houseSides = useMemo(() => parseHouseSides(values.woodenHouseSides), [values.woodenHouseSides]);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [cursorPoint, setCursorPoint] = useState<DeckPoint | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bounds = boundsFor(shape, width, depth);
  const spanX = Math.max(1, bounds.maxX - bounds.minX) + 2;
  const spanY = Math.max(1, bounds.maxY - bounds.minY) + 2;
  const scale = Math.min((VIEW_SIZE - PAD * 2) / spanX, (VIEW_SIZE - PAD * 2) / spanY);
  const offsetX = PAD - bounds.minX * scale + scale;
  const offsetY = PAD - bounds.minY * scale + scale;
  const toSvg = (point: DeckPoint) => ({ x: offsetX + point.x * scale, y: offsetY + point.y * scale });
  const fromEvent = (event: MouseEvent<SVGSVGElement>): DeckPoint => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: snap((svgPt.x - offsetX) / scale), y: snap((svgPt.y - offsetY) / scale) };
  };

  const save = (nextShape: DeckPoint[], nextSides: HouseSides = houseSides) => {
    const cleanedSides = Object.fromEntries(Object.entries(nextSides).filter(([key]) => Number(key) < nextShape.length));
    onValuesChange((current) => ({
      ...current,
      woodenShape: JSON.stringify(nextShape.map((point) => ({ x: fmt(point.x), y: fmt(point.y) }))),
      woodenHouseSides: JSON.stringify(cleanedSides),
      woodenObstructions: JSON.stringify([]),
    }));
  };

  const startPointLayout = () => {
    setDrawing(true);
    setSelectedPoint(null);
    setCursorPoint(null);
    save([], {});
  };

  const resetFootprint = () => {
    setDrawing(false);
    setSelectedPoint(null);
    setCursorPoint(null);
    save(rectFromDims(width, depth), { '0': true });
  };

  const closeShape = () => {
    if (shape.length >= 3) {
      setDrawing(false);
      setCursorPoint(null);
    }
  };

  const updatePoint = (index: number, axis: 'x' | 'y', nextValue: number) => {
    const next = shape.map((point, pointIndex) => pointIndex === index ? { ...point, [axis]: snap(nextValue) } : point);
    save(next);
  };

  const removePoint = () => {
    if (selectedPoint === null || shape.length <= 2) return;
    const next = shape.filter((_, index) => index !== selectedPoint);
    setSelectedPoint(null);
    save(next);
  };

  const addMidPoint = (edgeIndex: number) => {
    if (shape.length < 2) return;
    const start = shape[edgeIndex];
    const end = shape[(edgeIndex + 1) % shape.length];
    const nextPoint = { x: snap((start.x + end.x) / 2), y: snap((start.y + end.y) / 2) };
    const next = [...shape.slice(0, edgeIndex + 1), nextPoint, ...shape.slice(edgeIndex + 1)];
    const nextSides: HouseSides = {};
    Object.entries(houseSides).forEach(([key, value]) => {
      const idx = Number(key);
      nextSides[String(idx > edgeIndex ? idx + 1 : idx)] = value;
    });
    setSelectedPoint(edgeIndex + 1);
    save(next, nextSides);
  };

  const toggleHouseSide = (edgeIndex: number) => {
    save(shape, { ...houseSides, [String(edgeIndex)]: !houseSides[String(edgeIndex)] });
  };

  const onCanvasMove = (event: MouseEvent<SVGSVGElement>) => {
    if (!drawing) return;
    const raw = fromEvent(event);
    const last = shape[shape.length - 1];
    setCursorPoint(last ? angleSnapPoint(last, raw) : raw);
  };

  const onCanvasClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!drawing) return;
    const raw = fromEvent(event);
    const last = shape[shape.length - 1];
    const nextPoint = last ? angleSnapPoint(last, raw) : raw;
    if (shape.length >= 3 && dist(nextPoint, shape[0]) <= 0.5) {
      closeShape();
      return;
    }
    save([...shape, nextPoint]);
    setSelectedPoint(shape.length);
  };

  const previewLine = drawing && cursorPoint && shape.length ? { start: toSvg(shape[shape.length - 1]), end: toSvg(cursorPoint), length: dist(shape[shape.length - 1], cursorPoint) } : null;
  const canClose = shape.length >= 3;
  const activeLength = previewLine?.length ?? 0;

  return (
    <article className="content-card full-width-card">
      <div className="section-heading">
        <p className="eyebrow">Drawing board</p>
        <h3>Point-to-point roof footprint</h3>
        <p className="small-muted">Click points in order. Cursor preview snaps to inches and locks to 90° / 45° from the last point. Click an edge after closing to mark it as house wall / attachment side.</p>
      </div>
      <div className="wooden-editor-shell">
        <div className="wooden-editor-toolbar" data-export-ignore="true">
          <button type="button" className="secondary-btn" onClick={startPointLayout}>Draw point-to-point</button>
          <button type="button" className="ghost-btn" onClick={closeShape} disabled={!canClose}>Close shape</button>
          <button type="button" className="ghost-btn" onClick={resetFootprint}>Reset rectangle</button>
          <span className="tag">Snap: 1 in · angle: 45°/90°</span>
          {drawing && <span className="tag">Current run: {feetAndInches(activeLength)}</span>}
        </div>
        <div className="wooden-editor-grid">
          <div className="wooden-editor-canvas">
            <svg ref={svgRef} viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="layout-svg wooden-editor-svg" onMouseMove={onCanvasMove} onClick={onCanvasClick}>
              <rect x="0" y="0" width={VIEW_SIZE} height={VIEW_SIZE} fill="var(--canvas)" rx="18" />
              {Array.from({ length: Math.ceil(spanX * 2) + 1 }, (_, index) => {
                const ft = bounds.minX - 1 + index / 2;
                const x = offsetX + ft * scale;
                const major = Math.abs(ft - Math.round(ft)) < 0.001;
                return <line key={`gx-${index}`} x1={x} y1={PAD} x2={x} y2={VIEW_SIZE - PAD} className={major ? 'wood-grid-major' : 'wood-grid-minor'} />;
              })}
              {Array.from({ length: Math.ceil(spanY * 2) + 1 }, (_, index) => {
                const ft = bounds.minY - 1 + index / 2;
                const y = offsetY + ft * scale;
                const major = Math.abs(ft - Math.round(ft)) < 0.001;
                return <line key={`gy-${index}`} x1={PAD} y1={y} x2={VIEW_SIZE - PAD} y2={y} className={major ? 'wood-grid-major' : 'wood-grid-minor'} />;
              })}
              {shape.length >= 3 && <polygon points={shape.map((point) => { const p = toSvg(point); return `${p.x},${p.y}`; }).join(' ')} className="wood-footprint" />}
              {shape.length >= 2 && shape.map((point, index) => {
                if (index === shape.length - 1 && drawing) return null;
                const next = shape[(index + 1) % shape.length];
                if (!next) return null;
                const start = toSvg(point);
                const end = toSvg(next);
                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2;
                const house = !!houseSides[String(index)];
                return (
                  <g key={`edge-${index}`}>
                    <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={house ? 'wood-house-side' : 'wood-edge-line'} onClick={(event) => { event.stopPropagation(); toggleHouseSide(index); }} />
                    <text x={midX + 7} y={midY - 7} className="svg-note">{house ? 'HOUSE WALL' : feetAndInches(dist(point, next))}</text>
                    {!drawing && <circle cx={midX} cy={midY} r="7" className="wood-midpoint" onClick={(event) => { event.stopPropagation(); addMidPoint(index); }} />}
                  </g>
                );
              })}
              {previewLine && <g><line x1={previewLine.start.x} y1={previewLine.start.y} x2={previewLine.end.x} y2={previewLine.end.y} className="wood-preview-line" /><text x={(previewLine.start.x + previewLine.end.x) / 2 + 8} y={(previewLine.start.y + previewLine.end.y) / 2 - 8} className="svg-note">{feetAndInches(previewLine.length)}</text></g>}
              {shape.map((point, index) => {
                const p = toSvg(point);
                return <g key={`pt-${index}`} onClick={(event) => { event.stopPropagation(); setSelectedPoint(index); }}><circle cx={p.x} cy={p.y} r="8" className={`wood-point${selectedPoint === index ? ' active' : ''}`} /><text x={p.x + 10} y={p.y - 10} className="svg-note">P{index + 1}</text></g>;
              })}
            </svg>
          </div>
          <div className="wooden-editor-side" data-export-ignore="true">
            <div className="content-card subtle-card">
              <p className="eyebrow">Point editor</p>
              <div className="stack-list wooden-points-list">
                {shape.map((point, index) => (
                  <div key={`point-row-${index}`} className={`wood-point-row${selectedPoint === index ? ' active' : ''}`}>
                    <button type="button" className="ghost-btn small-btn" onClick={() => setSelectedPoint(index)}>P{index + 1}</button>
                    <label className="form-field compact-form-field"><span>X</span><input type="number" step="0.083333" value={fmt(point.x)} onChange={(event) => updatePoint(index, 'x', Number(event.target.value))} /></label>
                    <label className="form-field compact-form-field"><span>Y</span><input type="number" step="0.083333" value={fmt(point.y)} onChange={(event) => updatePoint(index, 'y', Number(event.target.value))} /></label>
                  </div>
                ))}
              </div>
              <div className="preview-toolbar" style={{ marginTop: '0.75rem' }}>
                <button type="button" className="ghost-btn small-btn" onClick={removePoint}>Remove selected point</button>
              </div>
            </div>
            <div className="content-card subtle-card">
              <p className="eyebrow">House wall sides</p>
              <p className="small-muted">Click an edge in the drawing to toggle it as house wall. Red heavy edges become ledger/attachment/reference sides in the engineer layout.</p>
              <p className="small-muted">House wall edges selected: {Object.values(houseSides).filter(Boolean).length || 0}</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
