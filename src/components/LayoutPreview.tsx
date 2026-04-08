import { useMemo, useState } from 'react';
import { buildDeckModel } from '../lib/deckModel';
import { buildPatioPanelLayout } from '../lib/patioLayout';
import { parseSections } from '../lib/sectioning';
import { DeckEdgeSegment, DeckPoint, SectionConfig } from '../lib/types';

interface LayoutPreviewProps {
  serviceSlug: string;
  values: Record<string, string | number | boolean>;
}

type DeckLayer = 'overview' | 'boards' | 'framing' | 'railing' | 'stairs';

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
  const [layer, setLayer] = useState<DeckLayer>('overview');
  const scale = Math.min(560 / Math.max(deck.width, 1), 380 / Math.max(deck.depth, 1));
  const pad = 70;
  const toSvg = (x: number, y: number) => ({ x: pad + (x - deck.minX) * scale, y: pad + (y - deck.minY) * scale });
  const pointString = deck.points.map((point) => {
    const svgPoint = toSvg(point.x, point.y);
    return `${svgPoint.x},${svgPoint.y}`;
  }).join(' ');

  const showBoards = layer === 'overview' || layer === 'boards';
  const showFraming = layer === 'overview' || layer === 'framing';
  const showRailing = layer === 'overview' || layer === 'railing';
  const showStairs = layer === 'overview' || layer === 'stairs';

  const boardScanlines = deck.boardRun === 'width'
    ? Array.from({ length: Math.max(1, Math.floor(deck.depth / 0.47)) }, (_, index) => deck.minY + 0.22 + index * 0.47)
    : Array.from({ length: Math.max(1, Math.floor(deck.width / 0.47)) }, (_, index) => deck.minX + 0.22 + index * 0.47);
  const joistScanlines = deck.joistDirection === 'vertical'
    ? Array.from({ length: Math.max(1, Math.floor(deck.width / 1) + 1) }, (_, index) => deck.minX + index)
    : Array.from({ length: Math.max(1, Math.floor(deck.depth / 1) + 1) }, (_, index) => deck.minY + index);

  const stairStart = deck.stairPlacement.start ? toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y) : null;
  const stairEnd = deck.stairPlacement.end ? toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y) : null;
  const stairDx = stairStart && stairEnd ? stairEnd.x - stairStart.x : 0;
  const stairDy = stairStart && stairEnd ? stairEnd.y - stairStart.y : 0;
  const stairLen = Math.hypot(stairDx, stairDy) || 1;
  const stairNx = -stairDy / stairLen;
  const stairNy = stairDx / stairLen;

  return (
    <div className="visual-card">
      <div className="visual-header">
        <div>
          <h3>Layout preview</h3>
          <span>Print-oriented plan with clickable layers for board-by-board decking, framing, railing, and stair layout.</span>
        </div>
        <div className="preview-toolbar">
          {(['overview', 'boards', 'framing', 'railing', 'stairs'] as DeckLayer[]).map((item) => (
            <button key={item} type="button" className={layer === item ? 'ghost-btn small-btn active-chip' : 'ghost-btn small-btn'} onClick={() => setLayer(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${deck.width * scale + pad * 2} ${deck.depth * scale + pad * 2 + 90}`} className="layout-svg">
        <polygon points={pointString} className="deck-polygon muted-fill" />

        {showBoards && boardScanlines.map((value) => (
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

        {showFraming && joistScanlines.map((value) => (
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

        {showFraming && deck.edgeSegments.map((segment) => {
          const outer = offsetSegment(segment, 0.03);
          const inner = offsetSegment(segment, -0.18);
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

        {showFraming && deck.beamLines.map((beam, index) => (
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

        {showRailing && deck.exposedSegments.map((segment) => {
          const rail = offsetSegment(segment, 0.28);
          const a = toSvg(rail.start.x, rail.start.y);
          const b = toSvg(rail.end.x, rail.end.y);
          return <line key={`railing-${segment.index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="railing-line" />;
        })}
        {showRailing && deck.exposedSegments.flatMap((segment) => {
          const postCount = Math.max(2, Math.ceil(segment.length / 6) + 1);
          return Array.from({ length: postCount }, (_, index) => {
            const ratio = postCount === 1 ? 0 : index / (postCount - 1);
            const x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
            const y = segment.start.y + (segment.end.y - segment.start.y) * ratio;
            const shifted = offsetSegment({ ...segment, start: { x, y }, end: { x, y } }, 0.34).start;
            const p = toSvg(shifted.x, shifted.y);
            return <circle key={`railpost-${segment.index}-${index}`} cx={p.x} cy={p.y} r="4" className="railing-post-node" />;
          });
        })}

        {showStairs && stairStart && stairEnd && (
          <>
            <line x1={stairStart.x} y1={stairStart.y} x2={stairEnd.x} y2={stairEnd.y} className="stair-edge-highlight" />
            {Array.from({ length: Math.max(deck.stairStringers, 0) }, (_, index) => {
              const ratio = deck.stairStringers <= 1 ? 0.5 : index / (deck.stairStringers - 1);
              const sx = stairStart.x + stairDx * ratio;
              const sy = stairStart.y + stairDy * ratio;
              const ex = sx + stairNx * (deck.stairRunFt * scale);
              const ey = sy + stairNy * (deck.stairRunFt * scale);
              return <line key={`stringer-${index}`} x1={sx} y1={sy} x2={ex} y2={ey} className="stringer-line" />;
            })}
            {Array.from({ length: Math.max(deck.stairTreadsPerRun, 0) }, (_, index) => {
              const offset = ((index + 1) * deck.stairRunFt * scale) / Math.max(deck.stairTreadsPerRun + 1, 1);
              return <line key={`tread-${index}`} x1={stairStart.x + stairNx * offset} y1={stairStart.y + stairNy * offset} x2={stairEnd.x + stairNx * offset} y2={stairEnd.y + stairNy * offset} className="tread-line" />;
            })}
            <text x={Math.min(stairStart.x, stairEnd.x) + 6} y={Math.min(stairStart.y, stairEnd.y) - 10} className="svg-note">{`${deck.stairRisers} risers · ${deck.stairTreadsPerRun} treads · ${deck.stairStringers} stringers`}</text>
          </>
        )}

        <line x1={pad} y1={pad + deck.depth * scale + 28} x2={pad + deck.width * scale} y2={pad + deck.depth * scale + 28} className="dimension-line" />
        <text x={pad + (deck.width * scale) / 2 - 16} y={pad + deck.depth * scale + 22} className="svg-note">{feetAndInches(deck.width)}</text>
        <line x1={pad - 24} y1={pad} x2={pad - 24} y2={pad + deck.depth * scale} className="dimension-line" />
        <text x={pad - 58} y={pad + (deck.depth * scale) / 2} className="svg-note">{feetAndInches(deck.depth)}</text>
      </svg>
      <div className="legend-row">
        <span><i className="legend-swatch deck-board-swatch" /> deck boards</span>
        <span><i className="legend-swatch joist-line-swatch" /> joists</span>
        <span><i className="legend-swatch beam-line-swatch" /> doubled beam</span>
        <span><i className="legend-swatch band-line-swatch" /> double band</span>
        <span><i className="legend-swatch railing-line-swatch" /> railing</span>
        <span><i className="legend-swatch stair-line-swatch" /> stairs</span>
      </div>
    </div>
  );
}

function sectionGeometry(section: SectionConfig, renaissance: boolean) {
  const doorWidth = section.doorType === 'none' ? 0 : Math.min(section.doorWidth, section.width);
  const doorLeft = sectionDoorLeft(section) / 12;
  const doorRight = doorLeft + doorWidth;
  const usableWidth = Math.max(0, section.width - doorWidth);
  const kickHeight = section.kickPanel === 'none' ? 0 : Math.min(section.kickPanelHeight, section.kickPanel === 'trim-coil' ? 2 : 4);
  const chairY = section.chairRail ? Math.max(kickHeight + 3, section.height * 0.55) : 0;
  const uprightXs = Array.from({ length: section.uprights }, (_, index) => ((index + 1) * section.width) / (section.uprights + 1))
    .filter((x) => x < doorLeft || x > doorRight);

  const picketHeight = chairY > 0 ? chairY - kickHeight : 0;
  const picketCount = section.pickets && picketHeight > 0 ? Math.max(0, Math.floor((usableWidth * 12 + 4) / 4)) : 0;
  const picketSpacing = picketCount > 1 ? usableWidth / picketCount : 0;

  return { doorWidth, doorLeft, doorRight, kickHeight, chairY, uprightXs, picketCount, picketSpacing, usableWidth, renaissance };
}

function drawVerticalLane(x: number, top: number, bottom: number, cls: string, key: string) {
  return <line key={key} x1={x} y1={top} x2={x} y2={bottom} className={cls} />;
}

function ScreenPreview({ values, renaissance }: { values: Record<string, string | number | boolean>; renaissance: boolean }) {
  const sections = parseSections(values.sections, 3);
  const scale = 32;
  const x0 = 42;
  const y0 = 40;
  const totalW = sections.reduce((sum, section) => sum + section.width * scale, 0) + (sections.length - 1) * 18;
  const totalH = Math.max(...sections.map((section) => section.height * scale), 220);
  let runningX = x0;

  return (
    <div className="visual-card">
      <div className="visual-header">
        <h3>Layout preview</h3>
        <span>Separated material lanes for installer printing. Door framing, pickets, kick panels, receivers, and 1x/2x members are drawn as distinct lines instead of stacked paths.</span>
      </div>
      <svg viewBox={`0 0 ${totalW + 120} ${totalH + 120}`} className="layout-svg">
        {sections.map((section, sectionIndex) => {
          const geom = sectionGeometry(section, renaissance);
          const sectionW = section.width * scale;
          const sectionH = section.height * scale;
          const currentX = runningX;
          runningX += sectionW + 18;
          const left = currentX;
          const right = currentX + sectionW;
          const top = y0;
          const bottom = y0 + sectionH;
          const kickY = bottom - geom.kickHeight * scale;
          const chairY = geom.chairY > 0 ? bottom - geom.chairY * scale : 0;
          const doorLeft = left + geom.doorLeft * scale;
          const doorRight = left + geom.doorRight * scale;
          const doorTop = top + Math.max(sectionH * 0.16, 16);
          const doorBottom = bottom;
          const receiverInset = 0;
          const oneByTwoInset = renaissance ? 8 : 16;
          const twoByTwoInset = renaissance ? 24 : 30;
          return (
            <g key={section.id}>
              <rect x={left} y={top} width={sectionW} height={sectionH} className="screen-box" rx="8" />
              <text x={left} y={top - 10} className="svg-note">{`${section.label} · ${feetAndInches(section.width)} x ${feetAndInches(section.height)}`}</text>

              {!renaissance && (
                <>
                  {drawVerticalLane(left + receiverInset, top, bottom, 'receiver-line', `rx-left-${section.id}`)}
                  {drawVerticalLane(right - receiverInset, top, bottom, 'receiver-line', `rx-right-${section.id}`)}
                  <line x1={left} y1={top} x2={right} y2={top} className="receiver-line" />
                  <line x1={left} y1={bottom} x2={right} y2={bottom} className="receiver-line" />
                  <line x1={left + oneByTwoInset} y1={top + 6} x2={right - oneByTwoInset} y2={top + 6} className={section.kickPanel === 'trim-coil' ? 'vgroove1-line' : 'onebytwo-line'} />
                </>
              )}

              {renaissance && (
                <>
                  {drawVerticalLane(left + 8, top, bottom, 'reno-1x2-line', `r-left-${section.id}`)}
                  {drawVerticalLane(right - 8, top, bottom, 'reno-1x2-line', `r-right-${section.id}`)}
                  <line x1={left + 8} y1={top + 6} x2={right - 8} y2={top + 6} className="reno-1x2-line" />
                  <line x1={left + 8} y1={bottom - 6} x2={right - 8} y2={bottom - 6} className="reno-1x2-line" />
                </>
              )}

              {section.kickPanel !== 'none' && (
                <>
                  <rect x={left + 10} y={kickY} width={sectionW - 20} height={bottom - kickY} className="kick-panel-fill" rx="4" />
                  <line x1={left + oneByTwoInset} y1={kickY} x2={right - oneByTwoInset} y2={kickY} className={renaissance ? 'reno-2x2-groove-line' : section.kickPanel === 'trim-coil' ? 'vgroove2-line' : 'twobytwo-line'} />
                  {!renaissance && section.kickPanel === 'trim-coil' && (
                    <line x1={left + oneByTwoInset} y1={bottom - 8} x2={right - oneByTwoInset} y2={bottom - 8} className="vgroove1-line" />
                  )}
                  {!renaissance && section.kickPanel === 'insulated' && (
                    <line x1={left + 6} y1={kickY + 8} x2={right - 6} y2={kickY + 8} className="receiver-line" />
                  )}
                </>
              )}

              {section.chairRail && chairY > 0 && (
                <line x1={left + twoByTwoInset} y1={chairY} x2={right - twoByTwoInset} y2={chairY} className={renaissance ? (section.pickets || section.kickPanel === 'insulated' ? 'reno-2x2-groove-line' : 'reno-2x2-line') : 'twobytwo-line'} />
              )}

              {geom.uprightXs.map((x, index) => {
                const xPos = left + x * scale;
                const cls = renaissance
                  ? (section.pickets || section.kickPanel === 'insulated' ? 'reno-2x2-groove-line' : 'reno-2x2-line')
                  : 'twobytwo-line';
                const topY = top + 10;
                const bottomY = section.kickPanel !== 'none' ? kickY : bottom - 10;
                return drawVerticalLane(xPos, topY, bottomY, cls, `upright-${section.id}-${index}`);
              })}

              {section.pickets && geom.picketCount > 0 && Array.from({ length: geom.picketCount }, (_, index) => {
                const x = left + ((index + 0.5) * geom.picketSpacing * scale);
                return <line key={`p-${section.id}-${index}`} x1={x} y1={chairY - 6} x2={x} y2={kickY + 6} className="picket-line" />;
              })}

              {section.doorType !== 'none' && (
                <>
                  <rect x={doorLeft} y={doorTop} width={(geom.doorRight - geom.doorLeft) * scale} height={doorBottom - doorTop} className="door-panel" rx="6" />
                  <line x1={doorLeft} y1={doorTop} x2={doorLeft} y2={doorBottom} className={renaissance ? 'reno-2x2-line' : 'twobytwo-line'} />
                  <line x1={doorRight} y1={doorTop} x2={doorRight} y2={doorBottom} className={renaissance ? 'reno-2x2-line' : 'twobytwo-line'} />
                  <line x1={doorLeft} y1={doorTop} x2={doorRight} y2={doorTop} className={renaissance ? 'reno-2x2-line' : 'twobytwo-line'} />
                  {section.doorType === 'french' && <line x1={(doorLeft + doorRight) / 2} y1={doorTop + 6} x2={(doorLeft + doorRight) / 2} y2={doorBottom - 6} className="door-split-line" />}
                  <text x={doorLeft + 6} y={doorTop + 16} className="svg-note">{`${feetAndInches(section.doorWidth)} ${section.dogDoor !== 'none' ? `· ${section.dogDoor} dog door` : ''}`}</text>
                </>
              )}

              <line x1={left} y1={bottom + 26} x2={right} y2={bottom + 26} className="dimension-line" />
              <text x={left + sectionW / 2 - 16} y={bottom + 20} className="svg-note">{feetAndInches(section.width)}</text>
              {sectionIndex === 0 && <text x={left - 28} y={top + sectionH / 2} className="svg-note">{feetAndInches(section.height)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legend-row wrap-legend">
        {renaissance ? (
          <>
            <span><i className="legend-swatch reno-1x2-swatch" /> 1x2 7/8</span>
            <span><i className="legend-swatch reno-2x2-swatch" /> 2x2 7/8 no groove</span>
            <span><i className="legend-swatch reno-2x2-groove-swatch" /> 2x2 7/8 with groove</span>
            <span><i className="legend-swatch picket-swatch" /> pickets</span>
          </>
        ) : (
          <>
            <span><i className="legend-swatch receiver-swatch" /> receiver</span>
            <span><i className="legend-swatch onebytwo-swatch" /> 1x2</span>
            <span><i className="legend-swatch twobytwo-swatch" /> 2x2</span>
            <span><i className="legend-swatch picket-swatch" /> pickets</span>
            <span><i className="legend-swatch vgroove1-swatch" /> 1x2 v-groove</span>
            <span><i className="legend-swatch vgroove2-swatch" /> 2x2 v-groove</span>
          </>
        )}
      </div>
    </div>
  );
}

function PatioPreview({ values }: { values: Record<string, string | number | boolean> }) {
  const width = Number(values.width ?? 21);
  const projection = Number(values.projection ?? 10);
  const structureType = String(values.structureType ?? 'attached');
  const panelWidth = Number(values.panelWidth ?? 4);
  const fanBeam = String(values.fanBeam ?? 'none');
  const screenUnderneath = Boolean(values.screenUnderneath ?? false);
  const layout = useMemo(() => buildPatioPanelLayout(width, fanBeam, panelWidth), [width, fanBeam, panelWidth]);
  const supportBeamCount = (Number(values.panelThickness ?? 3) === 3 && !(String(values.metalGauge ?? '.26') === '.32' && Number(values.foamDensity ?? 1) === 2) && projection > 13)
    ? Math.ceil(projection / 13) - 1
    : 0;
  const scale = Math.min(560 / Math.max(width, 1), 340 / Math.max(projection, 1));
  const x0 = 42;
  const y0 = 42;
  const roofW = width * scale;
  const roofD = projection * scale;
  const frontPostCount = Math.max(2, Math.ceil(width / 6) + 1);

  let cursor = x0;
  return (
    <div className="visual-card">
      <div className="visual-header">
        <h3>Layout preview</h3>
        <span>Factory-style panel ordering view with fan-beam placement, cut closures, support beams, posts, and printable dimensions.</span>
      </div>
      <svg viewBox={`0 0 ${roofW + 120} ${roofD + 130}`} className="layout-svg">
        <rect x={x0} y={y0} width={roofW} height={roofD} className="roof-box" rx="8" />
        {layout.pieces.map((piece, index) => {
          const pieceW = piece.widthFt * scale;
          const x = cursor;
          cursor += pieceW;
          const cls = piece.kind === 'fan-beam' ? 'fan-beam-panel' : piece.kind === 'cut' ? 'cut-panel' : 'roof-panel';
          const note = piece.kind === 'fan-beam' ? 'fan beam' : piece.kind === 'cut' ? `${piece.widthFt} ft cut` : `${piece.panelWidth} ft panel`;
          return (
            <g key={`panel-${index}`}>
              <rect x={x} y={y0} width={pieceW} height={roofD} className={cls} />
              <line x1={x} y1={y0} x2={x} y2={y0 + roofD} className="roof-bay" />
              <text x={x + 6} y={y0 + 16} className="svg-note">{note}</text>
            </g>
          );
        })}
        <line x1={x0 + roofW} y1={y0} x2={x0 + roofW} y2={y0 + roofD} className="roof-bay" />
        <line x1={x0} y1={y0 + roofD} x2={x0 + roofW} y2={y0 + roofD} className="beam-line" />
        {Array.from({ length: supportBeamCount }, (_, index) => {
          const y = y0 + (((index + 1) * roofD) / (supportBeamCount + 1));
          return <line key={`support-${index}`} x1={x0} y1={y} x2={x0 + roofW} y2={y} className="beam-line support" />;
        })}
        {Array.from({ length: frontPostCount }, (_, index) => {
          const x = x0 + (roofW * index) / Math.max(frontPostCount - 1, 1);
          return <rect key={`post-${index}`} x={x - 5} y={y0 + roofD - 5} width="10" height="10" className="post-node" rx="2" />;
        })}
        <line x1={x0} y1={y0 + roofD + 28} x2={x0 + roofW} y2={y0 + roofD + 28} className="dimension-line" />
        <text x={x0 + roofW / 2 - 16} y={y0 + roofD + 22} className="svg-note">{feetAndInches(width)}</text>
        <line x1={x0 - 24} y1={y0} x2={x0 - 24} y2={y0 + roofD} className="dimension-line" />
        <text x={x0 - 58} y={y0 + roofD / 2} className="svg-note">{feetAndInches(projection)}</text>
        <text x={x0} y={y0 - 14} className="svg-note">{structureType === 'attached' ? 'House / C-channel side' : 'Freestanding back side'}</text>
        <text x={x0} y={y0 + roofD + 54} className="svg-note">{`${screenUnderneath ? '3x3 screened-under beam' : 'Atlas beam'} · ${frontPostCount} posts · ${supportBeamCount} intermediate beam(s)`}</text>
      </svg>
      <div className="legend-row wrap-legend">
        <span><i className="legend-swatch roof-panel-swatch" /> regular panel</span>
        <span><i className="legend-swatch fan-panel-swatch" /> fan-beam panel</span>
        <span><i className="legend-swatch cut-panel-swatch" /> cut closure panel</span>
      </div>
    </div>
  );
}

export function LayoutPreview({ serviceSlug, values }: LayoutPreviewProps) {
  if (serviceSlug === 'decks') return <DeckPreview values={values} />;
  if (serviceSlug === 'patio-covers') return <PatioPreview values={values} />;
  if (serviceSlug === 'screen-rooms') return <ScreenPreview values={values} renaissance={false} />;
  return <ScreenPreview values={values} renaissance />;
}
