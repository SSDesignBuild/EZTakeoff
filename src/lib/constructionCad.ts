import type { DeckModel } from './deckModel';
import { buildConstructionAssembly } from './constructionAssembly';
import { addInstallerAssemblySheets, addConstructionScaleBar } from './constructionCadInstaller';
import type { ConsultationProject } from './consultationProject';
import { planStairLandings, type StairLandingPlan } from './stairConcreteLanding';
import type { MaterialItem } from './types';
import { CAD_SHEET_WIDTH, CAD_SHEET_HEIGHT, cadText, line, poly, rect,
  text, wrapped, dimension, type CadBlock,
  type ConstructionSheet, type ConstructionDrawingSet } from './constructionCadScene';

type Values = Record<string, string | number | boolean>;
interface Tier { label: string; deck: DeckModel; heightFt: number; values: Values; landings: StairLandingPlan[] }
const SCALES = [8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768];
const scaleFor = (required: number) => SCALES.find(s => s >= required) ?? Math.ceil(required / 96) * 96;
const actualPostIn = (deck: DeckModel) => deck.postSize === '8x8' ? 7.5 : 5.5;

/** Bounded title-block text. Full values remain in projectMetadata and, when
 * shortened here, in the drawing basis schedule. Never change saved inputs. */
function fittedLines(value: unknown, width: number, font: number, maxLines: number) {
  const limit = Math.max(8, Math.floor(width / (font * .6))), full = cadText(value), rows: string[] = [];
  let row = '';
  for (let word of full.split(/\s+/)) {
    if (row && row.length + word.length + 1 > limit) { rows.push(row); row = ''; }
    while (word.length > limit) { rows.push(word.slice(0, limit)); word = word.slice(limit); }
    if (word) row += (row ? ' ' : '') + word;
  }
  if (row || !rows.length) rows.push(row);
  const shortened = rows.length > maxLines, lines = rows.slice(0, maxLines);
  if (shortened) lines[lines.length - 1] = lines[lines.length - 1].slice(0, limit - 3).trimEnd() + '...';
  return { lines, shortened, full };
}

export function constructionHardwareKey(item: Pick<MaterialItem, 'name' | 'category'>): string {
  const s = item.name.toLowerCase();
  if (/post bracket|post base/.test(s)) return 'H01';
  if (/j anchor|submersible|concrete anchor/.test(s)) return 'H02';
  if (/joist hanger/.test(s) && !/nail|screw/.test(s)) return 'H03';
  if (/hurricane|rafter tie/.test(s)) return 'H04';
  if (/carriage bolt/.test(s)) return 'H05';
  if (/lateral load|lag screw|shield anchor/.test(s)) return 'H06';
  if (/ledgerlok|sds/.test(s)) return 'H07';
  if (/connector|hanger.*nail/.test(s)) return 'H08';
  if (/camo|deck board screw|trim.*fastener|color.matched/.test(s)) return 'H09';
  if (/joist tape/.test(s)) return 'H10';
  if (/gate|hinge/.test(s)) return 'H11';
  return 'H12';
}
const isHardware = (item: MaterialItem) => /hardware|fastener|gate/i.test(item.category) ||
  /hanger|bracket|anchor|bolt|screw|\bnails?\b|joist tape|hinge/i.test(item.name);

function symbolFor(deck: DeckModel): CadBlock {
  const name = `SNS_POST_${deck.postSize.toUpperCase()}_F${deck.footingDiameterIn}`.replace(/\./g, '_');
  const r = deck.footingDiameterIn / 2, half = actualPostIn(deck) / 2;
  return { name, entities: [
    { type: 'circle', center: { x: 0, y: 0 }, radius: r, layer: 'FOOTINGS' },
    { type: 'polyline', points: [{ x: -half, y: -half }, { x: half, y: -half }, { x: half, y: half }, { x: -half, y: half }], closed: true, layer: 'POSTS' },
    { type: 'line', a: { x: -r - 2, y: 0 }, b: { x: r + 2, y: 0 }, layer: 'CENTER' },
    { type: 'line', a: { x: 0, y: -r - 2 }, b: { x: 0, y: r + 2 }, layer: 'CENTER' },
  ] };
}
/** Build from the production model, never from SVG/canvas pixels or a second
 * takeoff. Displayed order rows retain the customer's saved overrides. */
export function buildConstructionDrawingSet(values: Values, items: MaterialItem[], options: { revision?: string; issues?: string[]; computedItems?: MaterialItem[]; project?: ConsultationProject; extraSheets?: ConstructionSheet[] } = {}): ConstructionDrawingSet {
  const assembly = buildConstructionAssembly(values, { project: options.project });
  const tiers: Tier[] = assembly.tiers.map(t => ({ ...t, label: t.label.toUpperCase(),
    landings: planStairLandings(t.deck.stairPlacements.map(p => p.width), t.values) }));
  const revision = cadText(options.revision ?? values.drawingRevision ?? 'A');
  const projectMetadata = { jobName: String(values.poJobName || 'Deck project'), address: String(values.jobAddress || 'Project address not entered'),
    phone: String(values.customerPhone || ''), revision: String(options.revision ?? values.drawingRevision ?? 'A') };
  const jobCaption = fittedLines(projectMetadata.jobName, 505, 9, 1), addressCaption = fittedLines(projectMetadata.address, 505, 8, 2);
  const phoneCaption = fittedLines(projectMetadata.phone ? `Phone: ${projectMetadata.phone}` : '', 505, 7.5, 1), revisionCaption = fittedLines(`REV ${revision}`, 152, 8, 1);
  const fullFieldRows: string[][] = [
    ...(jobCaption.shortened ? [['Full job name', projectMetadata.jobName]] : []),
    ...(addressCaption.shortened ? [['Full project address', projectMetadata.address]] : []),
    ...(phoneCaption.shortened ? [['Full contact phone', projectMetadata.phone]] : []),
    ...(revisionCaption.shortened ? [['Full revision', projectMetadata.revision]] : []),
  ];
  const set: ConstructionDrawingSet = { sheets: [], blocks: [], title: String(values.poJobName || 'S&S Design Build - Deck construction sheets'), revision,
    projectMetadata,
    issues: [...(options.issues ?? []), ...assembly.issues, ...tiers.flatMap(t => t.deck.postLayoutIssues)], warnings: [...assembly.notes], modelFacts: tiers.map(t => ({ tier: t.label,
      postCount: t.deck.postCount, footingDiameterIn: t.deck.footingDiameterIn, footingDepthIn: t.deck.footingDepthIn,
      concreteBags: t.deck.concreteBags, stairCount: t.deck.stairCount, landings: t.landings })) };
  if (tiers.some(t => t.deck.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)) ||
    ![t.heightFt, t.deck.footingDepthIn, t.deck.footingDiameterIn].every(Number.isFinite))) {
    set.issues.push('Non-finite model dimensions must be corrected before construction export.');
    return set;
  }
  if (options.computedItems && JSON.stringify(items.map(i => [i.name, i.quantity, i.unit, i.stockRecommendation])) !==
    JSON.stringify(options.computedItems.map(i => [i.name, i.quantity, i.unit, i.stockRecommendation])))
    set.warnings.push('Material order has saved edits or exclusions. Schedule quantities show the current order; geometric member counts remain those of the drawing.');
  if (tiers.some(t => t.deck.stairCount && t.landings.length !== t.deck.stairCount))
    set.warnings.push('No new slab is drawn or ordered for stairs whose landing surface is existing, site-plan or unconfirmed.');
  set.warnings.push('These are dimensioned coordination drawings. Soil/frost, spans, connection engineering and permit approval require project review.');
  let drawingNumber = 100;
  const newSheet = (title: string, scale: number, id = `C${++drawingNumber}`): ConstructionSheet => {
    const s: ConstructionSheet = { id, title, scale, width: CAD_SHEET_WIDTH, height: CAD_SHEET_HEIGHT, entities: [] };
    set.sheets.push(s); return s;
  };
  const notePanel = (s: ConstructionSheet, heading: string, notes: string[], start = 104) => {
    text(s, 912, start, heading, 11, 'NOTES', true);
    let y = start + 23;
    for (const note of notes) y = wrapped(s, 912, y, note, 265, 8.6, 12.4) + 12;
    return y;
  };
  const tablePages = (prefix: string, title: string, headers: string[], widths: number[], rows: string[][]) => {
    const dense = /^K[ML]/.test(prefix);
    const font = dense ? 7.8 : 8.2, lead = dense ? 10 : 11.5;
    let page: ConstructionSheet | null = null, y = 0, count = 0;
    const wrapCell = (value: string, w: number) => {
      const limit = Math.max(8, Math.floor((w - 14) / (font * .6)));
      const output: string[] = [];
      let current = '';
      for (let word of cadText(value).split(/\s+/)) {
        if (current && current.length + word.length + 1 > limit) { output.push(current); current = ''; }
        while (word.length > limit) { output.push(word.slice(0, limit)); word = word.slice(limit); }
        current += (current ? ' ' : '') + word;
      }
      if (current || !output.length) output.push(current);
      return output;
    };
    const start = () => {
      page = newSheet(title, 1, `${prefix}${String(++count).padStart(2, '0')}`);
      let x = 42;
      headers.forEach((header, i) => { text(page!, x + 7, 106, header, 9, 'NOTES', true); x += widths[i]; });
      line(page, { x: 42, y: 116 }, { x: 1180, y: 116 }, 'TITLE'); y = 120;
    };
    for (const cells of rows) {
      const content = cells.map((cell, i) => wrapCell(cell, widths[i]));
      const lines = Math.max(...content.map(c => c.length));
      // Long notes continue in their own row; no text is silently truncated.
      for (let offset = 0; offset < lines; offset += 20) {
        const height = Math.min(20, lines - offset) * lead + (dense ? 4 : 14);
        if (!page || y + height > 658) start();
        let x = 42;
        content.forEach((cell, i) => {
          const segment = cell.slice(offset, offset + 20);
          if (offset && i === 0 && !segment.length) segment.push('(cont.)');
          segment.forEach((value, row) => text(page!, x + 7, y + (dense ? 9 : 12) + row * lead, value, font));
          x += widths[i];
        });
        line(page!, { x: 42, y: y + height }, { x: 1180, y: y + height }, 'CENTER');
        y += height;
      }
    }
  };

  addInstallerAssemblySheets({ set, newSheet, tablePages }, assembly);

  for (const tier of tiers) {
    const deck = tier.deck;
    const symbol = symbolFor(deck);
    if (!set.blocks.some(b => b.name === symbol.name)) set.blocks.push(symbol);
    const foundation = newSheet(`${tier.label} / F1 FOUNDATION DETAIL`, 8), sf = 72 / foundation.scale;
    text(foundation, 80, 103, 'F1 / ROUND FOOTING SECTION', 11, 'NOTES', true);
    const foot = (x: number, y: number) => ({ x: 100 + x * sf, y: 310 + y * sf });
    const fd = deck.footingDiameterIn, depth = deck.footingDepthIn, post = actualPostIn(deck);
    // Very large configured footings get their own fitting scale without altering values.
    foundation.scale = scaleFor(Math.max(8, fd * 72 / 300, depth * 72 / 250));
    const ff = 72 / foundation.scale;
    const fpt = (x: number, y: number) => ({ x: foot(0, 0).x + x * ff, y: foot(0, 0).y + y * ff });
    poly(foundation, [fpt(0, 0), fpt(fd, 0), fpt(fd, depth), fpt(0, depth)], 'FOOTINGS', true);
    rect(foundation, fpt((fd - post) / 2, 0).x, 156, post * ff, 154, 'POSTS');
    line(foundation, { x: 70, y: 310 }, { x: fpt(fd, 0).x + 32, y: 310 }, 'CENTER');
    text(foundation, 80, 142, `${deck.postSize} POST CONTINUES`, 9, 'TAGS', true);
    line(foundation, { x: fpt((fd - post) / 2, 0).x - 4, y: 177 }, { x: fpt((fd + post) / 2, 0).x + 4, y: 167 }, 'TAGS');
    dimension(foundation, fpt(0, depth), fpt(fd, depth), 35, `${fd} in DIA`);
    dimension(foundation, fpt(fd, 0), fpt(fd, depth), -40, `${depth} in DEEP`);
    line(foundation, fpt(fd / 2, 0), { x: 390, y: 235 }, 'TAGS');
    text(foundation, 390, 225, 'H01 BASE / H02 ANCHOR', 9, 'TAGS', true);
    wrapped(foundation, 390, 245, 'Symbolic connection callout. Select approved base/anchor; embedment and bolt geometry are not inferred.', 325, 8.5);
    const cx = 605, cy = 465;
    foundation.entities.push({ type: 'insert', name: symbol.name, at: { x: cx, y: cy }, scale: ff, layer: 'POSTS' });
    text(foundation, cx, 355, 'PLAN / SAME F1', 10, 'NOTES', true, 'center');
    dimension(foundation, { x: cx - fd / 2 * ff, y: cy }, { x: cx + fd / 2 * ff, y: cy }, fd / 2 * ff + 34, `${fd} in DIA`);
    notePanel(foundation, 'F1 / QUANTITIES + BASIS', [
      `${deck.postCount} round footing(s) this tier. Actual concrete geometry: ${fd} in diameter x ${depth} in depth.`,
      `${deck.footingBagsPerPost} x 80 lb bags per footing / ${deck.concreteBags} bags total. Tube stock ${deck.footingTubeStockIn} in / ${deck.footingTubeCount} tube(s).`,
      `Post face: ${post} in actual for selected ${deck.postSize}. Base and anchor quantities come from the hardware order.`,
      'POST / BEAM IS UNRESOLVED: post-top geometry and FV cut lengths are representative. Confirm an approved notch/cap and bearing detail before cutting.',
      'The specified depth is the saved project value. Verify bearing, frost, grade and approved structural connection before construction.',
    ]);

    const padTypes = [...new Map(tier.landings.map(p => [[p.widthFt, p.depthFt, p.thicknessIn].join(':'), p])).values()];
    padTypes.forEach((pad, index) => {
      const n = tier.landings.filter(p => p.widthFt === pad.widthFt && p.depthFt === pad.depthFt && p.thicknessIn === pad.thicknessIn).length;
      const scale = scaleFor(Math.max(pad.widthFt * 864 / 430, pad.depthFt * 864 / 365, 8));
      const s = newSheet(`${tier.label} / LP${index + 1} LANDING DETAIL`, scale), f = 72 / scale;
      const w = pad.widthFt * 12, d = pad.depthFt * 12;
      text(s, 95, 108, 'PLAN / NEW CONCRETE', 11, 'NOTES', true);
      rect(s, 110, 165, w * f, d * f, 'LANDING');
      dimension(s, { x: 110, y: 165 }, { x: 110 + w * f, y: 165 }, -30);
      dimension(s, { x: 110, y: 165 }, { x: 110, y: 165 + d * f }, 34);
      text(s, 680, 108, 'SECTION / THICKNESS', 11, 'NOTES', true);
      rect(s, 680, 190, d * f, pad.thicknessIn * f, 'LANDING');
      dimension(s, { x: 680, y: 190 }, { x: 680 + d * f, y: 190 }, -32);
      dimension(s, { x: 680 + d * f, y: 190 }, { x: 680 + d * f, y: 190 + pad.thicknessIn * f }, -30, `${pad.thicknessIn} in`);
      let y = 335;
      for (const note of [
        `${n} landing(s) of this type. ${pad.widthFt} ft x ${pad.depthFt} ft x ${pad.thicknessIn} in thick.`,
        `Net volume ${pad.volumeCuFt.toFixed(4)} cu ft each. Ordered ${pad.bags80lb} x 80 lb bags each / ${n * pad.bags80lb} bags this type.`,
        `Order allowance: ${((pad.wasteAdjustedCuFt / pad.volumeCuFt - 1) * 100).toFixed(0)}%; yield follows the shared landing planner.`,
        'Only explicitly selected new landings are included. Verify base preparation, reinforcement, drainage and approved landing requirements.',
      ]) y = wrapped(s, 680, y, note, 450, 9) + 17;
    });
  }

  const hardware = items.filter(isHardware);
  if (hardware.length) tablePages('H', 'HARDWARE + FASTENER ORDER SCHEDULE', ['KEY', 'ITEM / STYLE', 'ORDER QTY', 'UNIT', 'PURCHASING SPECIFICATION', 'NOTES / LOCATIONS'],
    [68, 255, 82, 72, 250, 411], hardware.map(item => [constructionHardwareKey(item), item.name + (item.color ? ` / ${item.color}` : ''),
      String(item.quantity), item.unit, item.stockRecommendation, [item.layoutLabel, item.notes].filter(Boolean).join(' / ')]));
  const members = items.filter(item => !isHardware(item) && /framing|structure|stair|support/i.test(item.category));
  if (members.length) tablePages('M', 'MEMBER + CONCRETE ORDER SCHEDULE', ['ITEM / STYLE', 'ORDER QTY', 'UNIT', 'STOCK / CUT BASIS', 'LOCATIONS / NOTES'],
    [270, 80, 75, 230, 483], members.map(item => [item.name + (item.color ? ` / ${item.color}` : ''), String(item.quantity), item.unit,
      item.stockRecommendation, [item.cutPlan ? `${item.cutPlan.boards.length} stock boards in the purchasing cut plan. Optimizer references are shown in material details.` : item.layoutLabel && item.layoutLabel.length <= 100 ? item.layoutLabel : '',
        'Installed part IDs, finished cuts and endpoints: see piece cut index. Purchase allowance is separate from installed geometry.'].filter(Boolean).join(' / ')]));
  if (set.warnings.length) tablePages('N', 'DRAWING BASIS + ORDER RECONCILIATION', ['SUBJECT', 'PROJECT NOTES'], [225, 913], [
    ...fullFieldRows,
    ['Shared physical parts', 'ConstructionAssembly is the authoritative installed-part and connection register. Dressed footprints, endpoints, cut lengths, elevations and source IDs drive these drawings. It consumes the same shared planners as 3D and takeoff.'],
    ['Part index / physical quantity', 'One indexed part is one installed member or kit component. Purchased stock, waste and spare hardware remain in the current order. REP. identifies a representative kit profile; it does not claim exact manufacturer geometry.'],
    ['Connector locations', 'Connection IDs map to connected part IDs and a saved X/Y/Z placement anchor. Symbols are not hole patterns. Fastener selection, edge distances, embedment and structural approval remain the approved product/project detail.'],
    ['Linework', 'Heavy outlines identify structural or section faces; thin outlines identify finish boards; long-short lines are centers, short dashes are context below/behind. Diagonal hatch identifies a cut material section.'],
    ['DXF units / plotting', 'Model space is inches at 1:1. Named paper layouts provide locked viewports at the printed 1:n scale; print each 17 x 11 in layout at 1:1. Model-space sheet groups are also available. Native non-associative DIMENSION entities regenerate from the saved model on export.'],
    ['PDF printing', 'Print on 17 x 11 in (ANSI B) at Actual size / 100%, without Fit. Linework and text are vector. Dimension labels round to 1/16 in; DXF coordinates are serialized to 9 decimal inch places.'],
    ...set.warnings.map(note => ['Review', note]),
  ]);
  if (options.extraSheets?.length) set.sheets.push(...options.extraSheets);
  // Physical drawings lead the print set; detailed registers follow as an appendix.
  set.sheets.sort((a, b) => Number(b.scale > 1) - Number(a.scale > 1));
  set.sheets.forEach((s, index) => {
    addConstructionScaleBar(s);
    rect(s, 24, 24, 1176, 744, 'TITLE');
    text(s, 42, 51, 'S&S DESIGN BUILD / CONSTRUCTION COORDINATION', 13, 'TITLE', true);
    text(s, 1180, 50, `${s.id} / ${revisionCaption.lines[0]}`, 11, 'TITLE', true, 'right');
    line(s, { x: 24, y: 66 }, { x: 1200, y: 66 }, 'TITLE');
    text(s, 42, 86, fittedLines(s.title, 1138, 10, 1).lines[0], 10, 'TITLE', true);
    line(s, { x: 24, y: 684 }, { x: 1200, y: 684 }, 'TITLE');
    line(s, { x: 565, y: 684 }, { x: 565, y: 768 }, 'TITLE');
    line(s, { x: 1006, y: 684 }, { x: 1006, y: 768 }, 'TITLE');
    text(s, 40, 705, 'S&S DESIGN BUILD', 13, 'TITLE', true);
    jobCaption.lines.forEach((value, row) => text(s, 40, 722 + row * 11, value, 9, 'TITLE'));
    addressCaption.lines.forEach((value, row) => text(s, 40, 737 + row * 11, value, 8, 'TITLE'));
    if (projectMetadata.phone) text(s, 40, 761, phoneCaption.lines[0], 7.5, 'TITLE');
    fittedLines(s.title, 410, 9, 2).lines.forEach((value, row) => text(s, 580, 704 + row * 12, value, 9, 'TITLE', true));
    text(s, 580, 741, s.scale === 1 ? 'SCHEDULE / NTS' : `SCALE 1:${s.scale} / ${Number((12 / s.scale).toFixed(4))} in = 1 ft`, 8.5, 'TITLE');
    text(s, 580, 757, 'MODEL: INCHES / PRINT 17 x 11 in AT 100%', 8, 'TITLE');
    text(s, 1024, 722, s.id, 24, 'TITLE', true);
    text(s, 1024, 743, `SHEET ${index + 1} OF ${set.sheets.length}`, 9, 'TITLE');
    text(s, 1024, 759, revisionCaption.lines[0], 8, 'TITLE');
    text(s, 42, 673, 'VERIFY FIELD CONDITIONS / APPROVED STRUCTURAL + MANUFACTURER DETAILS GOVERN CONNECTIONS', 7.7, 'NOTES');
  });
  set.issues = [...new Set(set.issues)];
  return set;
}
