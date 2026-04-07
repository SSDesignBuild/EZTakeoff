import { DeckPoint } from '../lib/types';

interface LayoutPreviewProps {
  serviceSlug: string;
  values: Record<string, string | number | boolean>;
}

const parseDeckShape = (raw: string | number | boolean | undefined): DeckPoint[] => {
  if (typeof raw !== 'string') {
    return [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 12 },
      { x: 0, y: 12 },
    ];
  }

  try {
    const parsed = JSON.parse(raw) as DeckPoint[];
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    }
  } catch {
    return [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 12 },
      { x: 0, y: 12 },
    ];
  }

  return [
    { x: 0, y: 0 },
    { x: 16, y: 0 },
    { x: 16, y: 12 },
    { x: 0, y: 12 },
  ];
};

export function LayoutPreview({ serviceSlug, values }: LayoutPreviewProps) {
  if (serviceSlug === 'decks') {
    const points = parseDeckShape(values.deckShape);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const boardRun = String(values.boardRun ?? 'width');
    const scale = Math.min(340 / spanX, 260 / spanY);
    const x0 = 30;
    const y0 = 30;

    const svgPoints = points.map((point) => ({
      x: x0 + (point.x - minX) * scale,
      y: y0 + (point.y - minY) * scale,
    }));

    const joistCount = Math.max(2, Math.ceil(((boardRun === 'width' ? spanX : spanY) * 12) / 12) + 1);

    return (
      <div className="visual-card">
        <div className="visual-header">
          <h3>Layout preview</h3>
          <span>Deck shape with joist orientation and house edge reference</span>
        </div>
        <svg viewBox={`0 0 ${spanX * scale + 80} ${spanY * scale + 80}`} className="layout-svg">
          <polygon
            points={svgPoints.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="rgba(178, 124, 76, 0.18)"
            stroke="var(--accent)"
            strokeWidth="4"
          />
          {Array.from({ length: joistCount }, (_, index) => {
            if (boardRun === 'width') {
              const x = x0 + 8 + (index * (spanX * scale - 16)) / Math.max(joistCount - 1, 1);
              return <line key={index} x1={x} y1={y0 + 10} x2={x} y2={y0 + spanY * scale - 10} className="joist-line" />;
            }

            const y = y0 + 8 + (index * (spanY * scale - 16)) / Math.max(joistCount - 1, 1);
            return <line key={index} x1={x0 + 10} y1={y} x2={x0 + spanX * scale - 10} y2={y} className="joist-line" />;
          })}
          <line x1={x0} y1={y0 - 14} x2={x0 + spanX * scale} y2={y0 - 14} className="house-line" />
          <text x={x0} y={y0 - 20} className="svg-note">House / ledger side</text>
        </svg>
      </div>
    );
  }

  if (serviceSlug === 'patio-covers') {
    const width = Number(values.width ?? 21);
    const projection = Number(values.projection ?? 8);
    const scale = 20;
    const x0 = 40;
    const y0 = 60;
    const roofW = width * scale;
    const roofD = projection * scale;
    const panelCount = Math.ceil(width);

    return (
      <div className="visual-card">
        <div className="visual-header">
          <h3>Layout preview</h3>
          <span>Top view with panel bays</span>
        </div>
        <svg viewBox={`0 0 ${roofW + 80} ${roofD + 120}`} className="layout-svg">
          <rect x={x0} y={y0} width={roofW} height={roofD} className="roof-box" rx="10" />
          {Array.from({ length: panelCount - 1 }, (_, index) => {
            const x = x0 + ((index + 1) * roofW) / panelCount;
            return <line key={index} x1={x} y1={y0} x2={x} y2={y0 + roofD} className="roof-bay" />;
          })}
          <line x1={x0} y1={y0 + roofD + 18} x2={x0 + roofW} y2={y0 + roofD + 18} className="house-line" />
          <text x={x0} y={y0 - 12} className="svg-note">House attachment</text>
        </svg>
      </div>
    );
  }

  const openingCount = Number(values.openingCount ?? 5);
  const openingWidth = Number(values.openingWidth ?? 6);
  const openingHeight = Number(values.openingHeight ?? 8);
  const scale = 28;
  const x0 = 30;
  const y0 = 30;
  const totalW = openingCount * openingWidth * scale;
  const totalH = openingHeight * scale;

  return (
    <div className="visual-card">
      <div className="visual-header">
        <h3>Layout preview</h3>
        <span>Opening layout with door-ready bays</span>
      </div>
      <svg viewBox={`0 0 ${totalW + 60} ${totalH + 60}`} className="layout-svg">
        <rect x={x0} y={y0} width={totalW} height={totalH} className="screen-box" rx="8" />
        {Array.from({ length: openingCount - 1 }, (_, index) => {
          const x = x0 + ((index + 1) * totalW) / openingCount;
          return <line key={index} x1={x} y1={y0} x2={x} y2={y0 + totalH} className="screen-divider" />;
        })}
        <line x1={x0} y1={y0 + totalH * 0.55} x2={x0 + totalW} y2={y0 + totalH * 0.55} className="screen-chair-rail" />
      </svg>
    </div>
  );
}
