/** Exact support post coordinates (feet) along each straight beam's long axis. */
export interface ExactSupportPost { id: string; x: number; locked: boolean }
export interface ExactBeamPostLayout { beamIndex: number; posts: ExactSupportPost[] }
export interface BeamRun { startX: number; endX: number }
const precision = (value: number) => Math.round(value * 12000) / 12000;

export function parseExactPostLayouts(raw: string | number | boolean | undefined): { layouts: ExactBeamPostLayout[]; issues: string[] } {
  if (raw === undefined || raw === '') return { layouts: [], issues: [] };
  if (typeof raw !== 'string') return { layouts: [], issues: ['Post layout must be valid JSON.'] };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { layouts: [], issues: ['Post layout cannot be parsed; repair saved layout.'] }; }
  if (!Array.isArray(parsed)) return { layouts: [], issues: ['Post layout must be an array.'] };
  const layouts: ExactBeamPostLayout[] = [], issues: string[] = [];
  const seenBeams = new Set<number>();
  for (const entry of parsed) {
    const beamIndex = Number(entry?.beamIndex);
    if (!Number.isInteger(beamIndex) || beamIndex < 0 || seenBeams.has(beamIndex) || !Array.isArray(entry?.posts)) {
      issues.push('Invalid/duplicate beam layout record.'); continue;
    }
    seenBeams.add(beamIndex);
    const ids = new Set<string>(), posts: ExactSupportPost[] = [];
    for (const post of entry.posts) {
      const id = typeof post?.id === 'string' ? post.id.trim() : '';
      const x = Number(post?.x);
      if (!id || !Number.isFinite(x) || ids.has(id)) { issues.push('Beam ' + (beamIndex + 1) + ' contains an invalid/duplicate post.'); continue; }
      ids.add(id);
      posts.push({ id, x: precision(x), locked: post.locked === true });
    }
    layouts.push({ beamIndex, posts });
  }
  return { layouts, issues };
}

export function evenlySpacedPosts(runs: BeamRun[], count: number, cantilever: number): number[] {
  if (!Number.isInteger(count) || count < 2 || count > 100) throw new Error('Post count must be between 2 and 100.');
  if (!runs.length || runs.some((r) => !(r.endX > r.startX))) throw new Error('No valid beam runs.');
  if (count < runs.length * 2) throw new Error('Each separate beam run requires at least two supports.');
  const counts = runs.map(() => 2);
  for (let remaining = count - 2 * runs.length; remaining > 0; remaining--) {
    let longest = -1, index = 0;
    runs.forEach((run, i) => {
      const len = run.endX - run.startX;
      const inset = Math.min(Math.max(cantilever, 0), len / 4);
      const span = (len - 2 * inset) / (counts[i] - 1);
      if (span > longest) { longest = span; index = i; }
    });
    counts[index]++;
  }
  return runs.flatMap((run, index) => {
    const length = run.endX - run.startX;
    const inset = Math.min(Math.max(cantilever, 0), length / 4);
    return Array.from({ length: counts[index] }, (_, i) => precision(run.startX + inset + (length - 2 * inset) * i / (counts[index] - 1)));
  });
}

export function validateExactPostLayout(layout: ExactBeamPostLayout, runs: BeamRun[]): string[] {
  const issues: string[] = [];
  if (!runs.length) return ['Beam ' + (layout.beamIndex + 1) + ': no valid support run.'];
  const sorted = [...layout.posts].sort((a, b) => a.x - b.x);
  sorted.forEach((p, i) => {
    if (!runs.some((r) => p.x >= r.startX - 0.005 && p.x <= r.endX + 0.005)) issues.push('Beam ' + (layout.beamIndex + 1) + ' post ' + p.id + ' is outside its beam.');
    if (i && p.x - sorted[i - 1].x < 1 / 12 - 0.00001) issues.push('Beam ' + (layout.beamIndex + 1) + ': posts cannot be closer than 1 inch.');
  });
  runs.forEach((run, index) => {
    if (sorted.filter((p) => p.x >= run.startX - 0.005 && p.x <= run.endX + 0.005).length < 2) {
      issues.push('Beam ' + (layout.beamIndex + 1) + ' run ' + (index + 1) + ' has fewer than two posts.');
    }
  });
  return issues;
}

export function shiftPostLayoutIndices(layouts: ExactBeamPostLayout[], index: number, action: 'insert' | 'remove'): ExactBeamPostLayout[] {
  return layouts.flatMap((layout) => {
    if (action === 'remove' && layout.beamIndex === index) return [];
    return [{ ...layout, beamIndex: layout.beamIndex + (action === 'insert' ? Number(layout.beamIndex >= index) : -Number(layout.beamIndex > index)) }];
  });
}
