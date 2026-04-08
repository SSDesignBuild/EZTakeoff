import { buildDeckModel } from '../lib/deckModel';
import { buildPatioPanelLayout } from '../lib/patioLayout';
import { parseSections } from '../lib/sectioning';
import { DeckEdgeSegment, DeckPoint, SectionConfig } from '../lib/types';

interface LayoutPreviewProps {
  serviceSlug: string;
  values: Record<string, string | number | boolean>;
}

const feetAndInches = (feet: number) => {
  const inchesTotal = Math.round(feet * 12);
  const ft = Math.floor(inchesTotal / 12);
  const inches = inchesTotal % 12;
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

function offsetSegment(segment: DeckEdgeSegment, distance: number) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  return {
    start: { x: segment.start.x + nx * distance, y: segment.start.y + ny * distance },
    end: { x: segment.end.x + nx * distance, y: segment.end.y + ny * distance },
  };
}

function DeckPreview({ values }: { values: Record<string, string | number | boolean> }) {
  const deck = buildDeckModel(values);
  const scale = Math.min(520 / Math.max(deck.width, 1), 360 / Math.max(deck.depth, 1));
  const pad = 70;
  const toSvg = (x: number, y: number) => ({ x: pad + (x - deck.minX) * scale, y: pad + (y - deck.minY) * scale });
  const pointString = deck.points.map((point) => {
    const svgPoint = toSvg(point.x, point.y);
    return `${svgPoint.x},${svgPoint.y}`;
  }).join(' ');

  const boardScanlines = deck.boardRun === 'width'
    ? Array.from({ length: Math.max(1, Math.floor(deck.depth / 0.75)) }, (_, index) => deck.minY + 0.25 + index * 0.75)
    : Array.from({ length: Math.max(1, Math.floor(deck.width / 0.75)) }, (_, index) => deck.minX + 0.25 + index * 0.75);
  const joistScanlines = deck.joistDirection === 'vertical'
    ? Array.from({ length: Math.max(1, Math.floor(deck.width)) }, (_, index) => deck.minX + 0.5 + index)
    : Array.from({ length: Math.max(1, Math.floor(deck.depth)) }, (_, index) => deck.minY + 0.5 + index);

  const stairStart = deck.stairPlacement.start ? toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y) : null;
  const stairEnd = deck.stairPlacement.end ? toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y) : null;
  const stairDx = stairStart && stairEnd ? stairEnd.x - stairStart.x : 0;
  const stairDy = stairStart && stairEnd ? stairEnd.y - stairStart.y : 0;
  const stairLen = Math.hypot(stairDx, stairDy) || 1;
  const stairNx = stairLen ? -stairDy / stairLen : 0;
  const stairNy = stairLen ? stairDx / stairLen : 0;

  return (
    <div className="visual-card">
      <div className="visual-header">
        <h3>Layout preview</h3>
        <span>Print-oriented framing plan with separate board, joist, beam, band, post, railing, and stair layers.</span>
      </div>
      <svg viewBox={`0 0 ${deck.width * scale + pad * 2} ${deck.depth * scale + pad * 2 + 80}`} className="layout-svg">
        <polygon points={pointString} className="deck-polygon" />

        {boardScanlines.map((value) => (
          deck.boardRun === 'width'
            ? scanlineIntersections(deck.points, 'horizontal', value).map((pair, index) => {
                const a = toSvg(pair.start, value);
                const b = toSvg(pair.end, value);
                return <line key={`board-${value}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="deck-board-line" />;
              })
            : scanlineIntersections(deck.points, 'vertical', value).map((pair, index) => {
                const a = toSvg(value, pair.start);
                const b = toSvg(value, pair.end);
                return <line key={`board-${value}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="deck-board-line" />;
              })
        ))}

        {joistScanlines.map((value) => (
          deck.joistDirection === 'vertical'
            ? scanlineIntersections(deck.points, 'vertical', value).map((pair, index) => {
                const a = toSvg(value, pair.start);
                const b = toSvg(value, pair.end);
                return <line key={`joist-${value}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="joist-line" />;
              })
            : scanlineIntersections(deck.points, 'horizontal', value).map((pair, index) => {
                const a = toSvg(pair.start, value);
                const b = toSvg(pair.end, value);
                return <line key={`joist-${value}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="joist-line" />;
              })
        ))}

        {!deck.isFreestanding && (
          <>
            <line x1={pad} y1={pad - 22} x2={pad + deck.width * scale} y2={pad - 22} className="house-line" />
            <text x={pad} y={pad - 28} className="svg-note">House / ledger side</text>
          </>
        )}

        {deck.edgeSegments.map((segment) => {
          const outer = offsetSegment(segment, 0.02);
          const inner = offsetSegment(segment, -0.14);
          const a1 = toSvg(outer.start.x, outer.start.y);
          const b1 = toSvg(outer.end.x, outer.end.y);
          const a2 = toSvg(inner.start.x, inner.start.y);
          const b2 = toSvg(inner.end.x, inner.end.y);
          return (
            <g key={`band-${segment.index}`}>
              <line x1={a1.x} y1={a1.y} x2={b1.x} y2={b1.y} className="band-line" />
              <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} className="band-line secondary" />
            </g>
          );
        })}

        {deck.beamLines.map((beam, index) => (
          <g key={`beam-${index}`}>
            {beam.segments.map((segment, segIndex) => {
              const y = toSvg(segment.startX, beam.y).y;
              const x1 = toSvg(segment.startX, beam.y).x;
              const x2 = toSvg(segment.endX, beam.y).x;
              return (
                <g key={`beamseg-${index}-${segIndex}`}>
                  <line x1={x1} y1={y - 5} x2={x2} y2={y - 5} className="beam-line" />
                  <line x1={x1} y1={y + 5} x2={x2} y2={y + 5} className="beam-line" />
                </g>
              );
            })}
            {beam.postXs.map((postX) => {
              const p = toSvg(postX, beam.y);
              return <rect key={`post-${beam.y}-${postX}`} x={p.x - 5} y={p.y - 5} width="10" height="10" className={beam.lockedPostXs.includes(postX) ? 'post-node locked-post' : 'post-node'} rx="2" />;
            })}
          </g>
        ))}

        {deck.exposedSegments.map((segment) => {
          const rail = offsetSegment(segment, 0.2);
          const a = toSvg(rail.start.x, rail.start.y);
          const b = toSvg(rail.end.x, rail.end.y);
          return <line key={`railing-${segment.index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="railing-line" />;
        })}
        {deck.exposedSegments.flatMap((segment) => {
          const postCount = Math.max(2, Math.ceil(segment.length / 6) + 1);
          return Array.from({ length: postCount }, (_, index) => {
            const ratio = postCount === 1 ? 0 : index / (postCount - 1);
            const x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
            const y = segment.start.y + (segment.end.y - segment.start.y) * ratio;
            const shifted = offsetSegment({ ...segment, start: { x, y }, end: { x, y } }, 0.26).start;
            const p = toSvg(shifted.x, shifted.y);
            return <circle key={`railpost-${segment.index}-${index}`} cx={p.x} cy={p.y} r="4" className="railing-post-node" />;
          });
        })}

        {stairStart && stairEnd && (
          <>
            <line x1={stairStart.x} y1={stairStart.y} x2={stairEnd.x} y2={stairEnd.y} className="stair-edge-highlight" />
            {Array.from({ length: Math.max(deck.stairRisers, 1) }, (_, index) => {
              const ratio = (index + 1) / Math.max(deck.stairRisers + 1, 2);
              const sx = stairStart.x + stairDx * ratio;
              const sy = stairStart.y + stairDy * ratio;
              return <line key={`stringer-${index}`} x1={sx} y1={sy} x2={sx + stairNx * 56} y2={sy + stairNy * 56} className="stringer-line" />;
            })}
            {Array.from({ length: Math.max(deck.stairTreadsPerRun, 0) }, (_, index) => {
              const t = (index + 1) / Math.max(deck.stairTreadsPerRun + 1, 2);
              const aX = stairStart.x + stairDx * 0 + stairNx * (t * 56);
              const aY = stairStart.y + stairDy * 0 + stairNy * (t * 56);
              const bX = stairEnd.x + stairNx * (t * 56);
              const bY = stairEnd.y + stairNy * (t * 56);
              return <line key={`tread-${index}`} x1={aX} y1={aY} x2={bX} y2={bY} className="stair-tread-line" />;
            })}
            <text x={(stairStart.x + stairEnd.x) / 2 - 36} y={(stairStart.y + stairEnd.y) / 2 - 12} className="svg-note">
              {`${deck.stairRisers} risers · ${deck.stairTreadsPerRun} treads · ${deck.stairStringers} total stringers`}
            </text>
          </>
        )}

        <line x1={pad} y1={pad + deck.depth * scale + 30} x2={pad + deck.width * scale} y2={pad + deck.depth * scale + 30} className="dimension-line" />
        <text x={pad + deck.width * scale / 2 - 20} y={pad + deck.depth * scale + 25} className="svg-note">{feetAndInches(deck.width)}</text>
        <line x1={pad - 28} y1={pad} x2={pad - 28} y2={pad + deck.depth * scale} className="dimension-line" />
        <text x={pad - 58} y={pad + deck.depth * scale / 2} className="svg-note">{feetAndInches(deck.depth)}</text>
        <text x={pad} y={pad + deck.depth * scale + 56} className="svg-note">
          {`Boards ${deck.boardRun === 'width' ? 'parallel with house' : 'perpendicular to house'} · Joists ${deck.joistDirection === 'vertical' ? 'perpendicular to house' : 'parallel with house'} · ${deck.beamLines.length} beam line(s)`}
        </text>
      </svg>
      <div className="legend-row">
        <span><i className="legend-swatch deck-board-line-swatch" />Deck boards</span>
        <span><i className="legend-swatch joist-line-swatch" />Joists</span>
        <span><i className="legend-swatch beam-line-swatch" />Double beam</span>
        <span><i className="legend-swatch band-line-swatch" />Double band</span>
        <span><i className="legend-swatch railing-line-swatch" />Railing</span>
        <span><i className="legend-swatch railing-post-line-swatch" />4x4 railing posts</span>
      </div>
    </div>
  );
}

function PatioPreview({ values }: { values: Record<string, string | number | boolean> }) {
  const width = Number(values.width ?? 21);
  const projection = Number(values.projection ?? 8);
  const structureType = String(values.structureType ?? 'attached');
  const fanBeam = String(values.fanBeam ?? 'none');
  const screenUnderneath = Boolean(values.screenUnderneath ?? false);
  const panelLayout = buildPatioPanelLayout(width, fanBeam, Number(values.panelWidth ?? 4));
  const panelThickness = Number(values.panelThickness ?? 3);
  const metalGauge = String(values.metalGauge ?? '.26');
  const foamDensity = Number(values.foamDensity ?? 1);
  const standard3In = panelThickness === 3 && !(metalGauge === '.32' && foamDensity === 2);
  const supportBeamCount = standard3In && projection > 13 ? Math.ceil(projection / 13) - 1 : 0;
  const frontPostCount = Math.max(2, Math.ceil(width / 6) + 1);
  const scale = 26;
  const x0 = 60;
  const y0 = 62;
  const roofW = width * scale;
  const roofD = projection * scale;
  let runningX = x0;

  return (
    <div className="visual-card">
      <div className="visual-header">
        <h3>Layout preview</h3>
        <span>Symmetry-aware panel plan with fan-beam placement, cut-piece callouts, posts, beams, and printable dimensions.</span>
      </div>
      <svg viewBox={`0 0 ${roofW + 140} ${roofD + 170}`} className="layout-svg">
        <rect x={x0} y={y0} width={roofW} height={roofD} className="roof-box" rx="10" />
        {panelLayout.pieces.map((piece, index) => {
          const panelW = piece.widthFt * scale;
          const currentX = runningX;
          runningX += panelW;
          return (
            <g key={`panel-${index}`}>
              <rect x={currentX} y={y0} width={panelW} height={roofD} className={piece.kind === 'fan-beam' ? 'fan-panel-box' : piece.kind === 'cut' ? 'cut-panel-box' : 'roof-bay-panel'} rx="6" />
              <text x={currentX + panelW / 2 - 16} y={y0 + 18} className="svg-note">{feetAndInches(piece.widthFt)}</text>
              {piece.note && <text x={currentX + 6} y={y0 + roofD - 10} className="svg-note">{piece.note}</text>}
            </g>
          );
        })}
        <line x1={x0} y1={y0 + roofD} x2={x0 + roofW} y2={y0 + roofD} className="beam-line" />
        {Array.from({ length: supportBeamCount }, (_, index) => {
          const y = y0 + (((index + 1) * roofD) / (supportBeamCount + 1));
          return <line key={`support-${index}`} x1={x0} y1={y} x2={x0 + roofW} y2={y} className="beam-line support" />;
        })}
        {Array.from({ length: frontPostCount }, (_, index) => {
          const x = x0 + (roofW * index) / Math.max(frontPostCount - 1, 1);
          return <rect key={`post-${index}`} x={x - 5} y={y0 + roofD - 5} width="10" height="10" className="post-node" rx="2" />;
        })}
        <line x1={x0} y1={y0 + roofD + 30} x2={x0 + roofW} y2={y0 + roofD + 30} className="dimension-line" />
        <text x={x0 + roofW / 2 - 16} y={y0 + roofD + 24} className="svg-note">{feetAndInches(width)}</text>
        <line x1={x0 - 26} y1={y0} x2={x0 - 26} y2={y0 + roofD} className="dimension-line" />
        <text x={x0 - 58} y={y0 + roofD / 2} className="svg-note">{feetAndInches(projection)}</text>
        <text x={x0} y={y0 - 14} className="svg-note">{structureType === 'attached' ? 'House / C-channel side' : 'Freestanding back side'}</text>
        <text x={x0} y={y0 + roofD + 54} className="svg-note">{`${screenUnderneath ? '3x3 screened-under beam' : 'Atlas beam'} · ${frontPostCount} posts · ${supportBeamCount} intermediate beam(s)`}</text>
      </svg>
    </div>
  );
}

function ScreenPreview({ values, renaissance }: { values: Record<string, string | number | boolean>; renaissance: boolean }) {
  const sections = parseSections(values.sections, 3);
  const scale = 30;
  const x0 = 36;
  const y0 = 36;
  const totalW = sections.reduce((sum, section) => sum + section.width * scale, 0);
  const totalH = Math.max(...sections.map((section) => section.height * scale), 190);
  let runningX = x0;

  return (
    <div className="visual-card">
      <div className="visual-header">
        <h3>Layout preview</h3>
        <span>Installer drawing with separated material lanes so receiver, 1x2, 2x2, pickets, kick panels, and door framing read clearly on print.</span>
      </div>
      <svg viewBox={`0 0 ${totalW + 120} ${totalH + 120}`} className="layout-svg">
        {sections.map((section) => {
          const sectionW = section.width * scale;
          const sectionH = section.height * scale;
          const currentX = runningX;
          runningX += sectionW + 12;
          const doorLeft = (sectionDoorLeft(section) / 12) * scale;
          const doorWidth = Math.min(section.doorWidth, section.width) * scale;
          const hasDoor = section.doorType !== 'none';
          const kickHeight = (section.kickPanel === 'none' ? 0 : section.kickPanelHeight) * scale;
          const chairY = y0 + sectionH * 0.55;
          const top = y0;
          const bottom = y0 + sectionH;
          const left = currentX;
          const right = currentX + sectionW;
          const doorL = left + doorLeft;
          const doorR = doorL + doorWidth;
          const activeNoGroove = renaissance ? 'two-by-two-no-groove-line' : 'two-by-two-line';
          const activeGroove = renaissance ? 'channel-2x2-line' : 'two-by-two-line';

          return (
            <g key={section.id}>
              <rect x={left} y={top} width={sectionW} height={sectionH} className="screen-box" rx="8" />

              <line x1={left} y1={top + 2} x2={right} y2={top + 2} className="receiver-line" />
              <line x1={left} y1={bottom - 2} x2={right} y2={bottom - 2} className="receiver-line" />
              <line x1={left + 2} y1={top} x2={left + 2} y2={bottom} className="receiver-line" />
              <line x1={right - 2} y1={top} x2={right - 2} y2={bottom} className="receiver-line" />

              {!renaissance && section.kickPanel !== 'insulated' && (
                <>
                  <line x1={left + 10} y1={top + 10} x2={right - 10} y2={top + 10} className="one-by-two-line" />
                  <line x1={left + 10} y1={bottom - 10} x2={right - 10} y2={bottom - 10} className={section.kickPanel === 'trim-coil' ? 'vgroove-top-line' : 'one-by-two-line'} />
                  <line x1={left + 10} y1={top + 10} x2={left + 10} y2={bottom - 10} className="one-by-two-line" />
                  <line x1={right - 10} y1={top + 10} x2={right - 10} y2={bottom - 10} className="one-by-two-line" />
                </>
              )}

              {renaissance && (
                <>
                  <line x1={left + 10} y1={top + 10} x2={right - 10} y2={top + 10} className="receiver-line" />
                  <line x1={left + 10} y1={bottom - 10} x2={right - 10} y2={bottom - 10} className="receiver-line" />
                  <line x1={left + 10} y1={top + 10} x2={left + 10} y2={bottom - 10} className="receiver-line" />
                  <line x1={right - 10} y1={top + 10} x2={right - 10} y2={bottom - 10} className="receiver-line" />
                </>
              )}

              {Array.from({ length: section.uprights }, (_, index) => {
                const x = left + ((index + 1) * sectionW) / (section.uprights + 1);
                const y1 = top + 18;
                const y2 = bottom - 18;
                return <line key={`upright-${index}`} x1={x} y1={y1} x2={x} y2={y2} className={activeNoGroove} />;
              })}

              {section.chairRail && (
                <line x1={hasDoor ? left + 18 : left + 14} y1={chairY} x2={hasDoor ? doorL - 6 : right - 14} y2={chairY} className={section.pickets || section.kickPanel === 'insulated' ? activeGroove : activeNoGroove} />
              )}
              {section.chairRail && hasDoor && <line x1={doorR + 6} y1={chairY} x2={right - 14} y2={chairY} className={section.pickets || section.kickPanel === 'insulated' ? activeGroove : activeNoGroove} />}

              {section.kickPanel !== 'none' && (
                <>
                  <rect x={left + 16} y={bottom - kickHeight} width={sectionW - 32} height={kickHeight - 8} className={section.kickPanel === 'insulated' ? 'insulated-panel-box' : 'kick-panel-box'} rx="4" />
                  <line x1={left + 12} y1={bottom - kickHeight} x2={right - 12} y2={bottom - kickHeight} className={section.kickPanel === 'trim-coil' ? 'vgroove-top-line' : activeGroove} />
                </>
              )}

              {section.pickets && Array.from({ length: Math.max(1, Math.floor(((section.width - (hasDoor ? Math.min(section.doorWidth, section.width) : 0)) * 12) / 8)) }, (_, index) => {
                const clearWidth = section.width * 12 - (hasDoor ? section.doorWidth * 12 : 0);
                const offset = 10 + (index * Math.max(8, (clearWidth * scale / 12) / Math.max(1, Math.floor(clearWidth / 8))));
                const x = left + Math.min(offset, sectionW - 16);
                const insideDoor = hasDoor && x > doorL - 4 && x < doorR + 4;
                if (insideDoor) return null;
                return <line key={`pick-${index}`} x1={x} y1={chairY + 8} x2={x} y2={bottom - 14} className="picket-line" />;
              })}

              {hasDoor && (
                <>
                  <rect x={doorL} y={top + 24} width={doorWidth} height={sectionH - 30} className="door-box" rx="4" />
                  <line x1={doorL} y1={top + 18} x2={doorL} y2={bottom - 12} className={activeNoGroove} />
                  <line x1={doorR} y1={top + 18} x2={doorR} y2={bottom - 12} className={activeNoGroove} />
                  <line x1={doorL} y1={top + 24} x2={doorR} y2={top + 24} className={activeNoGroove} />
                  <text x={doorL + 6} y={top + 20} className="svg-note">{`${feetAndInches(section.doorWidth)} ${section.doorPlacement}`}</text>
                </>
              )}

              <text x={left + 8} y={bottom + 20} className="svg-note">{`${section.label} · ${feetAndInches(section.width)} × ${feetAndInches(section.height)}`}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend-row">
        <span><i className="legend-swatch receiver-line-swatch" />{renaissance ? '1x2 7/8' : 'Receiver'}</span>
        {!renaissance && <span><i className="legend-swatch one-by-two-line-swatch" />1x2</span>}
        <span><i className="legend-swatch two-by-two-no-groove-line-swatch" />{renaissance ? '2x2 7/8 no groove' : '2x2 / door frame'}</span>
        <span><i className="legend-swatch two-by-two-line-swatch" />{renaissance ? '2x2 7/8 groove' : '2x2'}</span>
        <span><i className="legend-swatch picket-line-swatch" />Pickets</span>
        {!renaissance && <span><i className="legend-swatch vgroove-line-swatch" />V-groove</span>}
      </div>
    </div>
  );
}

export function LayoutPreview({ serviceSlug, values }: LayoutPreviewProps) {
  if (serviceSlug === 'decks') return <DeckPreview values={values} />;
  if (serviceSlug === 'patio-covers') return <PatioPreview values={values} />;
  return <ScreenPreview values={values} renaissance={serviceSlug === 'renaissance-screen-rooms'} />;
}
