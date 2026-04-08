import { buildDeckModel } from '../lib/deckModel';

interface LayoutPreviewProps {
  serviceSlug: string;
  values: Record<string, string | number | boolean>;
}

export function LayoutPreview({ serviceSlug, values }: LayoutPreviewProps) {
  if (serviceSlug === 'decks') {
    const deck = buildDeckModel(values);
    const scale = Math.min(360 / Math.max(deck.width, 1), 260 / Math.max(deck.depth, 1));
    const x0 = 36;
    const y0 = 42;

    const pointString = deck.points.map((point) => `${x0 + (point.x - deck.minX) * scale},${y0 + (point.y - deck.minY) * scale}`).join(' ');

    const joistLines = deck.joistDirection === 'vertical'
      ? Array.from({ length: Math.max(0, Math.floor(deck.width)) }, (_, index) => deck.minX + 0.5 + index)
      : Array.from({ length: Math.max(0, Math.floor(deck.depth)) }, (_, index) => deck.minY + 0.5 + index);

    return (
      <div className="visual-card">
        <div className="visual-header">
          <h3>Layout preview</h3>
          <span>House, beam lines, posts, joists, and footprint</span>
        </div>
        <svg viewBox={`0 0 ${deck.width * scale + 84} ${deck.depth * scale + 96}`} className="layout-svg">
          <polygon points={pointString} className="deck-polygon" />

          {!deck.isFreestanding && (
            <>
              <line x1={x0} y1={y0 - 16} x2={x0 + deck.width * scale} y2={y0 - 16} className="house-line" />
              <text x={x0} y={y0 - 22} className="svg-note">House / ledger side</text>
            </>
          )}

          {joistLines.map((lineValue) => {
            if (deck.joistDirection === 'vertical') {
              const x = x0 + (lineValue - deck.minX) * scale;
              return <line key={lineValue} x1={x} y1={y0 + 6} x2={x} y2={y0 + deck.depth * scale - 6} className="joist-line" />;
            }
            const y = y0 + (lineValue - deck.minY) * scale;
            return <line key={lineValue} x1={x0 + 6} y1={y} x2={x0 + deck.width * scale - 6} y2={y} className="joist-line" />;
          })}

          {deck.beamLines.map((beam, index) => (
            <g key={`${beam.y}-${index}`}>
              {beam.segments.map((segment) => (
                <line
                  key={`${segment.startX}-${segment.endX}`}
                  x1={x0 + (segment.startX - deck.minX) * scale}
                  y1={y0 + (beam.y - deck.minY) * scale}
                  x2={x0 + (segment.endX - deck.minX) * scale}
                  y2={y0 + (beam.y - deck.minY) * scale}
                  className="beam-line"
                />
              ))}
              {beam.postXs.map((postX) => (
                <rect
                  key={`${postX}-${beam.y}`}
                  x={x0 + (postX - deck.minX) * scale - 4}
                  y={y0 + (beam.y - deck.minY) * scale - 4}
                  width="8"
                  height="8"
                  className="post-node"
                  rx="2"
                />
              ))}
            </g>
          ))}

          {deck.exposedSegments.map((segment, index) => (
            <line
              key={`${segment.length}-${index}`}
              x1={x0 + (segment.start.x - deck.minX) * scale}
              y1={y0 + (segment.start.y - deck.minY) * scale}
              x2={x0 + (segment.end.x - deck.minX) * scale}
              y2={y0 + (segment.end.y - deck.minY) * scale}
              className="railing-line"
            />
          ))}

          <text x={x0} y={y0 + deck.depth * scale + 24} className="svg-note">
            {`Joists ${deck.joistSize} @ 12 in O.C. · ${deck.beamLines.length} beam line${deck.beamLines.length === 1 ? '' : 's'} · ${deck.postCount} posts`}
          </text>
        </svg>
        <div className="legend-row">
          <span><i className="legend-swatch joist-line-swatch" />Joists</span>
          <span><i className="legend-swatch beam-line-swatch" />Beams</span>
          <span><i className="legend-swatch post-node-swatch" />Posts</span>
          <span><i className="legend-swatch railing-line-swatch" />Exposed edge / railing</span>
        </div>
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
