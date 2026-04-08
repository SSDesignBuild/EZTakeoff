from pathlib import Path

root = Path('/tmp/snsv5')

# Update services.ts patio cover fields/defaults/notes
services = (root / 'src/data/services.ts').read_text()
services = services.replace(
"""      fanBeam: 'none',
    },""",
"""      fanBeam: 'none',
      screenUnderneath: false,
      beamStyle: 'atlas',
    },"""
)
services = services.replace(
"""      {
        key: 'fanBeam',
        label: 'Fan beam',
        type: 'select',
        options: [
          { label: 'No fan beam', value: 'none' },
          { label: 'Centered fan beam', value: 'centered' },
          { label: 'Fan beam 1 ft from male / female side', value: 'offset' },
        ],
      },
    ],
    formulaNotes: [
      '3 in panels are checked against a 15 ft projection limit with a 2 ft overhang assumption. Upgraded .32 metal with 2 lb foam can extend that to about 19 ft, and 6 in upgraded panels can carry longer projections.',
      'Gutter is only used on the front low side. C-channel only appears on attached jobs. Drip-edge fascia caps the left and right sides.',
      'Gutter, C-channel, and fascia are grouped in 24 ft stock lengths for ordering.',
    ],""",
"""      {
        key: 'fanBeam',
        label: 'Fan beam',
        type: 'select',
        options: [
          { label: 'No fan beam', value: 'none' },
          { label: 'Centered fan beam', value: 'centered' },
          { label: '1 ft from female side', value: 'female-offset' },
          { label: '1 ft from male side', value: 'male-offset' },
        ],
      },
      { key: 'screenUnderneath', label: 'Planning to screen under this cover', type: 'boolean' },
      {
        key: 'beamStyle',
        label: 'Front beam style',
        type: 'select',
        options: [
          { label: 'Atlas beam (open cover)', value: 'atlas' },
          { label: '3x3 beam for screened cover', value: '3x3' },
        ],
      },
    ],
    formulaNotes: [
      '3 in panels are checked against your 15 ft rule with a 2 ft overhang assumption. Upgraded .32 metal with 2 lb foam can extend 3 in panels to about 19 ft, and 6 in upgraded panels can carry up to about 26 ft.',
      'Standard non-upgraded covers add a support beam once the projection goes past 13 ft, and continue adding support at roughly each additional 13 ft of projection.',
      'Gutter, C-channel, and drip-edge fascia are grouped in 24 ft stock lengths. C-channel is attached jobs only, gutter is the front low side only, and every cover gets two downspout kits.',
    ],"""
)
(root / 'src/data/services.ts').write_text(services)

# Update estimate.ts patio cover logic
estimate = (root / 'src/lib/estimate.ts').read_text()
start = estimate.index('function estimatePatioCover')
end = len(estimate)
new_func = '''function estimatePatioCover(inputs: EstimateInputs): EstimateResult {
  const width = Number(inputs.width ?? 0);
  const projection = Number(inputs.projection ?? 0);
  const attachmentHeight = Number(inputs.attachmentHeight ?? 0);
  const lowSideHeight = Number(inputs.lowSideHeight ?? 0);
  const structureType = String(inputs.structureType ?? 'attached');
  const panelWidth = Number(inputs.panelWidth ?? 4);
  const panelThickness = Number(inputs.panelThickness ?? 3);
  const metalGauge = String(inputs.metalGauge ?? '.26');
  const foamDensity = Number(inputs.foamDensity ?? 1);
  const fanBeam = String(inputs.fanBeam ?? 'none');
  const screenUnderneath = Boolean(inputs.screenUnderneath ?? false);
  const beamStyleInput = String(inputs.beamStyle ?? (screenUnderneath ? '3x3' : 'atlas'));
  const beamStyle = screenUnderneath ? '3x3' : beamStyleInput;
  const slopeDrop = Math.max(attachmentHeight - lowSideHeight, 0);
  const panelCount = Math.max(1, Math.ceil(width / panelWidth));
  const panelLength = Math.ceil(Math.min(Math.max(projection, 1), 40));
  const gutterPieces = Math.ceil(width / 24);
  const fasciaPieces = Math.ceil((projection * 2) / 24);
  const cChannelPieces = structureType === 'attached' ? Math.ceil(width / 24) : 0;
  const frontPostCount = structureType === 'freestanding' ? Math.max(3, Math.ceil(width / 8) + 1) : Math.max(2, Math.ceil(width / 10));

  const standard3In = panelThickness === 3 && metalGauge !== '.32' && foamDensity < 2;
  const upgraded3In = panelThickness === 3 && metalGauge === '.32' && foamDensity === 2;
  const upgraded6In = panelThickness === 6 && metalGauge === '.32' && foamDensity === 2;
  const maxProjection = upgraded6In ? 26 : upgraded3In ? 19 : 15;
  const overLimit = projection > maxProjection;
  const supportBeamCount = standard3In && projection > 13 ? Math.ceil(projection / 13) - 1 : 0;
  const totalBeamLines = 1 + supportBeamCount;
  const hiddenBracketPerPost = beamStyle === '3x3' ? 2 : 1;
  const hiddenBracketCount = frontPostCount * hiddenBracketPerPost;
  const washerScrews = panelCount * totalBeamLines * 5;
  const tekScrewLf = width + (projection * 2) + (structureType === 'attached' ? width : 0);
  const tekScrews = Math.ceil((tekScrewLf * 12) / 6);
  const panelSeams = Math.max(panelCount - 1, 0);
  const sealantLf = (panelSeams * projection) + (width * 2) + (projection * 2) + (structureType === 'attached' ? width : 0);
  const sealantTubes = Math.max(1, Math.ceil(sealantLf / 24));
  const frontBeamLengthLf = width;
  const supportBeamLengthLf = supportBeamCount * width;
  const beamStockPieces = Math.ceil((frontBeamLengthLf + supportBeamLengthLf) / 24);

  const materials: MaterialItem[] = [
    toMaterial(`${panelWidth} ft insulated roof panels`, 'Roof system', panelCount, 'panels', `${panelLength} ft custom length`, `${panelThickness} in panel · ${metalGauge} skin · ${foamDensity} lb foam`),
    toMaterial('Front gutter', 'Trim', gutterPieces, 'sticks', '24 ft sections', 'Front lower side only'),
    toMaterial('Drip-edge fascia', 'Trim', fasciaPieces, 'sticks', '24 ft sections', 'Left and right sides and gutter end-cap condition'),
    toMaterial('C-channel', 'Trim', cChannelPieces, 'sticks', '24 ft sections', 'Attached conditions only; seal behind before fastening'),
    toMaterial('Downspout kits', 'Trim', 2, 'kits', '2 per cover', 'Standard on every patio cover'),
    toMaterial(beamStyle === '3x3' ? '3x3 front beam' : 'Atlas front beam', 'Structure', beamStockPieces, 'sticks', '24 ft sections', screenUnderneath ? 'Screened-under cover uses 3x3 beam and post system' : 'Open cover uses Atlas beam sitting on top of posts'),
    toMaterial('Posts', 'Structure', frontPostCount, 'ea', `${Math.ceil(lowSideHeight + 1)} ft stock`, structureType === 'freestanding' ? 'Freestanding cover with front support line shown here' : 'Front support line'),
    toMaterial('Hidden brackets', 'Hardware', hiddenBracketCount, 'ea', `${hiddenBracketPerPost} per post`, beamStyle === '3x3' ? 'Two hidden brackets per post for 3x3 screened-cover framing' : 'One hidden bracket per post when using Atlas beam'),
    toMaterial('Washer screws', 'Hardware', washerScrews, 'ea', '5 per panel per beam line', `${panelCount} panels across ${totalBeamLines} beam line(s)`),
    toMaterial('Tek screws', 'Hardware', tekScrews, 'ea', 'Approx. every 6 in', 'For C-channel, gutter, and fascia'),
    toMaterial('Sealant / NovaFlex', 'Hardware', sealantTubes, 'tubes', 'Approx. 24 lf per tube', `Snap-lock seams + full perimeter + behind C-channel = ${sealantLf.toFixed(1)} lf`),
  ].filter((item) => item.quantity > 0);

  if (fanBeam !== 'none') {
    materials.push(toMaterial('Fan beam', 'Roof system', 1, 'ea', fanBeam === 'centered' ? 'Centered in panel bay' : fanBeam === 'female-offset' ? '1 ft from female side' : '1 ft from male side', 'Fan support beam integrated into panel layout'));
  }
  if (supportBeamCount > 0) {
    materials.push(toMaterial(beamStyle === '3x3' ? 'Intermediate 3x3 support beam' : 'Intermediate support beam', 'Structure', supportBeamCount, 'lines', `${width.toFixed(1)} ft each`, 'Added because projection exceeds 13 ft without the full panel upgrade package'));
  }

  return {
    summary: [
      { label: 'Roof area', value: `${(width * projection).toFixed(1)} sq ft` },
      { label: 'Panel count', value: `${panelCount}` },
      { label: 'Support beams', value: `${totalBeamLines} total beam line${totalBeamLines === 1 ? '' : 's'}` },
      { label: 'Projection check', value: overLimit ? `Over ${maxProjection} ft rule` : `Within ${maxProjection} ft rule` },
    ],
    materials,
    orderNotes: [
      `This selection checks against your ${maxProjection} ft max projection rule for the chosen panel package.${overLimit ? ' Current inputs exceed that limit and need more upgrade or redesign.' : ''}`,
      supportBeamCount > 0 ? `Projection is over 13 ft without the full upgrade package, so ${supportBeamCount} intermediate support beam line(s) were added.` : 'No intermediate support beam was required by the current projection/upgrade combination.',
      structureType === 'attached' ? 'Attached jobs include C-channel where panels slide into the house connection and are fastened from the top, with sealant behind the channel before installation.' : 'Freestanding jobs remove the house C-channel and need full support framing.',
      beamStyle === '3x3' ? 'Screened-under configuration is active, so the take-off uses 3x3 beam / post logic with two hidden brackets per post.' : 'Open cover configuration is active, so the take-off uses Atlas beam logic with one hidden bracket per post.',
      fanBeam === 'none' ? 'No fan beam selected.' : `Fan beam selected: ${fanBeam === 'centered' ? 'centered' : fanBeam === 'female-offset' ? '1 ft from female side' : '1 ft from male side'}.`,
    ],
  };
}
'''
estimate = estimate[:start] + new_func
(root / 'src/lib/estimate.ts').write_text(estimate)

# Update patio preview labels
preview = (root / 'src/components/LayoutPreview.tsx').read_text()
preview = preview.replace(
"""  if (serviceSlug === 'patio-covers') {
    const width = Number(values.width ?? 21);
    const projection = Number(values.projection ?? 8);
    const panelWidth = Number(values.panelWidth ?? 4);
    const panelCount = Math.ceil(width / panelWidth);
    const scale = 20;
    const x0 = 40;
    const y0 = 60;
    const roofW = width * scale;
    const roofD = projection * scale;
    return (
      <div className="visual-card">
        <div className="visual-header"><h3>Layout preview</h3><span>Top view with panel bays and trim zones</span></div>
        <svg viewBox={`0 0 ${roofW + 80} ${roofD + 120}`} className="layout-svg">
          <rect x={x0} y={y0} width={roofW} height={roofD} className="roof-box" rx="10" />
          {Array.from({ length: panelCount - 1 }, (_, index) => {
            const x = x0 + ((index + 1) * roofW) / panelCount;
            return <line key={index} x1={x} y1={y0} x2={x} y2={y0 + roofD} className="roof-bay" />;
          })}
          <line x1={x0} y1={y0 + roofD + 18} x2={x0 + roofW} y2={y0 + roofD + 18} className="house-line" />
          <text x={x0} y={y0 - 12} className="svg-note">House / C-channel side</text>
          <text x={x0 + roofW / 2 - 30} y={y0 + roofD + 38} className="svg-note">Front gutter</text>
          <text x={x0 - 12} y={y0 + roofD / 2} className="svg-note">Fascia</text>
          <text x={x0 + roofW + 8} y={y0 + roofD / 2} className="svg-note">Fascia</text>
        </svg>
      </div>
    );
  }""",
"""  if (serviceSlug === 'patio-covers') {
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
  }"""
)
(root / 'src/components/LayoutPreview.tsx').write_text(preview)
