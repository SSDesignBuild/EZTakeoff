import type { ConstructionAssembly } from './constructionAssembly';

/** Complete machine-readable companion to the printed part/contact schedules.
 * All coordinate and length columns are inches; no display-fraction rounding. */
export function constructionAssemblyCsv(assembly: ConstructionAssembly): string {
  const cell = (value: string | number) => {
    const str = String(value);
    // User material names may begin with spreadsheet formula characters.
    const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const inches = (feet: number) => Number((feet * 12).toFixed(6));
  const rows: (string | number)[][] = [[
    'Record', 'Reference', 'Tier', 'Kind', 'Material / hardware', 'Quantity', 'Unit',
    'Width in', 'Depth in', 'Cut length in', 'From X in', 'From Y in', 'From Z in',
    'To X in', 'To Y in', 'To Z in', 'Anchor X in', 'Anchor Y in', 'Anchor Z in',
    'Connected part references', 'Geometry basis', 'Source / installation note',
  ]];
  for (const p of assembly.parts) rows.push(['PART', p.id, p.tierId, p.kind, p.material, 1,
    p.purchaseRole === 'kit-component' ? 'kit component' : 'installed part', p.dressed.widthIn, p.dressed.depthIn, inches(p.cutLengthFt),
    inches(p.axis.from.x), inches(p.axis.from.y), inches(p.axis.from.z),
    inches(p.axis.to.x), inches(p.axis.to.y), inches(p.axis.to.z), '', '', '', '',
    p.geometryStatus, [p.source.authority, p.source.url, ...p.source.notes].filter(Boolean).join(' / ')]);
  for (const c of assembly.connections) {
    const hardware = c.hardware.length ? c.hardware : [{ name: 'Contact location', quantity: 1, unit: 'location', spec: '' }];
    for (const h of hardware) rows.push(['CONNECTION', c.id, c.tierId, c.kind, h.name, h.quantity, h.unit,
      '', '', '', '', '', '', '', '', '', inches(c.point.x), inches(c.point.y), inches(c.point.z),
      c.partIds.join(' / '), 'Assembly location; no drilling pattern',
      [h.spec, ...c.source.notes].filter(Boolean).join(' / ')]);
  }
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
