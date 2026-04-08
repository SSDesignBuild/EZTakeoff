import { buildDeckModel } from '../lib/deckModel';
import { parseSections } from '../lib/sectioning';

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
    const toSvg = (x: number, y: number) => ({ x: x0 + (x - deck.minX) * scale, y: y0 + (y - deck.minY) * scale });
    const pointString = deck.points.map((point) => { const svgPoint = toSvg(point.x, point.y); return `${svgPoint.x},${svgPoint.y}`; }).join(' ');
    const joistLines = deck.joistDirection === 'vertical'
      ? Array.from({ length: Math.max(0, Math.floor(deck.width)) }, (_, index) => deck.minX + 0.5 + index)
      : Array.from({ length: Math.max(0, Math.floor(deck.depth)) }, (_, index) => deck.minY + 0.5 + index);

    return (
      <div className="visual-card">
        <div className="visual-header"><h3>Layout preview</h3><span>Footprint, beam edits, posts, joists, railing, and stair location</span></div>
        <svg viewBox={`0 0 ${deck.width * scale + 84} ${deck.depth * scale + 96}`} className="layout-svg">
          <polygon points={pointString} className="deck-polygon" />
          {!deck.isFreestanding && <><line x1={x0} y1={y0 - 16} x2={x0 + deck.width * scale} y2={y0 - 16} className="house-line" /><text x={x0} y={y0 - 22} className="svg-note">House / ledger side</text></>}
          {joistLines.map((lineValue) => deck.joistDirection === 'vertical'
            ? <line key={lineValue} x1={x0 + (lineValue - deck.minX) * scale} y1={y0 + 6} x2={x0 + (lineValue - deck.minX) * scale} y2={y0 + deck.depth * scale - 6} className="joist-line" />
            : <line key={lineValue} x1={x0 + 6} y1={y0 + (lineValue - deck.minY) * scale} x2={x0 + deck.width * scale - 6} y2={y0 + (lineValue - deck.minY) * scale} className="joist-line" />)}
          {deck.beamLines.map((beam, index) => (
            <g key={`${beam.y}-${index}`}>
              {beam.segments.map((segment) => <line key={`${segment.startX}-${segment.endX}`} x1={toSvg(segment.startX, beam.y).x} y1={toSvg(segment.startX, beam.y).y} x2={toSvg(segment.endX, beam.y).x} y2={toSvg(segment.endX, beam.y).y} className="beam-line" />)}
              {beam.postXs.map((postX) => <rect key={`${postX}-${beam.y}`} x={toSvg(postX, beam.y).x - 4} y={toSvg(postX, beam.y).y - 4} width="8" height="8" className={beam.lockedPostXs.includes(postX) ? 'post-node locked-post' : 'post-node'} rx="2" />)}
            </g>
          ))}
          {deck.exposedSegments.map((segment) => <line key={`railing-${segment.index}`} x1={toSvg(segment.start.x, segment.start.y).x} y1={toSvg(segment.start.x, segment.start.y).y} x2={toSvg(segment.end.x, segment.end.y).x} y2={toSvg(segment.end.x, segment.end.y).y} className="railing-line" />)}
          {deck.stairPlacement.start && deck.stairPlacement.end && <><line x1={toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y).x} y1={toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y).y} x2={toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y).x} y2={toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y).y} className="stair-edge-highlight" /><text x={(toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y).x + toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y).x) / 2} y={(toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y).y + toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y).y) / 2 - 10} className="svg-note">Stairs</text></>}
          <text x={x0} y={y0 + deck.depth * scale + 24} className="svg-note">{`Joists ${deck.joistSize} @ 12 in O.C. · ${deck.beamLines.length} beam line${deck.beamLines.length === 1 ? '' : 's'} · ${deck.postCount} posts`}</text>
        </svg>
      </div>
    );
  }

  if (serviceSlug === 'patio-covers') {
    const width = Number(values.width ?? 21);
    const projection = Number(values.projection ?? 8);
    const panelWidth = Number(values.panelWidth ?? 4);
    const panelCount = Math.ceil(width / panelWidth);
    const structureType = String(values.structureType ?? 'attached');
    const fanBeam = String(values.fanBeam ?? 'none');
    const beamStyle = String(values.beamStyle ?? 'atlas');
    const panelThickness = Number(values.panelThickness ?? 3);
    const metalGauge = String(values.metalGauge ?? '.26');
    const foamDensity = Number(values.foamDensity ?? 1);
    const standard3In = panelThickness === 3 && metalGauge !== '.32' && foamDensity < 2;
    const supportBeamCount = standard3In && projection > 13 ? Math.ceil(projection / 13) - 1 : 0;
    const scale = 20;
    const x0 = 40;
    const y0 = 60;
    const roofW = width * scale;
    const roofD = projection * scale;
    return (
      <div className="visual-card">
        <div className="visual-header"><h3>Layout preview</h3><span>Top view with panel bays, front beam, support beam checks, and trim zones</span></div>
        <svg viewBox={`0 0 ${roofW + 80} ${roofD + 120}`} className="layout-svg">
          <rect x={x0} y={y0} width={roofW} height={roofD} className="roof-box" rx="10" />
          {Array.from({ length: panelCount - 1 }, (_, index) => {
            const x = x0 + ((index + 1) * roofW) / panelCount;
            return <line key={index} x1={x} y1={y0} x2={x} y2={y0 + roofD} className="roof-bay" />;
          })}
          {Array.from({ length: supportBeamCount }, (_, index) => {
            const y = y0 + (((index + 1) * roofD) / (supportBeamCount + 1));
            return <line key={`support-${index}`} x1={x0} y1={y} x2={x0 + roofW} y2={y} className="beam-line" />;
          })}
          {fanBeam !== 'none' && <line x1={fanBeam === 'centered' ? x0 + roofW / 2 : fanBeam === 'female-offset' ? x0 + 20 : x0 + roofW - 20} y1={y0} x2={fanBeam === 'centered' ? x0 + roofW / 2 : fanBeam === 'female-offset' ? x0 + 20 : x0 + roofW - 20} y2={y0 + roofD} className="stair-edge-highlight" />}
          {structureType === 'attached' && <text x={x0} y={y0 - 12} className="svg-note">House / C-channel side</text>}
          {structureType !== 'attached' && <text x={x0} y={y0 - 12} className="svg-note">Freestanding back side</text>}
          <text x={x0 + roofW / 2 - 32} y={y0 + roofD + 38} className="svg-note">Front gutter + beam</text>
          <text x={x0 - 12} y={y0 + roofD / 2} className="svg-note">Fascia</text>
          <text x={x0 + roofW + 8} y={y0 + roofD / 2} className="svg-note">Fascia</text>
          <text x={x0} y={y0 + roofD + 56} className="svg-note">{`${beamStyle === '3x3' ? '3x3 beam' : 'Atlas beam'} · ${panelCount} panel bay${panelCount === 1 ? '' : 's'}${supportBeamCount ? ` · ${supportBeamCount} mid support` : ''}`}</text>
        </svg>
      </div>
    );
  }

  const sections = parseSections(values.sections, 3);
  const scale = 28;
  const x0 = 30;
  const y0 = 30;
  const totalW = sections.reduce((sum, section) => sum + section.width * scale, 0);
  const totalH = Math.max(...sections.map((section) => section.height * scale), 160);
  let runningX = x0;

  return (
    <div className="visual-card">
      <div className="visual-header"><h3>Layout preview</h3><span>Section-by-section wall layout</span></div>
      <svg viewBox={`0 0 ${totalW + 70} ${totalH + 90}`} className="layout-svg">
        {sections.map((section) => {
          const sectionW = section.width * scale;
          const sectionH = section.height * scale;
          const currentX = runningX;
          runningX += sectionW;
          return (
            <g key={section.id}>
              <rect x={currentX} y={y0} width={sectionW} height={sectionH} className="screen-box" rx="8" />
              {section.chairRail && <line x1={currentX} y1={y0 + sectionH * 0.55} x2={currentX + sectionW} y2={y0 + sectionH * 0.55} className="screen-chair-rail" />}
              {Array.from({ length: section.uprights }, (_, index) => {
                const x = currentX + ((index + 1) * sectionW) / (section.uprights + 1);
                return <line key={index} x1={x} y1={y0} x2={x} y2={y0 + sectionH} className="screen-divider" />;
              })}
              {section.kickPanel !== 'none' && <rect x={currentX} y={y0 + sectionH - 34} width={sectionW} height="34" className="kick-panel-box" rx="4" />}
              {section.doorType !== 'none' && <rect x={currentX + sectionW * 0.35} y={y0 + 26} width={sectionW * 0.3} height={sectionH - 26} className="door-box" rx="4" />}
              <text x={currentX + 8} y={y0 + sectionH + 18} className="svg-note">{section.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
