import { buildDeckModel } from '../lib/deckModel';
import { parseSections } from '../lib/sectioning';
import { SectionConfig } from '../lib/types';

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

function sectionDoorLeft(section: SectionConfig) {
  const sectionWidthIn = section.width * 12;
  const doorWidthIn = Math.min(section.doorWidth * 12, sectionWidthIn);
  if (section.doorType === 'none') return 0;
  if (section.doorPlacement === 'left') return 0;
  if (section.doorPlacement === 'right') return Math.max(0, sectionWidthIn - doorWidthIn);
  if (section.doorPlacement === 'custom') return Math.max(0, Math.min(section.doorOffsetInches, sectionWidthIn - doorWidthIn));
  return Math.max(0, (sectionWidthIn - doorWidthIn) / 2);
}

export function LayoutPreview({ serviceSlug, values }: LayoutPreviewProps) {
  if (serviceSlug === 'decks') {
    const deck = buildDeckModel(values);
    const scale = Math.min(360 / Math.max(deck.width, 1), 260 / Math.max(deck.depth, 1));
    const x0 = 50;
    const y0 = 56;
    const toSvg = (x: number, y: number) => ({ x: x0 + (x - deck.minX) * scale, y: y0 + (y - deck.minY) * scale });
    const pointString = deck.points.map((point) => { const svgPoint = toSvg(point.x, point.y); return `${svgPoint.x},${svgPoint.y}`; }).join(' ');
    const joistLines = deck.joistDirection === 'vertical'
      ? Array.from({ length: Math.max(0, Math.floor(deck.width)) }, (_, index) => deck.minX + 0.5 + index)
      : Array.from({ length: Math.max(0, Math.floor(deck.depth)) }, (_, index) => deck.minY + 0.5 + index);

    return (
      <div className="visual-card">
        <div className="visual-header"><h3>Layout preview</h3><span>Detailed framing map with doubled band, beam plies, stair stringers, railing posts, and printable dimensions</span></div>
        <svg viewBox={`0 0 ${deck.width * scale + 140} ${deck.depth * scale + 150}`} className="layout-svg">
          <polygon points={pointString} className="deck-polygon" />
          {!deck.isFreestanding && <><line x1={x0} y1={y0 - 18} x2={x0 + deck.width * scale} y2={y0 - 18} className="house-line" /><text x={x0} y={y0 - 24} className="svg-note">House / ledger side</text></>}
          <line x1={x0} y1={y0 + deck.depth * scale + 24} x2={x0 + deck.width * scale} y2={y0 + deck.depth * scale + 24} className="dimension-line" />
          <text x={x0 + deck.width * scale / 2 - 20} y={y0 + deck.depth * scale + 20} className="svg-note">{feetAndInches(deck.width)}</text>
          <line x1={x0 - 24} y1={y0} x2={x0 - 24} y2={y0 + deck.depth * scale} className="dimension-line" />
          <text x={x0 - 42} y={y0 + deck.depth * scale / 2} className="svg-note">{feetAndInches(deck.depth)}</text>
          {deck.edgeSegments.map((segment) => (
            <line key={`band-${segment.index}`} x1={toSvg(segment.start.x, segment.start.y).x} y1={toSvg(segment.start.x, segment.start.y).y} x2={toSvg(segment.end.x, segment.end.y).x} y2={toSvg(segment.end.x, segment.end.y).y} className="band-line" />
          ))}
          {deck.edgeSegments.map((segment) => (
            <line key={`band2-${segment.index}`} x1={toSvg(segment.start.x, segment.start.y).x + 2} y1={toSvg(segment.start.x, segment.start.y).y + 2} x2={toSvg(segment.end.x, segment.end.y).x + 2} y2={toSvg(segment.end.x, segment.end.y).y + 2} className="band-line secondary" />
          ))}
          {joistLines.map((lineValue) => deck.joistDirection === 'vertical'
            ? <line key={lineValue} x1={x0 + (lineValue - deck.minX) * scale} y1={y0 + 6} x2={x0 + (lineValue - deck.minX) * scale} y2={y0 + deck.depth * scale - 6} className="joist-line" />
            : <line key={lineValue} x1={x0 + 6} y1={y0 + (lineValue - deck.minY) * scale} x2={x0 + deck.width * scale - 6} y2={y0 + (lineValue - deck.minY) * scale} className="joist-line" />)}
          {deck.beamLines.map((beam, index) => (
            <g key={`${beam.y}-${index}`}>
              {beam.segments.map((segment, segIndex) => {
                const y = toSvg(segment.startX, beam.y).y;
                const x1 = toSvg(segment.startX, beam.y).x;
                const x2 = toSvg(segment.endX, beam.y).x;
                return <g key={`${segment.startX}-${segment.endX}-${segIndex}`}>
                  <line x1={x1} y1={y - 3} x2={x2} y2={y - 3} className="beam-line" />
                  <line x1={x1} y1={y + 3} x2={x2} y2={y + 3} className="beam-line" />
                </g>;
              })}
              {beam.postXs.map((postX) => <rect key={`${postX}-${beam.y}`} x={toSvg(postX, beam.y).x - 5} y={toSvg(postX, beam.y).y - 5} width="10" height="10" className={beam.lockedPostXs.includes(postX) ? 'post-node locked-post' : 'post-node'} rx="2" />)}
            </g>
          ))}
          {deck.exposedSegments.map((segment) => <line key={`railing-${segment.index}`} x1={toSvg(segment.start.x, segment.start.y).x} y1={toSvg(segment.start.x, segment.start.y).y} x2={toSvg(segment.end.x, segment.end.y).x} y2={toSvg(segment.end.x, segment.end.y).y} className="railing-line" />)}
          {deck.exposedSegments.flatMap((segment) => {
            const count = Math.max(2, Math.ceil(segment.length / 6) + 1);
            return Array.from({ length: count }, (_, index) => {
              const ratio = count === 1 ? 0 : index / (count - 1);
              const x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
              const y = segment.start.y + (segment.end.y - segment.start.y) * ratio;
              const p = toSvg(x, y);
              return <circle key={`rp-${segment.index}-${index}`} cx={p.x} cy={p.y} r="4" className="railing-post-node" />;
            });
          })}
          {deck.stairPlacement.start && deck.stairPlacement.end && <>
            <line x1={toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y).x} y1={toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y).y} x2={toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y).x} y2={toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y).y} className="stair-edge-highlight" />
            {Array.from({ length: Math.max(deck.stairRisers, 0) }, (_, index) => {
              const ratio = (index + 1) / Math.max(deck.stairRisers, 1);
              const x1 = toSvg(deck.stairPlacement.start!.x, deck.stairPlacement.start!.y).x;
              const x2 = toSvg(deck.stairPlacement.end!.x, deck.stairPlacement.end!.y).x;
              const y = toSvg(deck.stairPlacement.start!.x, deck.stairPlacement.start!.y).y + ratio * 34;
              return <line key={`tread-${index}`} x1={x1} y1={y} x2={x2} y2={y} className="stair-tread-line" />;
            })}
            {Array.from({ length: Math.max(deck.stairStringers / Math.max(deck.stairCount, 1), 0) }, (_, index) => {
              const stringerCount = Math.max(deck.stairStringers / Math.max(deck.stairCount, 1), 1);
              const ratio = stringerCount === 1 ? 0 : index / (stringerCount - 1);
              const start = toSvg(deck.stairPlacement.start!.x, deck.stairPlacement.start!.y);
              const end = toSvg(deck.stairPlacement.end!.x, deck.stairPlacement.end!.y);
              const x = start.x + (end.x - start.x) * ratio;
              return <line key={`stringer-${index}`} x1={x} y1={start.y} x2={x} y2={start.y + 38} className="stringer-line" />;
            })}
            <text x={(toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y).x + toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y).x) / 2 - 30} y={(toSvg(deck.stairPlacement.start.x, deck.stairPlacement.start.y).y + toSvg(deck.stairPlacement.end.x, deck.stairPlacement.end.y).y) / 2 - 10} className="svg-note">{`${deck.stairRisers} risers / ${deck.stairTreadsPerRun} treads`}</text>
          </>}
          <text x={x0} y={y0 + deck.depth * scale + 48} className="svg-note">{`Joists ${deck.joistSize} @ 12 in O.C. · ${deck.beamLines.length} beam line${deck.beamLines.length === 1 ? '' : 's'} · ${deck.postCount} posts · ${deck.railingSections6}x6' + ${deck.railingSections8}x8' railing`}</text>
        </svg>
      </div>
    );
  }

  if (serviceSlug === 'patio-covers') {
    const width = Number(values.width ?? 21);
    const projection = Number(values.projection ?? 8);
    const panelWidth = Number(values.panelWidth ?? 4);
    const structureType = String(values.structureType ?? 'attached');
    const fanBeam = String(values.fanBeam ?? 'none');
    const screenUnderneath = Boolean(values.screenUnderneath ?? false);
    const scale = 20;
    const x0 = 40;
    const y0 = 60;
    const roofW = width * scale;
    const roofD = projection * scale;
    const useCenteredMix = fanBeam === 'centered' && Math.round(width) % 4 === 0;
    const panelWidths = useCenteredMix ? [2, ...Array.from({ length: Math.max(0, Math.floor((width - 8) / 4)) }, () => 4), 4, 2] : Array.from({ length: Math.ceil(width / panelWidth) }, () => panelWidth);
    let runningX = x0;
    const frontPostCount = Math.max(2, Math.ceil(width / 6) + 1);
    const supportBeamCount = Number(values.panelThickness ?? 3) === 3 && String(values.metalGauge ?? '.26') !== '.32' && Number(values.foamDensity ?? 1) < 2 && projection > 13 ? Math.ceil(projection / 13) - 1 : 0;
    return (
      <div className="visual-card">
        <div className="visual-header"><h3>Layout preview</h3><span>Panel bays, post/beam layout, trim zones, and fan-beam-aware panel structure</span></div>
        <svg viewBox={`0 0 ${roofW + 80} ${roofD + 140}`} className="layout-svg">
          <rect x={x0} y={y0} width={roofW} height={roofD} className="roof-box" rx="10" />
          {panelWidths.map((panel, index) => {
            const w = panel * scale;
            const currentX = runningX;
            runningX += w;
            return <g key={`panel-${index}`}>
              <rect x={currentX} y={y0} width={w} height={roofD} className={fanBeam !== 'none' && ((useCenteredMix && index === panelWidths.length - 2) || (!useCenteredMix && index === Math.floor(panelWidths.length / 2))) ? 'fan-panel-box' : 'roof-bay-panel'} rx="4" />
              <text x={currentX + w / 2 - 12} y={y0 + 18} className="svg-note">{panel}'</text>
            </g>;
          })}
          <line x1={x0} y1={y0 + roofD} x2={x0 + roofW} y2={y0 + roofD} className="beam-line" />
          {Array.from({ length: supportBeamCount }, (_, index) => {
            const y = y0 + (((index + 1) * roofD) / (supportBeamCount + 1));
            return <line key={`support-${index}`} x1={x0} y1={y} x2={x0 + roofW} y2={y} className="beam-line" />;
          })}
          {Array.from({ length: frontPostCount }, (_, index) => {
            const x = x0 + (roofW * index) / Math.max(frontPostCount - 1, 1);
            return <rect key={`post-${index}`} x={x - 5} y={y0 + roofD - 5} width="10" height="10" className="post-node" rx="2" />;
          })}
          {structureType === 'attached' && <text x={x0} y={y0 - 12} className="svg-note">House / C-channel side</text>}
          {structureType !== 'attached' && <text x={x0} y={y0 - 12} className="svg-note">Freestanding back side</text>}
          <text x={x0 + roofW / 2 - 40} y={y0 + roofD + 30} className="svg-note">Front gutter + beam</text>
          <text x={x0 - 12} y={y0 + roofD / 2} className="svg-note">Fascia + 5 in cap</text>
          <text x={x0 + roofW + 8} y={y0 + roofD / 2} className="svg-note">Fascia + 5 in cap</text>
          <text x={x0} y={y0 + roofD + 52} className="svg-note">{`${screenUnderneath ? '3x3 screened-under beam' : 'Atlas beam'} · ${frontPostCount} posts · slope shown in ft/in in summary`}</text>
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
  const renaissance = serviceSlug === 'renaissance-screen-rooms';

  return (
    <div className="visual-card">
      <div className="visual-header"><h3>Layout preview</h3><span>Color-coded installer view with section-specific door offsets, rails, kick panels, and framing members</span></div>
      <svg viewBox={`0 0 ${totalW + 70} ${totalH + 100}`} className="layout-svg">
        {sections.map((section) => {
          const sectionW = section.width * scale;
          const sectionH = section.height * scale;
          const currentX = runningX;
          runningX += sectionW;
          const doorLeft = sectionDoorLeft(section) / 12 * scale;
          const doorWidth = Math.min(section.doorWidth, section.width) * scale;
          const kickHeight = (section.kickPanel === 'none' ? 0 : section.kickPanelHeight) * scale;
          return (
            <g key={section.id}>
              <rect x={currentX} y={y0} width={sectionW} height={sectionH} className="screen-box" rx="8" />
              <line x1={currentX} y1={y0} x2={currentX + sectionW} y2={y0} className="receiver-line" />
              <line x1={currentX} y1={y0 + sectionH} x2={currentX + sectionW} y2={y0 + sectionH} className="receiver-line" />
              <line x1={currentX} y1={y0} x2={currentX} y2={y0 + sectionH} className="receiver-line" />
              <line x1={currentX + sectionW} y1={y0} x2={currentX + sectionW} y2={y0 + sectionH} className="receiver-line" />
              {section.kickPanel === 'trim-coil' && <><line x1={currentX} y1={y0 + sectionH - kickHeight} x2={currentX + sectionW} y2={y0 + sectionH - kickHeight} className="vgroove-top-line" /><rect x={currentX} y={y0 + sectionH - kickHeight} width={sectionW} height={kickHeight} className="kick-panel-box" rx="4" /></>}
              {section.kickPanel === 'insulated' && <><line x1={currentX} y1={y0 + sectionH - kickHeight} x2={currentX + sectionW} y2={y0 + sectionH - kickHeight} className={renaissance ? 'channel-2x2-line' : 'two-by-two-line'} /><rect x={currentX} y={y0 + sectionH - kickHeight} width={sectionW} height={kickHeight} className="insulated-panel-box" rx="4" /></>}
              {section.chairRail && <line x1={currentX} y1={y0 + sectionH * 0.55} x2={currentX + sectionW} y2={y0 + sectionH * 0.55} className={renaissance ? (section.pickets ? 'channel-2x2-line' : 'two-by-two-line') : 'two-by-two-line'} />}
              {Array.from({ length: section.uprights }, (_, index) => {
                const x = currentX + ((index + 1) * sectionW) / (section.uprights + 1);
                return <line key={index} x1={x} y1={y0} x2={x} y2={y0 + sectionH} className={renaissance ? 'two-by-two-no-groove-line' : 'two-by-two-line'} />;
              })}
              {section.pickets && Array.from({ length: Math.max(1, Math.floor((section.width * 12 - (section.doorType === 'none' ? 0 : section.doorWidth * 12)) / 8)) }, (_, index) => {
                const x = currentX + 8 + index * 8;
                return <line key={`p-${index}`} x1={x} y1={y0 + sectionH * 0.55} x2={x} y2={y0 + sectionH} className="picket-line" />;
              })}
              {section.doorType !== 'none' && <>
                <rect x={currentX + doorLeft} y={y0 + 24} width={doorWidth} height={sectionH - 24} className="door-box" rx="4" />
                <line x1={currentX + doorLeft} y1={y0} x2={currentX + doorLeft} y2={y0 + sectionH} className={renaissance ? 'two-by-two-no-groove-line' : 'two-by-two-line'} />
                <line x1={currentX + doorLeft + doorWidth} y1={y0} x2={currentX + doorLeft + doorWidth} y2={y0 + sectionH} className={renaissance ? 'two-by-two-no-groove-line' : 'two-by-two-line'} />
                <line x1={currentX + doorLeft} y1={y0 + 24} x2={currentX + doorLeft + doorWidth} y2={y0 + 24} className={renaissance ? 'two-by-two-no-groove-line' : 'two-by-two-line'} />
              </>}
              <text x={currentX + 8} y={y0 + sectionH + 18} className="svg-note">{`${section.label} · ${feetAndInches(section.width)} × ${feetAndInches(section.height)}`}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend-row">
        <span><i className="legend-swatch receiver-line-swatch" />{renaissance ? '1x2 7/8' : 'Receiver'}</span>
        <span><i className="legend-swatch one-by-two-line-swatch" />{renaissance ? '2x2 no groove' : '1x2'}</span>
        <span><i className="legend-swatch two-by-two-line-swatch" />{renaissance ? '2x2 with groove' : '2x2'}</span>
        <span><i className="legend-swatch picket-line-swatch" />Pickets</span>
        {!renaissance && <span><i className="legend-swatch vgroove-line-swatch" />V-groove</span>}
      </div>
    </div>
  );
}
