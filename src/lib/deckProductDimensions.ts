/** Dressed board envelopes from manufacturer product pages, reviewed
 * 2026-11-26. These are standard-width deck boards, not fascia or risers.
 * Individual supplied dimensions take precedence and remain identifiable. */
export interface DeckProductDimensions {
  faceIn: number;
  thicknessIn: number;
  sourceUrl?: string;
  authority: 'manufacturer' | 'configured' | 'generic';
}

const known: { test: RegExp; faceIn: number; thicknessIn: number; sourceUrl: string }[] = [
  { test: /trex\s+select\b/i, faceIn: 5.5, thicknessIn: .82,
    sourceUrl: 'https://online.flippingbook.com/view/63974767/' },
  { test: /trex\s+transcend\b/i, faceIn: 5.5, thicknessIn: .94,
    sourceUrl: 'https://www.trex.com/products/decking/transcend/' },
  { test: /trex\s+signature\b/i, faceIn: 5.5, thicknessIn: .94,
    sourceUrl: 'https://online.flippingbook.com/view/63974767/' },
  { test: /trex\s+enhance\b/i, faceIn: 5.5, thicknessIn: .94,
    sourceUrl: 'https://www.trex.com/products/decking/enhance/' },
  { test: /timbertech\s+legacy\b/i, faceIn: 5.36, thicknessIn: .94,
    sourceUrl: 'https://www.timbertech.com/product/pro-legacy-collection/' },
  { test: /timbertech\s+reserve\b/i, faceIn: 5.36, thicknessIn: .94,
    sourceUrl: 'https://www.timbertech.com/product/pro-reserve-collection/' },
  { test: /timbertech\s+terrain(?!\+)\b/i, faceIn: 5.36, thicknessIn: .94,
    sourceUrl: 'https://www.timbertech.com/product/pro-terrain-collection/' },
  { test: /timbertech\s+terrain\+/i, faceIn: 5.36, thicknessIn: .94,
    sourceUrl: 'https://www.timbertech.com/product/composite-terrain-plus-collection/' },
  { test: /timbertech\s+prime\+/i, faceIn: 5.36, thicknessIn: .94,
    sourceUrl: 'https://www.timbertech.com/product/edge-prime-plus-collection/' },
  { test: /timbertech\s+premier\+/i, faceIn: 5.36, thicknessIn: .89,
    sourceUrl: 'https://www.timbertech.com/product/premier-plus-collection/' },
  { test: /timbertech\s+prime\b/i, faceIn: 5.36, thicknessIn: .94,
    sourceUrl: 'https://www.timbertech.com/product/edge-prime-collection/' },
  { test: /timbertech\s+premier\b/i, faceIn: 5.36, thicknessIn: .89,
    sourceUrl: 'https://assets.timbertech.com/content/dam/wp-content/TimberTech-2025-Product-Guide-2025.pdf' },
  { test: /timbertech\s+vintage\b/i, faceIn: 5.5, thicknessIn: 1,
    sourceUrl: 'https://www.timbertech.com/product/azek-vintage-collection/' },
  { test: /timbertech\s+landmark\b/i, faceIn: 5.5, thicknessIn: 1,
    sourceUrl: 'https://www.timbertech.ca/products/decking/azek-landmark' },
  { test: /timbertech\s+harvest\+/i, faceIn: 5.5, thicknessIn: 1,
    sourceUrl: 'https://www.timbertech.com/product/harvest-plus-collection/' },
  { test: /timbertech\s+harvest\b/i, faceIn: 5.5, thicknessIn: 1,
    sourceUrl: 'https://www.timbertech.ca/products/decking/azek-harvest' },
];

export function resolveBoardDimensions(material: unknown,
  overrides: { faceIn?: number; thicknessIn?: number } = {}): DeckProductDimensions {
  const match = known.find(row => row.test.test(String(material ?? '')));
  const base: DeckProductDimensions = match ? {
    faceIn: match.faceIn, thicknessIn: match.thicknessIn, sourceUrl: match.sourceUrl, authority: 'manufacturer',
  } : { faceIn: 5.5, thicknessIn: 1, authority: 'generic' };
  const face = Number(overrides.faceIn), thickness = Number(overrides.thicknessIn);
  const customFace = Number.isFinite(face) && face > 0;
  const customThickness = Number.isFinite(thickness) && thickness > 0;
  if (!customFace && !customThickness) return base;
  return { ...base, faceIn: customFace ? face : base.faceIn,
    thicknessIn: customThickness ? thickness : base.thicknessIn, authority: 'configured' };
}

export function resolveFasciaDimensions(material: unknown,
  overrides: { faceIn?: number; thicknessIn?: number } = {}, role: 'fascia' | 'riser' = 'fascia'): DeckProductDimensions {
  const style = String(material ?? ''), riser = role === 'riser';
  let base: DeckProductDimensions = { faceIn: riser ? 7.25 : 12, thicknessIn: .75, authority: 'generic' };
  if (/trex\s+(enhance|transcend|signature|select)\b/i.test(style)) base = {
    faceIn: riser ? 7.25 : 11.375, thicknessIn: .56, authority: 'manufacturer',
    sourceUrl: 'https://www.trex.com/products/decking/enhance/',
  };
  else if (/timbertech\s+(legacy|reserve|terrain|prime|premier)\b/i.test(style)) base = {
    faceIn: riser ? 7.25 : 11.95, thicknessIn: .58, authority: 'manufacturer',
    sourceUrl: 'https://www.timbertech.com/product/pro-legacy-collection/',
  };
  else if (/timbertech\s+(vintage|landmark|harvest)\b/i.test(style)) base = {
    faceIn: riser ? 7.25 : 11.75, thicknessIn: riser ? .75 : .5, authority: 'manufacturer',
    sourceUrl: 'https://www.timbertech.com/product/azek-vintage-collection/',
  };
  const face = Number(overrides.faceIn), thickness = Number(overrides.thicknessIn);
  const customFace = Number.isFinite(face) && face > 0, customThickness = Number.isFinite(thickness) && thickness > 0;
  if (!customFace && !customThickness) return base;
  return { ...base, faceIn: customFace ? face : base.faceIn,
    thicknessIn: customThickness ? thickness : base.thicknessIn, authority: 'configured' };
}
