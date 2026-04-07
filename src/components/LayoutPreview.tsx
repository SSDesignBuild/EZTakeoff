interface LayoutPreviewProps {
  serviceSlug: string;
  values: Record<string, string | number | boolean>;
}

export function LayoutPreview({ serviceSlug, values }: LayoutPreviewProps) {
  if (serviceSlug === 'decks') {
    const width = Number(values.width ?? 24);
    const depth = Number(values.depth ?? 14);
    const cutInWidth = Number(values.cutInWidth ?? 0);
    const cutInDepth = Number(values.cutInDepth ?? 0);
    const scale = 18;
    const outerW = width * scale;
    const outerH = depth * scale;
    const notchW = cutInWidth * scale;
    const notchH = cutInDepth * scale;
    const x0 = 40;
    const y0 = 40;

    const points = [
      `${x0},${y0}`,
      `${x0 + outerW},${y0}`,
      `${x0 + outerW},${y0 + outerH}`,
      `${x0 + outerW / 2 + notchW / 2},${y0 + outerH}`,
      `${x0 + outerW / 2 + notchW / 2},${y0 + outerH - notchH}`,
      `${x0 + outerW / 2 - notchW / 2},${y0 + outerH - notchH}`,
      `${x0 + outerW / 2 - notchW / 2},${y0 + outerH}`,
      `${x0},${y0 + outerH}`,
    ].join(' ');

    const joistCount = Math.ceil((width * 12) / 16) + 1;
    const joists = Array.from({ length: joistCount }, (_, index) => {
      const x = x0 + 10 + (index * (outerW - 20)) / Math.max(joistCount - 1, 1);
      return <line key={index} x1={x} y1={y0 + 10} x2={x} y2={y0 + outerH - 10} stroke="#bdc9c4" strokeWidth="2" />;
    });

    return (
      <div className="visual-card">
        <div className="visual-header">
          <h3>Layout preview</h3>
          <span>Deck footprint with joist direction</span>
        </div>
        <svg viewBox={`0 0 ${outerW + 80} ${outerH + 80}`} className="layout-svg">
          <polygon points={points} fill="#d8a06d" fillOpacity="0.18" stroke="#c98b52" strokeWidth="4" />
          {joists}
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
          <rect x={x0} y={y0} width={roofW} height={roofD} fill="#eef1ea" stroke="#49655b" strokeWidth="4" rx="10" />
          {Array.from({ length: panelCount - 1 }, (_, index) => {
            const x = x0 + ((index + 1) * roofW) / panelCount;
            return <line key={index} x1={x} y1={y0} x2={x} y2={y0 + roofD} stroke="#a3b0ab" strokeWidth="2" />;
          })}
          <line x1={x0} y1={y0 + roofD + 18} x2={x0 + roofW} y2={y0 + roofD + 18} stroke="#c98b52" strokeWidth="6" />
          <text x={x0} y={y0 - 12} fill="#31433d">House attachment</text>
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
        <rect x={x0} y={y0} width={totalW} height={totalH} fill="#f8f3ec" stroke="#163028" strokeWidth="4" rx="8" />
        {Array.from({ length: openingCount - 1 }, (_, index) => {
          const x = x0 + ((index + 1) * totalW) / openingCount;
          return <line key={index} x1={x} y1={y0} x2={x} y2={y0 + totalH} stroke="#c98b52" strokeWidth="4" />;
        })}
        <line x1={x0} y1={y0 + totalH * 0.55} x2={x0 + totalW} y2={y0 + totalH * 0.55} stroke="#7da192" strokeWidth="4" strokeDasharray="10 6" />
      </svg>
    </div>
  );
}
