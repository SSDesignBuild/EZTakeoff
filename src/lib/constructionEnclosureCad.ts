import type { ConsultationProject } from './consultationProject';
import { buildDeckModel } from './deckModel';
import { planRenaissanceCoverWalls } from './renaissanceCoverWallLayout';
import { currentEliteSunroomSettings, eliteWallSections, eliteWallDimensionWarnings, eliteWallBlockingIssues } from './eliteSunroomStudio';
import { sunroomRoofTopFtAt, sunroomUprightOffsetsExcludingDoor, sunroomUprightVerticalExtent,
  sunroomKickHeightFt, sunroomMainTopFt, sunroomHasTransom, sunroomDoorRect,
  sunroomWindowOpenings, sunroomSpansExcludingDoor } from './sunroomSectionGeometry';
import { ELITE_CATALOG_PROFILES, ELITE_ILLUSTRATIVE_SHEET_IN } from './eliteAddARoomExtrusions';
import { ELITE_PRIME_DOOR_HEIGHT_FT } from './elitePrimeDoorGeometry';
import { getCoverVisualProduct } from '../data/visualCatalog';
import { planLightingAddons } from './lightingAddons';
import { CAD_SHEET_WIDTH, CAD_SHEET_HEIGHT, cadFeet, line, poly, text, wrapped, dimension,
  type ConstructionSheet, type CadPoint, type CadLayer } from './constructionCadScene';

type Values = Record<string, string | number | boolean>;
const scaleFor = (n: number) => [8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256].find(s => s >= n) ?? Math.ceil(n / 96) * 96;
const ft = (n: number) => cadFeet(n * 12);
const tag = (s: ConstructionSheet, at: CadPoint, id: string, label = id) =>
  s.entities.push({ type: 'text', at, text: label, height: 8, layer: 'TAGS', sourcePartId: id, graphicRole: 'part-tag' });
const outline = (s: ConstructionSheet, points: CadPoint[], id: string, layer: CadLayer = 'OUTLINE') =>
  s.entities.push({ type: 'polyline', points, closed: true, layer, sourcePartId: id, graphicRole: 'part-outline' });

/** Project enclosure sheets consume the same seated wall endpoints, section
 * widths, sloped heads, glazing openings and light coordinates as Studio.
 * Window rectangles are gross configured openings, not factory glass cuts. */
export function buildEnclosureConstructionSheets(values: Values, source?: ConsultationProject) {
  const sheets: ConstructionSheet[] = [], issues: string[] = [], warnings: string[] = [];
  const partIds: string[] = [];
  if (!source || source.coverFamily === 'none') return { sheets, issues, warnings, partIds };
  const project = { ...source, values }, deck = buildDeckModel(values);
  const product = getCoverVisualProduct(project.coverFamily);
  const eligible = ['solid-studio', 'solid-truss-ends', 'full-trusses', 'translucent', 'lattice', 'louvered'].includes(product.family);
  if (!eligible) return { sheets, issues, warnings: ['This cover family has no verified enclosure drawing model.'], partIds };
  const height = Number(values.deckHeight ?? 0);
  const cover = planRenaissanceCoverWalls(deck, project, [0, 0], height), plan = cover.plan;
  const elite = project.coverScreenStyle === 'elite-add-a-room';
  const settings = currentEliteSunroomSettings(project), profile = ELITE_CATALOG_PROFILES[settings.roomSystem];
  const wallRuns = elite ? cover.measuredRuns : [];
  const newSheet = (id: string, title: string, scale: number): ConstructionSheet => {
    const sheet: ConstructionSheet = { id, title, scale, width: CAD_SHEET_WIDTH, height: CAD_SHEET_HEIGHT, entities: [] };
    sheets.push(sheet); return sheet;
  };
  const notes = (sheet: ConstructionSheet, title: string, lines: string[]) => {
    text(sheet, 914, 112, title, 10, 'NOTES', true);
    let y = 134;
    for (const note of lines) y = wrapped(sheet, 914, y, note, 260, 8.3, 12) + 10;
  };
  const roof = { left: cover.xMid - plan.roofWidthFt / 2, right: cover.xMid + plan.roofWidthFt / 2,
    rear: cover.theoreticalBack - plan.rearOverhangFt, front: cover.theoreticalFront + plan.frontOverhangFt };
  const minX = Math.min(deck.minX, roof.left), maxX = Math.max(deck.maxX, roof.right);
  const minY = Math.min(deck.minY, roof.rear), maxY = Math.max(deck.maxY, roof.front);
  const scale = scaleFor(Math.max((maxX - minX) * 864 / 690, (maxY - minY) * 864 / 420));
  const factor = 864 / scale, ox = 108 + (690 - (maxX - minX) * factor) / 2 - minX * factor,
    oy = 148 + (420 - (maxY - minY) * factor) / 2 - minY * factor;
  const at = (x: number, y: number) => ({ x: ox + x * factor, y: oy + y * factor });
  const overview = newSheet('E101', 'COVER / ENCLOSURE SETOUT + CEILING FIXTURE LOCATIONS', scale);
  poly(overview, deck.points.map(p => at(p.x, p.y)), 'HIDDEN', true);
  outline(overview, [at(roof.left, roof.rear), at(roof.right, roof.rear), at(roof.right, roof.front), at(roof.left, roof.front)], 'E-ROOF');
  partIds.push('E-ROOF');
  dimension(overview, at(roof.left, roof.rear), at(roof.right, roof.rear), -34, ft(plan.roofWidthFt) + ' ROOF');
  dimension(overview, at(roof.left, roof.rear), at(roof.left, roof.front), 38, ft(plan.roofProjectionFt) + ' ROOF');
  const columns = [...cover.frontPosts, ...cover.rearPosts], half = cover.profile.postOutsideIn / 24;
  columns.forEach(([x, y], i) => {
    const id = 'E-CP' + String(i + 1).padStart(2, '0'); partIds.push(id);
    outline(overview, [at(x - half, y - half), at(x + half, y - half), at(x + half, y + half), at(x - half, y + half)], id, 'POSTS');
    const p = at(x, y); tag(overview, { x: p.x + 7, y: p.y - 9 }, id, id.slice(2));
    line(overview, { x: p.x - 5, y: p.y }, { x: p.x + 5, y: p.y }, 'CENTER');
    line(overview, { x: p.x, y: p.y - 5 }, { x: p.x, y: p.y + 5 }, 'CENTER');
  });
  for (const [row, name] of [[cover.frontPosts, 'FRONT'], [cover.rearPosts, 'REAR']] as const) {
    const sorted = [...row].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) dimension(overview, at(...sorted[i - 1]), at(...sorted[i]), name === 'FRONT' ? 38 : -56);
  }
  wallRuns.forEach(run => {
    const id = 'E-WALL-' + run.id.toUpperCase(); partIds.push(id);
    const dx = run.to[0] - run.from[0], dy = run.to[1] - run.from[1], len = Math.hypot(dx, dy);
    const nx = -dy / len * profile.depthIn / 24, ny = dx / len * profile.depthIn / 24;
    outline(overview, [at(run.from[0] + nx, run.from[1] + ny), at(run.to[0] + nx, run.to[1] + ny),
      at(run.to[0] - nx, run.to[1] - ny), at(run.from[0] - nx, run.from[1] - ny)], id, 'RIMS');
    let cursor = 0;
    for (const section of eliteWallSections(project, run)) {
      const door = sunroomDoorRect(section);
      if (door) {
        const a = at(run.from[0] + dx / len * (cursor + door.start), run.from[1] + dy / len * (cursor + door.start));
        const b = at(run.from[0] + dx / len * (cursor + door.end), run.from[1] + dy / len * (cursor + door.end));
        line(overview, a, b, 'STAIRS', 2.2);
        text(overview, (a.x + b.x) / 2, (a.y + b.y) / 2 - 10, 'ENTRY ' + ft(door.end - door.start), 8, 'TAGS', true, 'center');
      }
      cursor += section.width;
    }
  });
  const lighting = planLightingAddons(project), ceiling = lighting.fixtures.filter(f => f.mounting === 'ceiling');
  ceiling.forEach((fixture, i) => {
    const [x, , y] = fixture.position, p = at(x, y), id = 'E-L' + String(i + 1).padStart(2, '0'); partIds.push(id);
    overview.entities.push({ type: 'circle', center: p, radius: Math.max(2.5, fixture.sizeFt[0] * factor / 2), layer: 'HARDWARE', sourcePartId: id, graphicRole: 'part-outline' });
    tag(overview, { x: p.x + 7, y: p.y - 8 }, id, id.slice(2));
  });
  notes(overview, 'SETOUT BASIS', [
    product.name + ' / ' + (plan.gable ? 'gable' : 'studio') + ' / ' + (plan.attached ? 'wall attached' : 'freestanding'),
    'Coordinates use the deck model origin. Post squares show the selected outside envelope; center marks locate the anchors.',
    elite ? 'Elite wall extents follow the clear opening between seated post faces. Door position follows the saved wall section.' : 'Cover setout only. Screen openings and proprietary frame details require the selected wall drawings.',
    'CP = cover post. L = ceiling fixture. Exact X/Y/Z coordinates are in the enclosure register.',
    'Roof outline is the outside roof envelope. Cover spans, fastener models and structural attachment remain manufacturer design items.',
  ]);
  const register: string[][] = columns.map(([x, y], i) => ['E-CP' + String(i + 1).padStart(2, '0'),
    'Cover post / base center', 'X ' + ft(x) + ' / Y ' + ft(y), cover.profile.postOutsideIn + ' in outside', 'Base at finished deck; use approved base/anchor detail.']);
  ceiling.forEach((f, i) => register.push(['E-L' + String(i + 1).padStart(2, '0'), f.category + (f.hasLight ? ' + light' : ''),
    'X ' + ft(f.position[0]) + ' / Y ' + ft(f.position[2]), 'Z ' + ft(f.position[1]), f.label]));
  wallRuns.forEach((run, wallIndex) => {
    const sections = eliteWallSections(project, run), wallPrefix = 'E-' + run.id.toUpperCase();
    issues.push(...eliteWallBlockingIssues(run, sections)); warnings.push(...eliteWallDimensionWarnings(run, sections));
    const maxHeight = Math.max(run.topFrom, run.topTo) - run.bottomY;
    const wallScale = scaleFor(Math.max(run.widthFt * 864 / 700, maxHeight * 864 / 400));
    const f = 864 / wallScale, x0 = 100 + (700 - run.widthFt * f) / 2, baseY = 574;
    const pt = (x: number, z: number) => ({ x: x0 + x * f, y: baseY - z * f });
    const s = newSheet('E' + (201 + wallIndex), 'ELITE ' + run.id.toUpperCase() + ' WALL / MEMBER + OPENING SETOUT', wallScale);
    dimension(s, pt(0, 0), pt(run.widthFt, 0), 40, ft(run.widthFt) + ' CLEAR WALL');
    dimension(s, pt(0, 0), pt(0, run.topFrom - run.bottomY), -36);
    dimension(s, pt(run.widthFt, 0), pt(run.widthFt, run.topTo - run.bottomY), 36);
    let cursor = 0, uprightNumber = 0, windowNumber = 0;
    for (const [sectionIndex, section] of sections.entries()) {
      const local = (x: number, z: number) => pt(cursor + x, z), prefix = wallPrefix + '-S' + (sectionIndex + 1);
      const topL = sunroomRoofTopFtAt(section, 0), topR = sunroomRoofTopFtAt(section, section.width);
      const wallId = prefix + '-FRAME'; partIds.push(wallId);
      outline(s, [local(0, 0), local(section.width, 0), local(section.width, topR), local(0, topL)], wallId);
      const slope = (topR - topL) / Math.max(.01, section.width);
      const capWeb = ELITE_ILLUSTRATIVE_SHEET_IN / 12;
      // Mirror the rendered outside envelopes, including the pitched cut
      // across each face. The cap web is illustrative, so this is setout and
      // a modeled envelope, not an approved extrusion fabrication schedule.
      const addUpright = (x: number, bottom: number, top: number, kind: string,
        reachesRoof = true, faceIn = profile.hFaceIn, flip = false, parentId?: string) => {
        const id = parentId ?? wallPrefix + '-U' + String(++uprightNumber).padStart(2, '0'); partIds.push(id);
        const face = faceIn / 12, openChannel = kind.includes('receiver') || kind.includes('DRC');
        const lo = openChannel ? (flip ? x - face : x) : x - face / 2;
        const cutTop = top - (reachesRoof ? capWeb : 0);
        const leftTop = cutTop + (reachesRoof ? (lo - x) * slope : 0);
        const rightTop = cutTop + (reachesRoof ? (lo + face - x) * slope : 0);
        outline(s, [local(lo, bottom), local(lo + face, bottom), local(lo + face, rightTop), local(lo, leftTop)], id, 'RIMS');
        if (!parentId) {
          const p = local(x, top); tag(s, { x: p.x + 3, y: p.y - 10 - (uprightNumber % 2) * 13 }, id, 'U' + String(uprightNumber).padStart(2, '0'));
          register.push([id, kind, 'Wall station ' + ft(cursor + x),
            'Bottom ' + ft(bottom) + '; top L/R ' + ft(leftTop) + ' / ' + ft(rightTop),
            'Modeled outside envelope; ' + settings.roomSystem + '. Final cuts follow supplier detail.']);
        }
        return id;
      };
      const addDrcPair = (id: string, station: number, bottom: number, top: number,
        offset: number, reachesRoof: boolean) => {
        [-1, 1].forEach((sign, j) => addUpright(station + sign * offset, bottom,
          top + (reachesRoof ? sign * offset * slope : 0), 'DRC', reachesRoof,
          profile.drcLipIn, j === 1, id + '-D' + (j + 1)));
        register.push([id + '-D1 / D2', 'DRC pair at ' + id, 'Stations ' + ft(cursor + station - offset) + ' / ' + ft(cursor + station + offset),
          '2 x ' + profile.drcLipIn + ' in outside lip', 'Follow adjoining upright end cuts; window frame deductions require supplier confirmation.']);
      };
      if (sectionIndex === 0) {
        const id = addUpright(0, 0, topL, 'end receiver', true, profile.receiverLipIn);
        const station = profile.receiverLipIn / 12;
        addUpright(station, 0, sunroomRoofTopFtAt(section, station), 'DRC', true,
          profile.drcLipIn, false, id + '-D1');
        register.push([id + '-D1', 'Receiver DRC', 'Wall station ' + ft(cursor + station), profile.drcLipIn + ' in outside lip', 'Roof-following modeled envelope; supplier end clearance applies.']);
      }
      if (sectionIndex === sections.length - 1) {
        const id = addUpright(section.width, 0, topR, 'end receiver', true, profile.receiverLipIn, true);
        const station = section.width - profile.receiverLipIn / 12;
        addUpright(station, 0, sunroomRoofTopFtAt(section, station), 'DRC', true,
          profile.drcLipIn, true, id + '-D1');
        register.push([id + '-D1', 'Receiver DRC', 'Wall station ' + ft(cursor + station), profile.drcLipIn + ' in outside lip', 'Roof-following modeled envelope; supplier end clearance applies.']);
      }
      if (sectionIndex > 0) {
        const id = addUpright(0, 0, topL, 'shared section H');
        addDrcPair(id, 0, 0, topL, profile.hFaceIn / 24, true);
      }
      const reachesRoof = section.uprightMode !== 'main-only' && section.uprightMode !== 'main-kick';
      sunroomUprightOffsetsExcludingDoor(section).forEach(x => {
        const extent = sunroomUprightVerticalExtent(section, x);
        if (extent.lengthFt < .06) return;
        const id = addUpright(x, extent.bottomFt, extent.topFt, 'H upright', reachesRoof);
        addDrcPair(id, x, extent.bottomFt, extent.topFt,
          settings.roomSystem === '3-thermal' ? .088 : .046, reachesRoof);
      });
      let horizontalNumber = 0;
      const addHorizontal = (start: number, end: number, lowL: number, lowR: number,
        highL: number, highR: number, kind: string) => {
        const id = prefix + '-H' + String(++horizontalNumber).padStart(2, '0'); partIds.push(id);
        outline(s, [local(start, lowL), local(end, lowR), local(end, highR), local(start, highL)], id, 'RIMS');
        register.push([id, kind, 'Station ' + ft(cursor + start) + ' to ' + ft(cursor + end),
          'Top L/R ' + ft(highL) + ' / ' + ft(highR), 'Modeled envelope; length ' + ft(Math.hypot(end - start, highR - highL)) + '. Confirm end deductions.']);
      };
      const kick = sunroomKickHeightFt(section), head = sunroomMainTopFt(section);
      for (const span of sunroomSpansExcludingDoor(section)) {
        addHorizontal(span.start, span.end, 0, 0,
          Math.max(profile.bottomLeftLipIn, profile.bottomRightLipIn) / 12,
          Math.max(profile.bottomLeftLipIn, profile.bottomRightLipIn) / 12, 'Base channel');
        if (kick) addHorizontal(span.start, span.end, kick - profile.hFaceIn / 24,
          kick - profile.hFaceIn / 24, kick + profile.hFaceIn / 24,
          kick + profile.hFaceIn / 24, 'Kick H break');
      }
      addHorizontal(0, section.width, topL - profile.topLipIn / 12,
        topR - profile.topLipIn / 12, topL, topR, 'Sloped top cap');
      if (sunroomHasTransom(section)) addHorizontal(0, section.width,
        head - profile.hFaceIn / 12, head - profile.hFaceIn / 12, head, head, 'Transom H break');
      for (const opening of sunroomWindowOpenings(section)) {
        const id = wallPrefix + '-W' + String(++windowNumber).padStart(2, '0'); partIds.push(id);
        outline(s, [local(opening.start, opening.bottomFt), local(opening.end, opening.bottomFt),
          local(opening.end, opening.topRightFt), local(opening.start, opening.topLeftFt)], id, 'HIDDEN');
        const p = local((opening.start + opening.end) / 2, (opening.bottomFt + Math.min(opening.topLeftFt, opening.topRightFt)) / 2);
        if (opening.zone === 'transom' && (Math.min(opening.topLeftFt, opening.topRightFt) - opening.bottomFt) * f < 28) {
          const label = { x: p.x - 8, y: local((opening.start + opening.end) / 2, head).y + 19 };
          line(s, p, { x: p.x, y: label.y - 7 }, 'DIMENSIONS', .6);
          tag(s, label, id, 'W' + String(windowNumber).padStart(2, '0'));
        } else tag(s, { x: p.x - 8, y: p.y }, id, 'W' + String(windowNumber).padStart(2, '0'));
        register.push([id, opening.zone + ' / ' + opening.style, 'Station ' + ft(cursor + opening.start) + ' to ' + ft(cursor + opening.end),
          'Width ' + ft(opening.end - opening.start) + '; H L/R ' + ft(opening.topLeftFt - opening.bottomFt) + ' / ' + ft(opening.topRightFt - opening.bottomFt),
          'Gross opening; supplier deductions apply.']);
      }
      const door = sunroomDoorRect(section);
      if (door) {
        const id = prefix + '-DOOR'; partIds.push(id);
        outline(s, [local(door.start, 0), local(door.end, 0), local(door.end, ELITE_PRIME_DOOR_HEIGHT_FT), local(door.start, ELITE_PRIME_DOOR_HEIGHT_FT)], id, 'STAIRS');
        tag(s, local(door.start + .15, 3), id, section.doorType === 'slider' ? 'SLIDER' : 'ENTRY');
        dimension(s, local(door.start, 0), local(door.end, 0), 20);
        for (const x of [door.start, door.end]) if (x > .01 && x < section.width - .01) addUpright(x, 0, sunroomRoofTopFtAt(section, x), 'door H jamb');
        register.push([id, section.doorType + ' entry', 'Station ' + ft(cursor + door.start),
          ft(door.end - door.start) + ' W x ' + ft(ELITE_PRIME_DOOR_HEIGHT_FT) + ' H', (section.doorHinge ?? 'left') + ' hinge (outside); selected frame details govern.']);
      }
      const stations = [...new Set([0, section.width, ...sunroomUprightOffsetsExcludingDoor(section), ...(door ? [door.start, door.end] : [])])].sort((a, b) => a - b);
      for (let i = 1; i < stations.length; i++) dimension(s, local(stations[i - 1], 0), local(stations[i], 0), 61);
      cursor += section.width;
    }
    notes(s, 'WALL ELEVATION BASIS', [
      'View follows the wall start-to-end direction shown by its setout coordinates. Wall stations begin at 0 at the first endpoint.',
      'Base track at Z ' + ft(run.bottomY) + '. Top at Z ' + ft(run.topFrom) + ' left / ' + ft(run.topTo) + ' right.',
      'U = receiver / H upright / jamb. W = configured opening. Refer to enclosure register for exact stations and heights.',
      'Published Elite outside profile: ' + profile.depthIn + ' in depth, ' + profile.hFaceIn + ' in H face. DRC members share the adjacent U reference. Internal screw bosses and hole patterns are not dimensioned here.',
      'These are modeled member envelopes. The cap web allowance is illustrative; final extrusion cuts and connection clearances require the supplier detail.',
      'Glazing outlines describe gross configured openings. Factory window/door deductions and installation tolerances remain the supplier schedule.',
    ]);
  });
  // Readable, complete register; each row has bounded cells and continues on
  // another sheet instead of shrinking type or truncating locations.
  let page: ConstructionSheet | undefined, rowY = 0, pageNumber = 0;
  const columnsX = [42, 214, 431, 671, 904], widths = [166, 211, 234, 227, 276];
  for (const row of register) {
    if (!page || rowY > 598) {
      page = newSheet('E' + (301 + pageNumber++), 'ENCLOSURE / CEILING MEMBER AND OPENING REGISTER', 1); rowY = 128;
      ['REFERENCE', 'COMPONENT', 'SETOUT', 'ENVELOPE / HEIGHT', 'INSTALLATION BASIS'].forEach((label, i) => text(page!, columnsX[i] + 4, 108, label, 8.2, 'NOTES', true));
      line(page, { x: 42, y: 116 }, { x: 1180, y: 116 }, 'TITLE');
      text(page, 48, 650, 'WINDOW ENVELOPES ARE GROSS OPENINGS. VERIFY SUPPLIER FRAME DEDUCTIONS BEFORE GLASS / WINDOW FABRICATION.', 7.8, 'NOTES');
    }
    const bottom = Math.max(...row.map((value, i) => wrapped(page!, columnsX[i] + 4, rowY, value, widths[i] - 8, 8, 11.5)));
    rowY = bottom + 3; line(page, { x: 42, y: rowY }, { x: 1180, y: rowY }, 'CENTER'); rowY += 10;
  }
  if (warnings.length) {
    let warningPage = newSheet('E401', 'SAVED ENCLOSURE DIMENSION REVIEW', 1), y = 114, number = 1;
    for (const warning of [...new Set(warnings)]) {
      if (y > 540) { warningPage = newSheet('E' + (401 + number++), 'SAVED ENCLOSURE DIMENSION REVIEW / CONTINUED', 1); y = 114; }
      y = wrapped(warningPage, 48, y, warning, 1120, 9, 13) + 16;
    }
  }
  return { sheets, issues: [...new Set(issues)], warnings: [...new Set(warnings)], partIds: [...new Set(partIds)] };
}
