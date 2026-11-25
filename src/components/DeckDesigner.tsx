import { MouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { buildDeckModel, parseDeckShape } from '../lib/deckModel';
import { DeckPoint, LockedPostPoint } from '../lib/types';
import { planStairFootprints } from '../lib/stairPlanGeometry';
import { readSiteConcreteAreas, planSiteConcrete, type SiteConcreteArea } from '../lib/siteConcrete';
import { ExactBeamPostLayout, ExactSupportPost, evenlySpacedPosts, parseExactPostLayouts, shiftPostLayoutIndices } from '../lib/exactPostLayouts';

const GRID_SIZE = 1 / 12;
const VIEW_SIZE = 1100;
const PADDING = 50;
const BASE_VIEW_FEET = 25;
const MAX_DRAW_VIEW_FEET = 60;
const TEN_FOOT_GRID = 10;
const ONE_FOOT_GRID = 1;
const INCH_GRID = 1 / 12;
const SNAP_TOLERANCE = 0.4;
const defaultShape: DeckPoint[] = [];

type EditMode = 'points' | 'house' | 'railing' | 'stairs' | 'beams' | 'posts' | 'concrete';
type DeckTier = 'main' | 'lower';
type ExtraStair = { edgeIndex: number; offset: number; width: number; rise?: number; left?: boolean; right?: boolean };
type BeamEdit = { beamIndex: number; startTrim: number; endTrim: number };
type Snapshot = Pick<Record<string, string | number | boolean>, 'deckShape' | 'lowerDeckShape' | 'manualRailingEdges' | 'houseEdgeIndices' | 'customBeamYs' | 'stairEdgeIndex' | 'stairOffset' | 'additionalStairs' | 'lockedPosts' | 'postLayouts' | 'beamEdits' | 'lowerManualRailingEdges' | 'lowerHouseEdgeIndices' | 'lowerCustomBeamYs' | 'lowerStairEdgeIndex' | 'lowerStairOffset' | 'lowerAdditionalStairs' | 'lowerLockedPosts' | 'lowerPostLayouts' | 'lowerBeamEdits' | 'stairRailingLeft' | 'stairRailingRight' | 'lowerStairRailingLeft' | 'lowerStairRailingRight' | 'stairCount' | 'siteConcreteAreas'>;
type DesignerHistory = { shot: Snapshot; drawingSequence: boolean; selectedIndex: number | null };

const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const parseNumberArray = (raw: string | number | boolean | undefined) => typeof raw === 'string' && raw.trim() ? JSON.parse(raw) as number[] : [];
const parseLockedPosts = (raw: string | number | boolean | undefined): LockedPostPoint[] => typeof raw === 'string' && raw.trim() ? JSON.parse(raw) as LockedPostPoint[] : [];
const parseBeamEdits = (raw: string | number | boolean | undefined): BeamEdit[] => typeof raw === 'string' && raw.trim() ? JSON.parse(raw) as BeamEdit[] : [];
const parseExtraStairs = (raw: string | number | boolean | undefined): ExtraStair[] => {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => ({
      edgeIndex: Math.max(0, Math.round(Number(item.edgeIndex ?? 0))),
      offset: Math.max(0, Number(item.offset ?? 0)),
      width: Math.max(0.1, Number(item.width ?? 4)),
      rise: Number(item.rise ?? 0),
      ...(typeof item.left === 'boolean' ? {left: item.left} : {}),
      ...(typeof item.right === 'boolean' ? {right: item.right} : {}),
    })) : [];
  } catch { return []; }
};

const polygonArea = (points: DeckPoint[]) => points.length < 3 ? 0 : Math.abs(points.reduce((sum, current, index) => {
  const next = points[(index + 1) % points.length];
  return sum + (current.x * next.y - next.x * current.y);
}, 0) / 2);

const polygonPerimeter = (points: DeckPoint[]) => points.length < 2 ? 0 : points.reduce((sum, current, index) => {
  const next = points[(index + 1) % points.length];
  return sum + Math.hypot(next.x - current.x, next.y - current.y);
}, 0);


const feetAndInches = (value: number) => {
  const totalInches = Math.round(value * 12);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches ? `${feet}' ${inches}"` : `${feet}'`;
};

const snapPointFromAnchor = (anchor: DeckPoint, point: DeckPoint) => {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.0001) return { x: snap(point.x), y: snap(point.y) };
  const rawAngle = Math.atan2(dy, dx);
  const snappedAngle = Math.round(rawAngle / (Math.PI / 4)) * (Math.PI / 4);
  if (Math.abs(rawAngle - snappedAngle) <= Math.PI / 18) {
    return { x: snap(anchor.x + Math.cos(snappedAngle) * distance), y: snap(anchor.y + Math.sin(snappedAngle) * distance) };
  }
  return { x: snap(point.x), y: snap(point.y) };
};

interface DeckDesignerProps {
  allowSiteConcrete?: boolean;
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

export function DeckDesigner({ values, onValuesChange, allowSiteConcrete = false }: DeckDesignerProps) {
  const mainPoints = useMemo(() => {
    if (typeof values.deckShape === 'string') {
      try {
        const parsed = JSON.parse(values.deckShape);
        if (Array.isArray(parsed)) return parsed as DeckPoint[];
      } catch {}
    }
    return parseDeckShape(values.deckShape);
  }, [values.deckShape]);
  const lowerPoints = useMemo(() => {
    if (typeof values.lowerDeckShape === 'string') {
      try {
        const parsed = JSON.parse(values.lowerDeckShape);
        if (Array.isArray(parsed)) return parsed as DeckPoint[];
      } catch {}
    }
    return [] as DeckPoint[];
  }, [values.lowerDeckShape]);
  const lowerTierEnabled = values.multiTierEnabled === true || String(values.multiTierEnabled ?? 'false') === 'true';
  const [activeTier, setActiveTier] = useState<DeckTier>('main');
  useEffect(() => {
    if (!lowerTierEnabled && activeTier === 'lower') {
      setActiveTier('main');
      setMode('points');
      setSelectedIndex(null);
      setDrawingSequence(mainPoints.length === 0);
    }
  }, [lowerTierEnabled, activeTier, mainPoints.length]);
  const points = activeTier === 'lower' ? lowerPoints : mainPoints;
  const activeShapeKey = activeTier === 'lower' ? 'lowerDeckShape' : 'deckShape';
  const tierKey = (mainKey: string) => activeTier === 'lower' ? `lower${mainKey.charAt(0).toUpperCase()}${mainKey.slice(1)}` : mainKey;
  const activeDeckValues = useMemo(() => {
    if (activeTier !== 'lower') return values;
    return {
      ...values,
      deckShape: values.lowerDeckShape,
      deckHeight: values.lowerDeckHeight || values.deckHeight,
      deckingType: values.lowerUseCustomSettings ? (values.lowerDeckingType || values.deckingType) : values.deckingType,
      railingType: values.lowerUseCustomSettings ? (values.lowerRailingType || values.railingType) : values.railingType,
      pictureFrameCount: values.lowerUseCustomSettings ? (values.lowerPictureFrameCount ?? values.pictureFrameCount) : values.pictureFrameCount,
      stairRailingLeft: values.lowerStairRailingLeft ?? values.stairRailingLeft,
      stairRailingRight: values.lowerStairRailingRight ?? values.stairRailingRight,
      manualRailingEdges: values.lowerManualRailingEdges || JSON.stringify([]),
      houseEdgeIndices: values.lowerHouseEdgeIndices || values.houseEdgeIndices || JSON.stringify([]),
      customBeamYs: values.lowerCustomBeamYs || JSON.stringify([]),
      stairEdgeIndex: values.lowerStairEdgeIndex ?? -1,
      stairOffset: values.lowerStairOffset ?? 0,
      additionalStairs: values.lowerAdditionalStairs || JSON.stringify([]),
      lockedPosts: values.lowerLockedPosts || JSON.stringify([]),
      postLayouts: values.lowerPostLayouts || JSON.stringify([]),
      beamEdits: values.lowerBeamEdits || JSON.stringify([]),
    };
  }, [activeTier, values]);

  const model = useMemo(() => buildDeckModel(activeDeckValues), [activeDeckValues]);
  const stairFootprints = useMemo(() => planStairFootprints(model), [model]);
  const concreteAreas = useMemo(() => readSiteConcreteAreas(values.siteConcreteAreas), [values.siteConcreteAreas]);
  const concretePlan = useMemo(() => planSiteConcrete(values), [values]);
  const [activeConcreteId, setActiveConcreteId] = useState<string | null>(null);
  const [concreteDraft, setConcreteDraft] = useState<DeckPoint[] | null>(null);
  const [concretePointIndex, setConcretePointIndex] = useState<number | null>(null);
  const [concreteFeedback, setConcreteFeedback] = useState('');
  const [draggingConcretePoint, setDraggingConcretePoint] = useState<number | null>(null);
  const activeConcrete = concreteAreas.find(area => area.id === activeConcreteId) ?? null;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<EditMode>('points');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [draggingBeamIndex, setDraggingBeamIndex] = useState<number | null>(null);
  // Pointer refs are synchronous across React batching and model rebuilds.
  // This fixes missed drags when starting a pointer gesture also persists a
  // manual support layout and re-renders the SVG on the same frame.
  const draggingBeamRef = useRef<number | null>(null);
  const draggingPostRef = useRef<{ beamIndex: number; id: string } | null>(null);
  const movedDuringGestureRef = useRef(false);
  const [selectedBeamIndex, setSelectedBeamIndex] = useState(0);
  const [draggingPost, setDraggingPost] = useState<{ beamIndex: number; id: string } | null>(null);
  const [selectedPost, setSelectedPost] = useState<{ beamIndex: number; id: string } | null>(null);
  const [postFeedback, setPostFeedback] = useState('');
  const [railingFeedback,setRailingFeedback]=useState('');
  const [draggingStair, setDraggingStair] = useState(false);
  const [activeStairIndex, setActiveStairIndex] = useState(0);
  const [drawingSequence, setDrawingSequence] = useState(points.length === 0);
  const [previewPoint, setPreviewPoint] = useState<DeckPoint | null>(null);
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState<DesignerHistory[]>([]);
  const [future, setFuture] = useState<DesignerHistory[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Stairs and concrete share the deck's measured coordinates and remain visible
  // outside its perimeter. Preserve the 25-foot empty drawing field.
  const extentPoints = [...points, ...stairFootprints.flatMap(flight => flight.corners),
    ...(allowSiteConcrete ? concreteAreas.flatMap(area => area.points) : [])];
  const originX = Math.min(0, Math.floor(Math.min(0, ...extentPoints.map(p => p.x))) - (extentPoints.some(p => p.x < 0) ? 1 : 0));
  const originY = Math.min(0, Math.floor(Math.min(0, ...extentPoints.map(p => p.y))) - (extentPoints.some(p => p.y < 0) ? 1 : 0));
  const fittedFeet = Math.max(BASE_VIEW_FEET,
    Math.max(0, ...extentPoints.map(p => p.x)) - originX + 2,
    Math.max(0, ...extentPoints.map(p => p.y)) - originY + 2);
  const viewFeet = Math.min(Math.max(MAX_DRAW_VIEW_FEET, fittedFeet), Math.max(8, Number((fittedFeet / zoom).toFixed(3))));
  const limits = {minX: originX, maxX: originX + viewFeet, minY: originY, maxY: originY + viewFeet};
  const spanX = Math.max(limits.maxX - limits.minX, 1);
  const spanY = Math.max(limits.maxY - limits.minY, 1);
  const scale = Math.min((VIEW_SIZE - PADDING * 2) / spanX, (VIEW_SIZE - PADDING * 2) / spanY);
  const drawingScale = scale;
  const railingEdges = useMemo(() => new Set(parseNumberArray(activeDeckValues.manualRailingEdges).map((value) => Math.round(value))), [activeDeckValues.manualRailingEdges]);
  const houseEdges = useMemo(() => new Set(parseNumberArray(activeDeckValues.houseEdgeIndices).map((value) => Math.round(value))), [activeDeckValues.houseEdgeIndices]);
  const beamOffsets = useMemo(() => {
    const parsed = parseNumberArray(activeDeckValues.customBeamYs);
    return parsed.length > 0 ? parsed : model.beamLines.map((line) => line.offsetFromHouse);
  }, [model.beamLines, activeDeckValues.customBeamYs]);
  const inspectedBeamIndex = clamp(selectedBeamIndex, 0, Math.max(0, model.beamLines.length - 1));
  const lockedPosts = useMemo(() => parseLockedPosts(activeDeckValues.lockedPosts), [activeDeckValues.lockedPosts]);
  const manualPostLayouts = useMemo(() => parseExactPostLayouts(activeDeckValues.postLayouts).layouts, [activeDeckValues.postLayouts]);
  const beamEdits = useMemo(() => parseBeamEdits(activeDeckValues.beamEdits), [activeDeckValues.beamEdits]);

  const snapshot = (): DesignerHistory => ({
    shot: {
      deckShape: values.deckShape,
      manualRailingEdges: values.manualRailingEdges,
      houseEdgeIndices: values.houseEdgeIndices,
      customBeamYs: values.customBeamYs,
      stairEdgeIndex: values.stairEdgeIndex,
      stairOffset: values.stairOffset,
      additionalStairs: values.additionalStairs,
      lowerDeckShape: values.lowerDeckShape,
      lockedPosts: values.lockedPosts,
      postLayouts: values.postLayouts,
      beamEdits: values.beamEdits,
      lowerManualRailingEdges: values.lowerManualRailingEdges,
      lowerHouseEdgeIndices: values.lowerHouseEdgeIndices,
      lowerCustomBeamYs: values.lowerCustomBeamYs,
      lowerStairEdgeIndex: values.lowerStairEdgeIndex,
      lowerStairOffset: values.lowerStairOffset,
      lowerAdditionalStairs: values.lowerAdditionalStairs,
      lowerLockedPosts: values.lowerLockedPosts,
      lowerPostLayouts: values.lowerPostLayouts,
      lowerBeamEdits: values.lowerBeamEdits,
      stairRailingLeft: values.stairRailingLeft,
      stairRailingRight: values.stairRailingRight,
      lowerStairRailingLeft: values.lowerStairRailingLeft,
      lowerStairRailingRight: values.lowerStairRailingRight,
      stairCount: values.stairCount,
      siteConcreteAreas: values.siteConcreteAreas,
    },
    drawingSequence,
    selectedIndex,
  });

  const applySnapshot = (entry: DesignerHistory) => {
    onValuesChange((current) => ({ ...current, ...entry.shot }));
    setDrawingSequence(entry.drawingSequence);
    setSelectedIndex(entry.selectedIndex);
    setPreviewPoint(null);
  };

  const pushHistory = () => setHistory((current) => [...current.slice(-39), snapshot()]);

  const commitChange = (producer: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => {
    pushHistory();
    setFuture([]);
    onValuesChange(producer);
  };

  const updateShape = (nextPoints: DeckPoint[], keepSelected?: number | null) => {
    commitChange((current) => ({ ...current, [activeShapeKey]: JSON.stringify(nextPoints) }));
    if (keepSelected !== undefined) setSelectedIndex(keepSelected);
  };


  const applyRectangle = () => {
    const width = Math.max(1, Number(values.quickWidth ?? 16));
    const projection = Math.max(1, Number(values.quickProjection ?? 12));
    const next = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: projection },
      { x: 0, y: projection },
    ];
    setDrawingSequence(false);
    updateShape(next, null);
  };
  const updateNumberArray = (key: string, next: number[]) => commitChange((current) => ({ ...current, [key]: JSON.stringify(next.map((value) => snap(value))) }));

  const toSvgPoint = (point: DeckPoint) => ({ x: PADDING + (point.x - limits.minX) * drawingScale, y: PADDING + (point.y - limits.minY) * drawingScale });
  const fromClientToModelPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    let x: number;
    let y: number;
    if (ctm) {
      const svgPoint = svg.createSVGPoint();
      svgPoint.x = clientX;
      svgPoint.y = clientY;
      const transformed = svgPoint.matrixTransform(ctm.inverse());
      x = transformed.x;
      y = transformed.y;
    } else {
      const rect = svg.getBoundingClientRect();
      x = ((clientX - rect.left) / rect.width) * VIEW_SIZE;
      y = ((clientY - rect.top) / rect.height) * VIEW_SIZE;
    }
    const modelX = limits.minX + (x - PADDING) / drawingScale;
    const modelY = limits.minY + (y - PADDING) / drawingScale;
    return { x: snap(clamp(modelX, limits.minX, limits.maxX)), y: snap(clamp(modelY, limits.minY, limits.maxY)) };
  };

  useEffect(() => {
    if (points.length === 0) {
      setDrawingSequence(true);
      setSelectedIndex(null);
      setPreviewPoint(null);
    }
  }, [points.length]);

  const constrainedPoint = (index: number, point: DeckPoint) => {
    const anchor = points[(index - 1 + points.length) % points.length] ?? points[0] ?? point;
    const angled = snapPointFromAnchor(anchor, point);
    if (points.length < 3) return angled;
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    let x = angled.x;
    let y = angled.y;
    [prev.x, next.x].forEach((candidate) => { if (Math.abs(candidate - x) <= SNAP_TOLERANCE) x = candidate; });
    [prev.y, next.y].forEach((candidate) => { if (Math.abs(candidate - y) <= SNAP_TOLERANCE) y = candidate; });
    return { x: snap(x), y: snap(y) };
  };

  const appendPoint = (point: DeckPoint) => {
    const resolved = points.length ? snapPointFromAnchor(points[points.length - 1], point) : { x: snap(point.x), y: snap(point.y) };
    const next = [...points, resolved];
    commitChange((current) => ({ ...current, [activeShapeKey]: JSON.stringify(next) }));
    setSelectedIndex(next.length - 1);
  };

  const finishDrawing = () => {
    if (points.length < 3) return;
    pushHistory();
    setFuture([]);
    setDrawingSequence(false);
    setSelectedIndex(null);
    setPreviewPoint(null);
  };

  const handleCanvasClick = (event: MouseEvent<SVGSVGElement>) => {
    const point = fromClientToModelPoint(event.clientX, event.clientY);
    if (!point) return;
    if (mode === 'concrete') {
      if (concreteDraft) {
        const last = concreteDraft[concreteDraft.length - 1];
        const next = last ? snapPointFromAnchor(last, point) : point;
        if (!last || Math.hypot(last.x - next.x, last.y - next.y) > .01)
          setConcreteDraft([...concreteDraft, next]);
      }
      return;
    }
    if (mode === 'points') {
      if (drawingSequence) appendPoint({ x: clamp(point.x, limits.minX, limits.maxX), y: clamp(point.y, limits.minY, limits.maxY) });
      return;
    }
    // An alternative to drag, useful on touchscreens and in browsers that
    // drop pointer capture during React updates. Select a beam/post then click
    // an unoccupied location on the grid to place it precisely.
    if (movedDuringGestureRef.current) {
      movedDuringGestureRef.current = false;
      return;
    }
    if ((event.target as Element).closest?.('.beam-drag-hit,.beam-drag-handle,.post-lock,.deck-point,.stair-handle')) return;
    if (mode === 'beams') {
      const station = model.joistDirection === 'vertical' ? point.y - model.minY : point.x - model.minX;
      moveBeamStation(inspectedBeamIndex, station);
    }
    if (mode === 'posts') {
      const beamIndex = selectedPost?.beamIndex ?? inspectedBeamIndex;
      const post = selectedPost ? model.beamLines[beamIndex]?.postSpecs.find((p) => p.id === selectedPost.id)
        : model.beamLines[beamIndex]?.postSpecs[0];
      if (!post) return;
      const station = model.joistDirection === 'vertical' ? point.x : point.y;
      movePostToStation(beamIndex, post.id, station);
    }
  };

  const updatePoint = (index: number, axis: 'x' | 'y', nextValue: number) => {
    const next = points.map((point, currentIndex) => currentIndex === index ? { ...point, [axis]: snap(nextValue) } : point);
    updateShape(next, index);
  };

  const nudgeSelectedPoint = (axis: 'x' | 'y', direction: -1 | 1) => {
    if (selectedIndex === null) return;
    const currentPoint = points[selectedIndex];
    updatePoint(selectedIndex, axis, currentPoint[axis] + (direction * INCH_GRID));
  };

  const insertPointAtEdge = (edgeIndex: number) => {
    const start = points[edgeIndex];
    const end = points[(edgeIndex + 1) % points.length];
    const mid = { x: snap((start.x + end.x) / 2), y: snap((start.y + end.y) / 2) };
    const next = [...points.slice(0, edgeIndex + 1), mid, ...points.slice(edgeIndex + 1)];
    updateShape(next, edgeIndex + 1);
  };

  const removeSelected = () => {
    if (selectedIndex === null || points.length <= 3) return;
    setSelectedIndex(null);
    updateShape(points.filter((_, index) => index !== selectedIndex), null);
  };

  const resetShape = () => {
    pushHistory();
    setFuture([]);
    setDrawingSequence(true);
    setSelectedIndex(null);
    setPreviewPoint(null);
    onValuesChange((current) => ({ ...current, [activeShapeKey]: JSON.stringify(defaultShape), ...(activeTier === 'main' ? { manualRailingEdges: JSON.stringify([]), houseEdgeIndices: JSON.stringify([]), customBeamYs: JSON.stringify([]), lockedPosts: JSON.stringify([]), postLayouts: JSON.stringify([]), beamEdits: JSON.stringify([]), stairEdgeIndex: -1, stairOffset: 0, stairCount: 0, additionalStairs: JSON.stringify([]) } : { lowerManualRailingEdges: JSON.stringify([]), lowerHouseEdgeIndices: JSON.stringify([]), lowerCustomBeamYs: JSON.stringify([]), lowerLockedPosts: JSON.stringify([]), lowerPostLayouts: JSON.stringify([]), lowerBeamEdits: JSON.stringify([]), lowerStairEdgeIndex: -1, lowerStairOffset: 0, lowerAdditionalStairs: JSON.stringify([]) }) }));
  };

  const toggleRailingEdge = (edgeIndex: number) => {
    const next = new Set(railingEdges);
    const removed=next.has(edgeIndex);
    if(removed)next.delete(edgeIndex);else next.add(edgeIndex);
    updateNumberArray(tierKey('manualRailingEdges'), Array.from(next.values()));
    setRailingFeedback('Edge '+(edgeIndex+1)+' · '+(removed?'Railing removed':'Railing added')
      +' · '+next.size+' selected edge(s)');
  };

  const toggleHouseEdge = (edgeIndex: number) => {
    const next = new Set(houseEdges);
    if (next.has(edgeIndex)) next.delete(edgeIndex); else next.add(edgeIndex);
    updateNumberArray(tierKey('houseEdgeIndices'), Array.from(next.values()));
  };

  const extraStairs = useMemo(() => parseExtraStairs(activeDeckValues.additionalStairs), [activeDeckValues.additionalStairs]);
  const updateExtraStairs = (next: ExtraStair[]) => commitChange((current) => ({ ...current, [tierKey('additionalStairs')]: JSON.stringify(next) }));
  const activeExtraIndex = activeStairIndex - 1;
  const toggleStairRailing = (sourceIndex: number, side: 'left' | 'right', enabled: boolean) => {
    if (sourceIndex === 0) {
      commitChange(current => ({...current,
        [tierKey(side === 'left' ? 'stairRailingLeft' : 'stairRailingRight')]: enabled}));
    } else {
      const next = extraStairs.map((flight, index) => index === sourceIndex - 1
        ? {...flight, [side]: enabled} : flight);
      updateExtraStairs(next);
    }
    setRailingFeedback('Stair ' + (sourceIndex + 1) + ' ' + side + ' railing ' + (enabled ? 'added' : 'removed'));
  };

  const writeConcrete = (areas: SiteConcreteArea[]) => commitChange(current => ({
    ...current, siteConcreteAreas: JSON.stringify(areas),
  }));
  const updateConcrete = (patch: Partial<SiteConcreteArea>) => {
    if (!activeConcrete) return;
    writeConcrete(concreteAreas.map(area => area.id === activeConcrete.id ? {...area, ...patch} : area));
  };
  const finishConcrete = () => {
    if (!concreteDraft || concreteDraft.length < 3) return;
    const area: SiteConcreteArea = {id: 'concrete-' + crypto.randomUUID(),
      name: 'Concrete ' + (concreteAreas.length + 1), points: concreteDraft,
      thicknessIn: 4, elevationFt: .055};
    const candidate = [...concreteAreas, area];
    const plan = planSiteConcrete({...values, siteConcreteAreas: JSON.stringify(candidate)});
    if (plan.areas.length !== candidate.length) {
      setConcreteFeedback(plan.validationIssues.join(' ') || 'Close a simple concrete outline with at least three separate corners.');
      return;
    }
    writeConcrete(candidate);
    setActiveConcreteId(area.id);
    setConcreteDraft(null);
    setConcretePointIndex(null);
    setConcreteFeedback('Concrete area added. Select its corners or edit its position and thickness.');
  };
  const moveConcrete = (axis: 'x' | 'y', value: number) => {
    if (!activeConcrete || !Number.isFinite(value)) return;
    const previous = Math.min(...activeConcrete.points.map(point => point[axis]));
    const delta = snap(value) - previous;
    updateConcrete({points: activeConcrete.points.map(point => ({...point, [axis]: snap(point[axis] + delta)}))});
  };
  const updateConcretePoint = (index: number, axis: 'x' | 'y', value: number) => {
    if (!activeConcrete || !Number.isFinite(value)) return;
    updateConcrete({points: activeConcrete.points.map((point, i) => i === index ? {...point, [axis]: snap(value)} : point)});
  };
  const selectStairEdge = (edgeIndex: number) => commitChange((current) => {
    if (activeStairIndex <= 0) return { ...current, [tierKey('stairEdgeIndex')]: edgeIndex, [tierKey('stairOffset')]: 0, stairCount: Math.max(1, Number(current.stairCount ?? 0)) };
    const next = [...extraStairs];
    const existing = next[activeExtraIndex] ?? { edgeIndex, offset: 0, width: Number(current.stairWidth ?? 4), rise: Number(current.stairRise ?? 0), left: current.stairRailingLeft !== false, right: current.stairRailingRight !== false };
    next[activeExtraIndex] = { ...existing, edgeIndex, offset: 0, width: Number(existing.width ?? current.stairWidth ?? 4) };
    return { ...current, [tierKey('additionalStairs')]: JSON.stringify(next) };
  });
  const addExtraStair = () => {
    const next = [...extraStairs, { edgeIndex: Math.max(0, Number(activeDeckValues.stairEdgeIndex ?? 0)), offset: Number(activeDeckValues.stairOffset ?? 0), width: Number(values.stairWidth ?? 4), rise: Number(values.stairRise ?? 0), left: values.stairRailingLeft !== false, right: values.stairRailingRight !== false }];
    updateExtraStairs(next);
    setActiveStairIndex(next.length);
    setMode('stairs');
  };
  const removeExtraStair = (index: number) => {
    updateExtraStairs(extraStairs.filter((_, currentIndex) => currentIndex !== index));
    setActiveStairIndex(0);
  };
  // Every straight support line has exactly one editable station. Moving a
  // line writes the FULL ordered plan, ensuring the old automatic notch-beam
  // generator cannot silently reinsert a phantom segment.
  const moveBeamStation = (index: number, proposed: number, dragging = false) => {
    const line = model.beamLines[index];
    if (!line || !Number.isFinite(proposed)) {
      setPostFeedback('Enter a valid beam station in feet.'); return;
    }
    if (line.postMode === 'manual' && line.postSpecs.some((post) => post.locked)) {
      setPostFeedback('Beam ' + (index + 1) + ' contains locked support posts. Unlock those posts before moving the beam.'); return;
    }
    const length = model.joistDirection === 'vertical' ? model.depth : model.width;
    const canTouchEdge = model.attachment === 'freestanding' || model.attachment === 'brick';
    const low = index === 0 ? (canTouchEdge ? 0 : 0.25) : beamOffsets[index - 1] + 0.25;
    const high = index === beamOffsets.length - 1 ? (canTouchEdge ? length : length - 0.25) : beamOffsets[index + 1] - 0.25;
    if (low > high) {
      setPostFeedback('Beam stations are too close together. Remove or separate neighboring beams first.'); return;
    }
    if (!dragging && (proposed < low - 0.0001 || proposed > high + 0.0001)) {
      setPostFeedback('Beam ' + (index + 1) + ' must remain between ' + feetAndInches(low) + ' and ' + feetAndInches(high) + '.'); return;
    }
    const station = snap(clamp(proposed, low, high));
    if (Math.abs(station - beamOffsets[index]) < 0.001) return;
    const apply = (current: Record<string, string | number | boolean>) => ({
      ...current,
      [tierKey('customBeamYs')]: JSON.stringify(beamOffsets.map((value, i) => i === index ? station : value)),
    });
    if (dragging) onValuesChange(apply);
    else commitChange(apply);
    setPostFeedback('');
    setSelectedBeamIndex(index);
  };
  const addBeamLine = () => {
    const length = model.joistDirection === 'vertical' ? model.depth : model.width;
    const limits = [0, ...beamOffsets, length].sort((a, b) => a - b);
    const gaps = limits.slice(1).map((end, i) => ({ start: limits[i], end, width: end - limits[i] }))
      .filter((gap) => gap.width > 0.75).sort((a, b) => b.width - a.width);
    if (!gaps.length) { setPostFeedback('No open beam bay is wide enough for another line.'); return; }
    const gap = gaps[0];
    const station = snap((gap.start + gap.end) / 2);
    if (beamOffsets.some((offset) => Math.abs(offset - station) < 0.25)) {
      setPostFeedback('New beam would overlap an existing beam.'); return;
    }
    const index = beamOffsets.filter((offset) => offset < station).length;
    commitChange((current) => ({
      ...current,
      [tierKey('customBeamYs')]: JSON.stringify([...beamOffsets, station].sort((a,b)=>a-b)),
      [tierKey('postLayouts')]: JSON.stringify(shiftPostLayoutIndices(manualPostLayouts, index, 'insert')),
      [tierKey('lockedPosts')]: JSON.stringify(lockedPosts.map((p) => ({ ...p, beamIndex: p.beamIndex >= index ? p.beamIndex + 1 : p.beamIndex }))),
      [tierKey('beamEdits')]: JSON.stringify(beamEdits.map((b) => ({ ...b, beamIndex: b.beamIndex >= index ? b.beamIndex + 1 : b.beamIndex }))),
    }));
    setSelectedBeamIndex(index);
    setPostFeedback('');
  };
  const removeBeamLine = (index: number) => {
    if (beamOffsets.length <= 1) {
      setPostFeedback('At least one beam line must remain. Use Reset beams & supports to restore automatic layout.'); return;
    }
    commitChange((current) => ({
      ...current,
      [tierKey('customBeamYs')]: JSON.stringify(beamOffsets.filter((_, currentIndex) => currentIndex !== index)),
      [tierKey('beamEdits')]: JSON.stringify(beamEdits.filter((item) => item.beamIndex !== index).map((item) => ({ ...item, beamIndex: item.beamIndex > index ? item.beamIndex - 1 : item.beamIndex }))),
      [tierKey('lockedPosts')]: JSON.stringify(lockedPosts.filter((item) => item.beamIndex !== index).map((item) => ({ ...item, beamIndex: item.beamIndex > index ? item.beamIndex - 1 : item.beamIndex }))),
      [tierKey('postLayouts')]: JSON.stringify(shiftPostLayoutIndices(manualPostLayouts, index, 'remove')),
    }));
    setSelectedBeamIndex(Math.max(0, Math.min(index, beamOffsets.length - 2)));
  };
  const resetBeamLayout = () => {
    commitChange((current) => ({
      ...current,
      [tierKey('customBeamYs')]: JSON.stringify([]),
      [tierKey('postLayouts')]: JSON.stringify([]),
      [tierKey('lockedPosts')]: JSON.stringify([]),
      [tierKey('beamEdits')]: JSON.stringify([]),
    }));
    setSelectedBeamIndex(0);
    setPostFeedback('Automatic beams and support posts restored. Undo is available if needed.');
  };

  const updateBeamEdit = (index: number, key: 'startTrim' | 'endTrim', value: number) => commitChange((current) => {
    const next = [...beamEdits];
    const match = next.findIndex((item) => item.beamIndex === index);
    const safe = Math.max(0, snap(value));
    if (match >= 0) next[match] = { ...next[match], [key]: safe };
    else next.push({ beamIndex: index, startTrim: key === 'startTrim' ? safe : 0, endTrim: key === 'endTrim' ? safe : 0 });
    return { ...current, [tierKey('beamEdits')]: JSON.stringify(next.sort((a, b) => a.beamIndex - b.beamIndex)) };
  });
  const manualizePostBeam = (beamIndex: number): ExactBeamPostLayout =>
    manualPostLayouts.find((layout) => layout.beamIndex === beamIndex) ?? {
      beamIndex,
      posts: model.beamLines[beamIndex].postSpecs.map((post) => ({ ...post })),
    };
  const writePostLayouts = (layouts: ExactBeamPostLayout[]) => commitChange((current) => ({
    ...current,
    [tierKey('customBeamYs')]: JSON.stringify(beamOffsets),
    [tierKey('postLayouts')]: JSON.stringify(layouts),
    [tierKey('lockedPosts')]: JSON.stringify(lockedPosts.filter((post) => !layouts.some((layout) => layout.beamIndex === post.beamIndex))),
  }));
  const replacePostBeam = (layout: ExactBeamPostLayout) => writePostLayouts([
    ...manualPostLayouts.filter((entry) => entry.beamIndex !== layout.beamIndex), layout,
  ].sort((a, b) => a.beamIndex - b.beamIndex));
  const evenlySpaceBeamPosts = (beamIndex: number, count: number) => {
    const manual = manualizePostBeam(beamIndex);
    if (manual.posts.some((post) => post.locked)) {
      setPostFeedback('Unlock all posts on beam ' + (beamIndex + 1) + ' before redistributing.'); return;
    }
    try {
      const stations = evenlySpacedPosts(model.beamLines[beamIndex].segments, count, Number(activeDeckValues.beamCantilever ?? 2));
      replacePostBeam({ beamIndex, posts: stations.map((x, index) => ({ id: 'manual-' + beamIndex + '-' + index, x, locked: false })) });
      setPostFeedback('Beam ' + (beamIndex + 1) + ' now has exactly ' + stations.length + ' supports. Confirm the layout with your engineer.');
    } catch (error) { setPostFeedback(error instanceof Error ? error.message : String(error)); }
  };
  const addBeamPost = (beamIndex: number) => {
    const beam = model.beamLines[beamIndex];
    const manual = manualizePostBeam(beamIndex);
    const gaps = beam.segments.flatMap((segment) => {
      const stations = [segment.startX, ...manual.posts.map((post) => post.x).filter((x) => x > segment.startX && x < segment.endX).sort((a,b)=>a-b), segment.endX];
      return stations.slice(1).map((x, index) => ({ start: stations[index], end: x, length: x - stations[index] }));
    }).sort((a,b)=>b.length-a.length);
    const gap = gaps[0];
    if (!gap) return;
    const x = snap((gap.start + gap.end)/2);
    if (manual.posts.some((post) => Math.abs(post.x - x) < 1/12)) { setPostFeedback('No valid insertion gap.'); return; }
    let idIndex = 1;
    while (manual.posts.some((post) => post.id === 'manual-' + beamIndex + '-' + idIndex)) idIndex++;
    replacePostBeam({ ...manual, posts: [...manual.posts, { id: 'manual-' + beamIndex + '-' + idIndex, x, locked: false }] });
  };
  const updateBeamPost = (beamIndex: number, id: string, change: Partial<ExactSupportPost>) => {
    const beam = model.beamLines[beamIndex];
    const manual = manualizePostBeam(beamIndex);
    const target = manual.posts.find((post) => post.id === id);
    if (!target) return;
    if (target.locked && change.x !== undefined) { setPostFeedback('Unlock the post before moving it.'); return; }
    const proposed = change.x === undefined ? undefined : snap(change.x);
    if (proposed !== undefined && (!Number.isFinite(proposed) ||
      !beam.segments.some((segment) => proposed >= segment.startX - 0.005 && proposed <= segment.endX + 0.005) ||
      manual.posts.some((post) => post.id !== id && Math.abs(post.x - proposed) < 1/12 - 0.00001))) {
      setPostFeedback('Post location must be on the beam and at least one inch from another post.'); return;
    }
    replacePostBeam({ ...manual, posts: manual.posts.map((post) => post.id === id ? { ...post, ...change, ...(proposed === undefined ? {} : { x: proposed }) } : post) });
    setPostFeedback('');
  };
  const removeBeamPost = (beamIndex: number, id: string) => {
    const manual = manualizePostBeam(beamIndex);
    const post = manual.posts.find((entry) => entry.id === id);
    if (!post || post.locked) { setPostFeedback('Unlock this post before removal.'); return; }
    replacePostBeam({ ...manual, posts: manual.posts.filter((entry) => entry.id !== id) });
    setSelectedPost(null);
  };
  const resetBeamPosts = (beamIndex: number) => {
    writePostLayouts(manualPostLayouts.filter((layout) => layout.beamIndex !== beamIndex));
    setPostFeedback('Automatic post placement restored for beam ' + (beamIndex + 1) + '.');
  };

  const undo = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [snapshot(), ...current]);
    applySnapshot(previous);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture((current) => current.slice(1));
    setHistory((current) => [...current, snapshot()]);
    applySnapshot(next);
  };

  const onPointPointerDown = (event: PointerEvent<SVGCircleElement>, index: number) => {
    if (drawingSequence) return;
    event.preventDefault();
    setMode('points');
    setSelectedIndex(index);
    pushHistory();
    setFuture([]);
    setDraggingIndex(index);
  };

  // Reusable station update for both dragging and click-to-place; the first
  // edit converts automatic supports to a saved manual layout without losing
  // the point reference across renders.
  const movePostToStation = (beamIndex: number, id: string, wanted: number, dragging = false) => {
    const beam = model.beamLines[beamIndex];
    const post = beam?.postSpecs.find((item) => item.id === id);
    if (!beam || !post || !Number.isFinite(wanted)) return;
    if (post.locked) {
      setPostFeedback('Unlock ' + id + ' before repositioning this support.');
      return;
    }
    const run = beam.segments.find((seg) => post.x >= seg.startX - .005 && post.x <= seg.endX + .005);
    if (!run) {
      setPostFeedback('The support no longer lies within a continuous beam run; reset it or update its station.');
      return;
    }
    const station = snap(clamp(wanted, run.startX, run.endX));
    if (beam.postSpecs.some((other) => other.id !== id && Math.abs(other.x - station) < 1 / 12 - .00001)) {
      setPostFeedback('Support posts must have at least 1 inch of distinct station spacing.');
      return;
    }
    const layouts = manualPostLayouts.some((l) => l.beamIndex === beamIndex)
      ? manualPostLayouts : [...manualPostLayouts, manualizePostBeam(beamIndex)];
    const apply = (current: Record<string, string | number | boolean>) => ({
      ...current,
      [tierKey('customBeamYs')]: JSON.stringify(beamOffsets),
      [tierKey('postLayouts')]: JSON.stringify(layouts.map((l) =>
        l.beamIndex === beamIndex ? {...l, posts: l.posts.map((p) => p.id === id ? {...p, x: station} : p)} : l)),
      [tierKey('lockedPosts')]: JSON.stringify(lockedPosts.filter((item) => item.beamIndex !== beamIndex)),
    });
    if (dragging) onValuesChange(apply);
    else commitChange(apply);
    setPostFeedback('');
    setSelectedPost({beamIndex,id});
    setSelectedBeamIndex(beamIndex);
  };
  const onBeamPointerDown = (event: PointerEvent<SVGElement>, index: number) => {
    if (mode === 'posts') return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedBeamIndex(index);
    setMode('beams');
    if (model.beamLines[index].postSpecs.some((post) => post.locked) && model.beamLines[index].postMode === 'manual') {
      setPostFeedback('Unlock locked posts in Beam ' + (index + 1) + ' before moving it.'); return;
    }
    pushHistory();
    setFuture([]);
    movedDuringGestureRef.current = false;
    draggingBeamRef.current = index;
    setDraggingBeamIndex(index);
    try { svgRef.current?.setPointerCapture(event.pointerId); } catch { /* browser did not capture pointer */ }
  };

  const onPostPointerDown = (event: PointerEvent<SVGRectElement>, beamIndex: number, id: string) => {
    if (mode !== 'posts') return;
    event.preventDefault();
    event.stopPropagation();
    setMode('posts');
    setSelectedPost({ beamIndex, id });
    setSelectedBeamIndex(beamIndex);
    pushHistory();
    setFuture([]);
    const beam = manualizePostBeam(beamIndex);
    if (!manualPostLayouts.some((layout) => layout.beamIndex === beamIndex)) {
      onValuesChange((current) => ({
        ...current,
        [tierKey('postLayouts')]: JSON.stringify([...manualPostLayouts, beam]),
        [tierKey('customBeamYs')]: JSON.stringify(beamOffsets),
        [tierKey('lockedPosts')]: JSON.stringify(lockedPosts.filter((post) => post.beamIndex !== beamIndex)),
      }));
    }
    if (!beam.posts.some((post) => post.id === id && post.locked)) {
      movedDuringGestureRef.current = false;
      draggingPostRef.current = { beamIndex, id };
      setDraggingPost({ beamIndex, id });
      try { svgRef.current?.setPointerCapture(event.pointerId); } catch { /* click-to-position still available */ }
    }
  };

  const onStairPointerDown = (event: PointerEvent<SVGLineElement>, sourceIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveStairIndex(sourceIndex);
    setMode('stairs');
    pushHistory();
    setFuture([]);
    setDraggingStair(true);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = fromClientToModelPoint(event.clientX, event.clientY);
    if (!point) return;
    if (mode === 'concrete') {
      if (draggingConcretePoint !== null && activeConcrete) {
        const next = concreteAreas.map(area => area.id === activeConcrete.id ? {...area,
          points: area.points.map((existing, index) => index === draggingConcretePoint ? point : existing)} : area);
        onValuesChange(current => ({...current, siteConcreteAreas: JSON.stringify(next)}));
      } else if (concreteDraft) {
        const last = concreteDraft[concreteDraft.length - 1];
        setPreviewPoint(last ? snapPointFromAnchor(last, point) : point);
      }
      return;
    }
    if (drawingSequence && mode === 'points') {
      const preview = points.length ? snapPointFromAnchor(points[points.length - 1], point) : point;
      setPreviewPoint({ x: clamp(preview.x, limits.minX, limits.maxX), y: clamp(preview.y, limits.minY, limits.maxY) });
      return;
    }
    const activePostDrag = draggingPostRef.current ?? draggingPost;
    if (activePostDrag !== null) {
      movedDuringGestureRef.current = true;
      const {beamIndex,id}=activePostDrag;
      const station = model.joistDirection === 'vertical' ? point.x : point.y;
      movePostToStation(beamIndex,id,station,true);
      return;
    }
    if (draggingIndex !== null) {
      const next = points.map((current, index) => index === draggingIndex ? constrainedPoint(index, point) : current);
      onValuesChange((current) => ({ ...current, [activeShapeKey]: JSON.stringify(next) }));
      return;
    }
    const activeBeamDrag = draggingBeamRef.current ?? draggingBeamIndex;
    if (activeBeamDrag !== null) {
      movedDuringGestureRef.current = true;
      const along = model.joistDirection === 'vertical' ? point.y - model.minY : point.x - model.minX;
      moveBeamStation(activeBeamDrag, along, true);
      return;
    }
    if (draggingStair) {
      const activePlacement = model.stairPlacements.find((placement, index) => (placement.sourceIndex ?? index) === activeStairIndex);
      if (!activePlacement || activePlacement.edgeIndex === null) return;
      const edge = model.edgeSegments[activePlacement.edgeIndex];
      const dx = edge.end.x - edge.start.x;
      const dy = edge.end.y - edge.start.y;
      const lenSq = (dx * dx) + (dy * dy) || 1;
      const projection = ((((point.x - edge.start.x) * dx) + ((point.y - edge.start.y) * dy)) / lenSq) * edge.length;
      const nextWidth = activeStairIndex <= 0 ? model.stairPlacement.width : Number(extraStairs[activeExtraIndex]?.width ?? model.stairPlacement.width);
      const nextOffset = Math.max(0, Math.min(edge.length - nextWidth, projection));
      if (activeStairIndex <= 0) onValuesChange((current) => ({ ...current, [tierKey('stairOffset')]: snap(nextOffset) }));
      else onValuesChange((current) => { const next = [...extraStairs]; if (next[activeExtraIndex]) next[activeExtraIndex] = { ...next[activeExtraIndex], offset: snap(nextOffset) }; return { ...current, [tierKey('additionalStairs')]: JSON.stringify(next) }; });
    }
  };

  useEffect(() => {
    const release = () => {
      draggingBeamRef.current = null;
      draggingPostRef.current = null;
      setDraggingIndex(null);
      setDraggingBeamIndex(null);
      setDraggingPost(null);
      setDraggingStair(false);
      setDraggingConcretePoint(null);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  const lastPoint = points[points.length - 1] ?? null;
  const previewDelta = lastPoint && previewPoint ? { dx: previewPoint.x - lastPoint.x, dy: previewPoint.y - lastPoint.y, distance: Math.hypot(previewPoint.x - lastPoint.x, previewPoint.y - lastPoint.y) } : null;
  const previewMid = lastPoint && previewPoint ? { x: (lastPoint.x + previewPoint.x) / 2, y: (lastPoint.y + previewPoint.y) / 2 } : null;

  return (
    <div className="content-card deck-designer-card">
      <div className="section-heading inline-heading">
        <div>
          <p className="eyebrow">Deck layout</p>
          <h3>Draw the footprint</h3>
        </div>
        <div className="tag-row">
          <span className="tag">Snap: 1 in</span>
          <span className="tag">Tier: {activeTier === 'main' ? 'upper/main' : 'lower'}</span><span className="tag">Points: {points.length}</span>
          <span className="tag">Mode: {drawingSequence ? 'drawing' : mode}</span>
          <button type="button" className="ghost-btn small-btn" onClick={() => setZoom((current) => Math.max(0.45, Number((current - 0.1).toFixed(2))))}>−</button>
          <span className="tag">Zoom {Math.round(zoom * 100)}%</span>
          <button type="button" className="ghost-btn small-btn" onClick={() => setZoom((current) => Math.min(3, Number((current + 0.1).toFixed(2))))}>+</button>
          <span className="tag">Field {feetAndInches(viewFeet)} × {feetAndInches(viewFeet)}</span>
        </div>
      </div>
      <div className="designer-mode-row tidy-mode-row">
        <button type="button" className={activeTier === 'main' ? 'secondary-btn mode-btn active' : 'ghost-btn mode-btn'} onClick={() => { setActiveTier('main'); setMode('points'); setSelectedIndex(null); setDrawingSequence(mainPoints.length === 0); }}>Main deck shape</button>
        {lowerTierEnabled && <button type="button" className={activeTier === 'lower' ? 'secondary-btn mode-btn active' : 'ghost-btn mode-btn'} onClick={() => { setActiveTier('lower'); setMode('points'); setSelectedIndex(null); setDrawingSequence(lowerPoints.length === 0); }}>Lower tier shape</button>}
        {(['points', 'house', 'beams', 'posts', 'railing', 'stairs', ...(allowSiteConcrete ? ['concrete'] : [])] as EditMode[]).map((item) => (
          <button key={item} type="button" className={mode === item ? 'secondary-btn mode-btn active' : 'ghost-btn mode-btn'} onClick={() => setMode(item)}>
            {item === 'points' ? (drawingSequence ? 'Draw footprint' : 'Edit points') : item === 'house' ? 'Pick house sides' : item === 'railing' ? 'Pick railing edges' : item === 'stairs' ? 'Place stairs' : item === 'beams' ? 'Move beams' : item === 'concrete' ? 'Draw concrete' : 'Edit posts'}
          </button>
        ))}
        <button type="button" className="ghost-btn mode-btn" onClick={undo} disabled={!history.length}>Undo</button>
        <button type="button" className="ghost-btn mode-btn" onClick={redo} disabled={!future.length}>Redo</button>
      </div>
      <div className="deck-designer-grid enhanced-deck-grid cad-designer-grid">
        <div className="deck-canvas-wrap centered-canvas-wrap full-grid-canvas-wrap">
          <div className="designer-scroll-shell fixed-canvas-shell no-scroll-shell">
          {points.length === 0 && <div className="empty-designer-state"><p>Click anywhere on the canvas to place point P1. Each next click places the next corner. Click back on P1 to close the shape.</p></div>}
          {drawingSequence && points.length > 0 && <div className="empty-designer-state drawing-hint drawing-hint-bottom"><p>Place point P{points.length + 1}. When ready, click P1 to close the deck. Live segment: {previewDelta ? `${feetAndInches(previewDelta.distance)} · ΔX ${feetAndInches(Math.abs(previewDelta.dx))} · ΔY ${feetAndInches(Math.abs(previewDelta.dy))}` : 'move the cursor to preview the next segment'}</p></div>}
          <svg ref={svgRef} viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="deck-canvas" onClick={handleCanvasClick} onPointerMove={handlePointerMove} onPointerLeave={() => setPreviewPoint(null)}>
            <rect x={PADDING} y={PADDING} width={VIEW_SIZE - PADDING * 2} height={VIEW_SIZE - PADDING * 2} className="canvas-background" rx="8" />
            {(() => {
              const inchXs: number[] = [];
              const inchYs: number[] = [];
              const footXs: number[] = [];
              const footYs: number[] = [];
              const tenXs: number[] = [];
              const tenYs: number[] = [];
              for (let x = Math.ceil(limits.minX / INCH_GRID) * INCH_GRID; x <= limits.maxX + 1e-6; x += INCH_GRID) inchXs.push(Number(x.toFixed(6)));
              for (let y = Math.ceil(limits.minY / INCH_GRID) * INCH_GRID; y <= limits.maxY + 1e-6; y += INCH_GRID) inchYs.push(Number(y.toFixed(6)));
              for (let x = Math.ceil(limits.minX / ONE_FOOT_GRID) * ONE_FOOT_GRID; x <= limits.maxX + 1e-6; x += ONE_FOOT_GRID) footXs.push(Number(x.toFixed(6)));
              for (let y = Math.ceil(limits.minY / ONE_FOOT_GRID) * ONE_FOOT_GRID; y <= limits.maxY + 1e-6; y += ONE_FOOT_GRID) footYs.push(Number(y.toFixed(6)));
              for (let x = Math.ceil(limits.minX / TEN_FOOT_GRID) * TEN_FOOT_GRID; x <= limits.maxX + 1e-6; x += TEN_FOOT_GRID) tenXs.push(Number(x.toFixed(6)));
              for (let y = Math.ceil(limits.minY / TEN_FOOT_GRID) * TEN_FOOT_GRID; y <= limits.maxY + 1e-6; y += TEN_FOOT_GRID) tenYs.push(Number(y.toFixed(6)));
              return <g>
                {zoom >= 1.8 && inchXs.map((x, index) => {
                  const sx = toSvgPoint({ x, y: limits.minY }).x;
                  return <line key={`ix-${index}`} x1={sx} y1={PADDING} x2={sx} y2={VIEW_SIZE - PADDING} className="grid-line inch-grid" />;
                })}
                {zoom >= 1.8 && inchYs.map((y, index) => {
                  const sy = toSvgPoint({ x: limits.minX, y }).y;
                  return <line key={`iy-${index}`} x1={PADDING} y1={sy} x2={VIEW_SIZE - PADDING} y2={sy} className="grid-line inch-grid" />;
                })}
                {footXs.map((x, index) => {
                  const sx = toSvgPoint({ x, y: limits.minY }).x;
                  return <line key={`fx-${index}`} x1={sx} y1={PADDING} x2={sx} y2={VIEW_SIZE - PADDING} className="grid-line foot-grid" />;
                })}
                {footYs.map((y, index) => {
                  const sy = toSvgPoint({ x: limits.minX, y }).y;
                  return <line key={`fy-${index}`} x1={PADDING} y1={sy} x2={VIEW_SIZE - PADDING} y2={sy} className="grid-line foot-grid" />;
                })}
                {tenXs.map((x, index) => {
                  const sx = toSvgPoint({ x, y: limits.minY }).x;
                  return <g key={`tx-${index}`}><line x1={sx} y1={PADDING} x2={sx} y2={VIEW_SIZE - PADDING} className="grid-line ten-grid" /><text x={sx + 4} y={PADDING - 16} className="grid-label">{`${x}'`}</text></g>;
                })}
                {tenYs.map((y, index) => {
                  const sy = toSvgPoint({ x: limits.minX, y }).y;
                  return <g key={`ty-${index}`}><line x1={PADDING} y1={sy} x2={VIEW_SIZE - PADDING} y2={sy} className="grid-line ten-grid" /><text x={PADDING - 30} y={sy - 4} className="grid-label">{`${y}'`}</text></g>;
                })}
              </g>;
            })()}
            {allowSiteConcrete && concreteAreas.map(area => <g key={area.id} data-concrete-area={area.id}>
              <polygon points={area.points.map(toSvgPoint).map(p => p.x + ',' + p.y).join(' ')}
                fill={area.id === activeConcreteId ? '#adc8ce' : '#bdc0be'} fillOpacity={mode === 'concrete' ? .8 : .45}
                stroke={area.id === activeConcreteId ? '#136c7c' : '#858e8a'} strokeWidth={2}
                pointerEvents={mode === 'concrete' && !concreteDraft ? 'auto' : 'none'}
                onClick={event => {event.stopPropagation(); setActiveConcreteId(area.id); setConcretePointIndex(null);}}/>
              <text x={toSvgPoint(area.points[0]).x + 10} y={toSvgPoint(area.points[0]).y + 20}
                fill="#35433d" fontSize={13} fontWeight={700} pointerEvents="none">{area.name}</text>
            </g>)}
            {activeTier === 'main' && lowerTierEnabled && lowerPoints.length >= 3 && <polygon points={lowerPoints.map((point) => { const svgPoint = toSvgPoint(point); return `${svgPoint.x},${svgPoint.y}`; }).join(' ')} className="deck-polygon lower-tier-preview" />}
            {activeTier === 'lower' && mainPoints.length >= 3 && <polygon points={mainPoints.map((point) => { const svgPoint = toSvgPoint(point); return `${svgPoint.x},${svgPoint.y}`; }).join(' ')} className="deck-polygon upper-tier-preview" />}
            {(!drawingSequence && points.length >= 3) ? <polygon points={points.map((point) => { const svgPoint = toSvgPoint(point); return `${svgPoint.x},${svgPoint.y}`; }).join(' ')} className="deck-polygon" /> : points.length > 1 ? <polyline points={points.map((point) => { const svgPoint = toSvgPoint(point); return `${svgPoint.x},${svgPoint.y}`; }).join(' ')} className="deck-polyline" fill="none" /> : null}
            {drawingSequence && points.length > 0 && previewPoint && lastPoint && <>
              <line x1={toSvgPoint(lastPoint).x} y1={toSvgPoint(lastPoint).y} x2={toSvgPoint(previewPoint).x} y2={toSvgPoint(previewPoint).y} className="preview-segment" />
              <circle cx={toSvgPoint(previewPoint).x} cy={toSvgPoint(previewPoint).y} r={5} className="preview-point" />
              {previewMid && previewDelta && <text x={toSvgPoint(previewMid).x} y={toSvgPoint(previewMid).y - 12} textAnchor="middle" className="preview-distance-label">{`${feetAndInches(previewDelta.distance)} · ΔX ${feetAndInches(Math.abs(previewDelta.dx))} · ΔY ${feetAndInches(Math.abs(previewDelta.dy))}`}</text>}
            </>}
            {!drawingSequence && model.edgeSegments.map((segment) => {
              const start = toSvgPoint(segment.start); const end = toSvgPoint(segment.end); const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
              const isRailing = railingEdges.has(segment.index) || (!activeDeckValues.manualRailingEdges && model.exposedSegments.some((item) => item.index === segment.index));
              const isHouse = houseEdges.has(segment.index) || model.houseEdgeIndices.includes(segment.index);
              const isStairEdge = Number(activeDeckValues.stairEdgeIndex ?? -1) === segment.index;
              const edgeClass = isHouse ? 'interactive-edge active-house' : isRailing ? 'interactive-edge active-railing' : isStairEdge ? 'interactive-edge active-stair' : 'interactive-edge';
              return <g key={`edge-${segment.index}`}>
                {mode==='railing'&&<line x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                  stroke={isRailing?'#0db989':'#7e8b99'} strokeWidth={isRailing?9:6}
                  strokeDasharray={isRailing?undefined:'12 9'} opacity={.9}
                  pointerEvents="none"/>}
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                  className={edgeClass} pointerEvents={mode === 'concrete' ? 'none' : undefined} onClick={(event)=>{
                    event.stopPropagation();
                    if(mode==='points')insertPointAtEdge(segment.index);
                    if(mode==='house')toggleHouseEdge(segment.index);
                    if(mode==='railing')toggleRailingEdge(segment.index);
                    if(mode==='stairs')selectStairEdge(segment.index);
                  }}/>
                <circle cx={mid.x} cy={mid.y} r={6} className="edge-midpoint" pointerEvents="none"/>
                {mode==='railing'&&<>
                  <rect x={mid.x-37} y={mid.y-24} width={74} height={19}
                    rx={6} fill={isRailing?'#0d7859':'#596574'} pointerEvents="none"/>
                  <text x={mid.x} y={mid.y-11} textAnchor="middle"
                    fill="#ffffff" fontSize={12} fontWeight="700"
                    pointerEvents="none">{isRailing?'RAIL ✓':'NO RAIL'}</text>
                </>}
                {isHouse&&mode!=='railing'&&<text x={mid.x} y={mid.y-12}
                  textAnchor="middle" className="deck-point-label">HOUSE</text>}
              </g>;
            })}
            {!drawingSequence && model.beamLines.map((beam, index) => {
              const pointOnBeam = (station: number) => model.joistDirection === 'vertical'
                ? toSvgPoint({ x: station, y: beam.y })
                : toSvgPoint({ x: beam.y, y: station });
              return (
                <g key={'beam-' + index}>
                  {beam.segments.map((segment, run) => {
                    const from = pointOnBeam(segment.startX), to = pointOnBeam(segment.endX);
                    const vertical = model.joistDirection === 'horizontal';
                    const mid = pointOnBeam((segment.startX + segment.endX) / 2);
                    return <g key={'beam-run-' + index + '-' + run}>
                      <line x1={from.x + (vertical ? -3 : 0)} y1={from.y + (vertical ? 0 : -3)}
                        x2={to.x + (vertical ? -3 : 0)} y2={to.y + (vertical ? 0 : -3)}
                        className="beam-line beam-line-editable" />
                      <line x1={from.x + (vertical ? 3 : 0)} y1={from.y + (vertical ? 0 : 3)}
                        x2={to.x + (vertical ? 3 : 0)} y2={to.y + (vertical ? 0 : 3)}
                        className="beam-line beam-line-secondary"/>
                      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        className="beam-drag-hit" stroke="transparent" strokeWidth={24} pointerEvents={mode === 'beams' ? 'stroke' : 'none'}
                        onPointerDown={(event) => onBeamPointerDown(event, index)} />
                      <circle cx={mid.x + (vertical ? 17 : 0)} cy={mid.y + (vertical ? 0 : -17)} r={11}
                        className={'beam-drag-handle' + (selectedBeamIndex === index && mode === 'beams' ? ' is-selected' : '')}
                        pointerEvents={mode === 'beams' ? 'auto' : 'none'}
                        onPointerDown={(event) => onBeamPointerDown(event, index)}>
                        <title>{'Move beam ' + (index + 1)}</title>
                      </circle>
                      <text x={mid.x + (vertical ? 24 : 14)} y={mid.y + (vertical ? -17 : -14)} className="beam-number-label">
                        {'B' + (index + 1)}
                      </text>
                    </g>;
                  })}
                  {beam.postSpecs.map((post, postIndex) => {
                    const p = pointOnBeam(post.x);
                    const active = selectedPost?.beamIndex === index && selectedPost.id === post.id;
                    return <g key={post.id}>
                      <rect x={p.x - 7} y={p.y - 7} width={14} height={14} rx={2}
                        className={'post-lock ' + (post.locked ? 'locked ' : '') + (active ? 'post-selected' : '')}
                        style={{ cursor: mode === 'posts' ? (post.locked ? 'pointer' : 'grab') : 'default', strokeWidth: active ? 3 : 1.5 }}
                        pointerEvents={mode === 'posts' ? 'auto' : 'none'}
                        onPointerDown={(e) => onPostPointerDown(e, index, post.id)}
                        onClick={(e) => { e.stopPropagation(); setSelectedPost({ beamIndex: index, id: post.id }); }}/>
                      <text x={p.x + 10} y={p.y - 10} className="deck-point-label">{'B' + (index + 1) + '-P' + (postIndex + 1)}</text>
                    </g>;
                  })}
                </g>
              );
            })}
            {!drawingSequence && model.angledBeamLines?.map((beam, index) => {
              const a = toSvgPoint(beam.start);
              const b = toSvgPoint(beam.end);
              return <g key={`angled-beam-${index}`}><line x1={a.x} y1={a.y - 3} x2={b.x} y2={b.y - 3} className="beam-line beam-line-editable" /><line x1={a.x} y1={a.y + 3} x2={b.x} y2={b.y + 3} className="beam-line beam-line-secondary" />{beam.postPoints.map((post, postIndex) => { const p = toSvgPoint(post); return <rect key={`angled-post-${index}-${postIndex}`} x={p.x - 4} y={p.y - 4} width={8} height={8} className="post-lock" />; })}</g>;
            })}
            {points.map((point, index) => { const svgPoint = toSvgPoint(point); const isClosePoint = drawingSequence && index === 0 && points.length >= 3; return <g key={`${point.x}-${point.y}-${index}`}><circle cx={svgPoint.x} cy={svgPoint.y} r={selectedIndex === index ? 9 : 7} className={selectedIndex === index ? 'deck-point active' : isClosePoint ? 'deck-point close-target' : 'deck-point'} pointerEvents={mode === 'points' ? 'auto' : 'none'} onPointerDown={(event) => onPointPointerDown(event, index)} onClick={(event) => { event.stopPropagation(); if (drawingSequence && !isClosePoint) return; if (isClosePoint) { finishDrawing(); return; } setSelectedIndex(index); }} /><text x={svgPoint.x + 10} y={svgPoint.y - 10} className="deck-point-label">P{index + 1}{isClosePoint ? ' · close' : ''}</text></g>; })}
            {!drawingSequence && stairFootprints.map(flight => {
              const corners = flight.corners.map(toSvgPoint);
              const center = toSvgPoint(flight.center);
              const entryA = corners[0], entryB = corners[1];
              return <g key={'stair-plan-' + flight.sourceIndex} data-stair-plan={flight.sourceIndex + 1}>
                <polygon points={corners.map(p => p.x + ',' + p.y).join(' ')}
                  fill="#e4d2b7" fillOpacity={.65} stroke="#a58358" strokeWidth={1.5} pointerEvents="none"/>
                {flight.treads.map(([a,b], step) => {
                  const from = toSvgPoint(a), to = toSvgPoint(b);
                  return <line key={step} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke="#a58358" strokeWidth={1.2} pointerEvents="none"/>;
                })}
                {flight.sides.map(side => {
                  const from = toSvgPoint(side.start), to = toSvgPoint(side.end);
                  const toggle = () => toggleStairRailing(flight.sourceIndex, side.side, !side.enabled);
                  return <g key={side.side}>
                    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke={side.enabled ? '#0d7859' : '#788694'} strokeWidth={side.enabled ? 7 : 4}
                      strokeDasharray={side.enabled ? undefined : '10 7'} pointerEvents="none"/>
                    {(mode === 'railing' || mode === 'stairs') && <rect
                      x={0} y={-11} width={Math.hypot(to.x-from.x,to.y-from.y)} height={22}
                      transform={`translate(${from.x} ${from.y}) rotate(${Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI})`}
                      fill="transparent" style={{cursor:'pointer'}}
                      role="button" tabIndex={0} aria-pressed={side.enabled}
                      aria-label={'Toggle stair ' + (flight.sourceIndex + 1) + ' ' + side.side + ' railing'}
                      onClick={event => {event.stopPropagation(); toggle();}}
                      onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); toggle();}}}/>}
                  </g>;
                })}
                <line x1={entryA.x} y1={entryA.y} x2={entryB.x} y2={entryB.y}
                  className={activeStairIndex === flight.sourceIndex ? 'stair-edge-highlight active-stair' : 'stair-edge-highlight'}
                  pointerEvents={mode === 'stairs' ? 'auto' : 'none'}
                  onPointerDown={event => onStairPointerDown(event, flight.sourceIndex)}
                  onClick={event => {event.stopPropagation(); setActiveStairIndex(flight.sourceIndex);}}/>
                <text x={center.x} y={center.y} textAnchor="middle" fill="#543f26" fontSize={12} fontWeight={700}
                  pointerEvents="none">Stair {flight.sourceIndex + 1}</text>
              </g>;
            })}
            {mode === 'concrete' && activeConcrete && !concreteDraft && activeConcrete.points.map((point, index) => {
              const p = toSvgPoint(point);
              return <g key={'concrete-point-' + index}>
                <circle cx={p.x} cy={p.y} r={concretePointIndex === index ? 9 : 7}
                  fill={concretePointIndex === index ? '#dfb95f' : '#136c7c'} stroke="#ffffff" strokeWidth={2}
                  style={{cursor: 'move'}} role="button" tabIndex={0}
                  aria-label={'Concrete corner ' + (index + 1)}
                  onPointerDown={event => {
                    event.preventDefault(); event.stopPropagation();
                    setConcretePointIndex(index); setDraggingConcretePoint(index); pushHistory(); setFuture([]);
                    try {svgRef.current?.setPointerCapture(event.pointerId);} catch {}
                  }}
                  onClick={event => {event.stopPropagation(); setConcretePointIndex(index);}}
                  onKeyDown={event => {if(event.key === 'Enter') setConcretePointIndex(index);}}/>
                <text x={p.x + 11} y={p.y - 10} fontSize={12} fill="#136c7c" pointerEvents="none">C{index + 1}</text>
              </g>;
            })}
            {mode === 'concrete' && concreteDraft && <g>
              <polyline points={[...concreteDraft, ...(previewPoint ? [previewPoint] : [])].map(toSvgPoint).map(p => p.x + ',' + p.y).join(' ')}
                fill="none" stroke="#136c7c" strokeWidth={3} strokeDasharray="9 5" pointerEvents="none"/>
              {concreteDraft.map((point, index) => {
                const p = toSvgPoint(point);
                return <g key={'draft-concrete-' + index}>
                  <circle cx={p.x} cy={p.y} r={index === 0 && concreteDraft.length >= 3 ? 10 : 6}
                    fill="#136c7c" stroke="#ffffff" strokeWidth={2}
                    onClick={event => {event.stopPropagation(); if(index === 0) finishConcrete();}}/>
                  <text x={p.x + 10} y={p.y - 10} fontSize={12} fill="#136c7c" pointerEvents="none">C{index + 1}{index === 0 && concreteDraft.length >= 3 ? ' · close' : ''}</text>
                </g>;
              })}
            </g>}
          </svg>
          </div>
        </div>
        <div className="deck-designer-controls organized-controls">
          {mode === 'points' && <div className="callout-box compact-card"><h4>Selected point</h4>{selectedIndex === null ? <p className="muted">{drawingSequence ? 'Keep drawing the footprint, then click P1 to close it.' : 'Click a point in the drawing to fine-tune it.'}</p> : <div className="stack-list"><div className="form-grid compact-grid"><label className="form-field"><span>X (ft)</span><input type="number" step={GRID_SIZE} value={points[selectedIndex].x} onChange={(event) => updatePoint(selectedIndex, 'x', Number(event.target.value))} /><small>{feetAndInches(points[selectedIndex].x)}</small></label><label className="form-field"><span>Y (ft)</span><input type="number" step={GRID_SIZE} value={points[selectedIndex].y} onChange={(event) => updatePoint(selectedIndex, 'y', Number(event.target.value))} /><small>{feetAndInches(points[selectedIndex].y)}</small></label></div><div className="point-nudge-grid"><span className="muted">Move by inches</span><div className="point-nudge-row"><button type="button" className="ghost-btn small-btn" onClick={() => nudgeSelectedPoint('x', -1)}>X −1"</button><button type="button" className="ghost-btn small-btn" onClick={() => nudgeSelectedPoint('x', 1)}>X +1"</button><button type="button" className="ghost-btn small-btn" onClick={() => nudgeSelectedPoint('y', -1)}>Y −1"</button><button type="button" className="ghost-btn small-btn" onClick={() => nudgeSelectedPoint('y', 1)}>Y +1"</button></div></div><button type="button" className="secondary-btn block-btn" onClick={removeSelected}>Remove point</button></div>}</div>}
          {mode === 'points' && <div className="callout-box compact-card"><h4>Tier drawing</h4><p className="muted">Draw the main/upper deck first. Turn on Add lower deck tier to draw and edit a separate lower deck with its own stairs, railing, beams, and posts.</p><div className="tag-row"><span className="tag">Main: {mainPoints.length >= 3 ? `${feetAndInches(polygonArea(mainPoints))} sf` : 'not closed'}</span>{lowerTierEnabled && <span className="tag">Lower: {lowerPoints.length >= 3 ? `${feetAndInches(polygonArea(lowerPoints))} sf` : 'not closed'}</span>}</div></div>}
          {mode === 'points' && <div className="callout-box compact-card"><h4>Quick rectangle</h4><div className="form-grid compact-grid"><label className="form-field"><span>Width (ft)</span><input type="number" step={1} min={1} value={Number(values.quickWidth ?? 16)} onChange={(event) => commitChange((current) => ({ ...current, quickWidth: Number(event.target.value) }))} /></label><label className="form-field"><span>Projection (ft)</span><input type="number" step={1} min={1} value={Number(values.quickProjection ?? 12)} onChange={(event) => commitChange((current) => ({ ...current, quickProjection: Number(event.target.value) }))} /></label><button type="button" className="ghost-btn block-btn" onClick={applyRectangle}>Apply rectangle</button></div></div>}
          {mode === 'stairs' && <div className="callout-box compact-card">
            <h4>Stair railing · same style as the deck</h4>
            <p className="muted">Set left and right guardrails for the first staircase. Choose the railing system in the railing finishes above; the 3D and supplier material counts update together.</p>
            <div className="form-grid compact-grid">
              <label className="form-field">Left stair railing
                <select aria-label="Main stair left railing"
                  value={activeDeckValues.stairRailingLeft===false||String(activeDeckValues.stairRailingLeft)==='false'?'no':'yes'}
                  onChange={e=>commitChange(current=>({...current,
                    [tierKey('stairRailingLeft')]:e.target.value==='yes'}))}>
                  <option value="yes">Install chosen railing</option><option value="no">No railing</option>
                </select></label>
              <label className="form-field">Right stair railing
                <select aria-label="Main stair right railing"
                  value={activeDeckValues.stairRailingRight===false||String(activeDeckValues.stairRailingRight)==='false'?'no':'yes'}
                  onChange={e=>commitChange(current=>({...current,
                    [tierKey('stairRailingRight')]:e.target.value==='yes'}))}>
                  <option value="yes">Install chosen railing</option><option value="no">No railing</option>
                </select></label>
            </div>
            <p className="muted">The model and takeoff follow the installed sides; verify project guard/handrail and stair egress code requirements before approval.</p>
          </div>}
          {mode === 'stairs' && <div className="callout-box compact-card"><h4>Staircases</h4><p className="muted">Use Place stairs, choose which staircase is active, then click/drag an edge for that staircase.</p><div className="stack-list"><button type="button" className={activeStairIndex === 0 ? 'secondary-btn block-btn' : 'ghost-btn block-btn'} onClick={() => { setActiveStairIndex(0); setMode('stairs'); }}>Edit staircase 1</button>{extraStairs.map((stair, index) => <div key={`extra-stair-${index}`} className="beam-editor-row beam-edit-grid"><button type="button" className={activeStairIndex === index + 1 ? 'secondary-btn small-btn' : 'ghost-btn small-btn'} onClick={() => { setActiveStairIndex(index + 1); setMode('stairs'); }}>Stair {index + 2}</button><label className="inline-mini-field"><span>Width</span><input type="number" step={GRID_SIZE} value={stair.width} onChange={(event) => { const next = [...extraStairs]; next[index] = { ...stair, width: Number(event.target.value) }; updateExtraStairs(next); }} /></label><label className="inline-mini-field"><span>Offset</span><input type="number" step={GRID_SIZE} value={stair.offset} onChange={(event) => { const next = [...extraStairs]; next[index] = { ...stair, offset: snap(Number(event.target.value)) }; updateExtraStairs(next); }} /></label>
              <label className="inline-mini-field"><span>Left railing</span>
                <input type="checkbox" aria-label={'Stair '+(index+2)+' left railing'}
                  checked={stair.left ?? model.stairRailingLeft}
                  onChange={e=>{const next=[...extraStairs];next[index]={...stair,left:e.target.checked};updateExtraStairs(next);}}/></label>
              <label className="inline-mini-field"><span>Right railing</span>
                <input type="checkbox" aria-label={'Stair '+(index+2)+' right railing'}
                  checked={stair.right ?? model.stairRailingRight}
                  onChange={e=>{const next=[...extraStairs];next[index]={...stair,right:e.target.checked};updateExtraStairs(next);}}/></label>
              <button type="button" className="ghost-btn small-btn" onClick={() => removeExtraStair(index)}>Remove</button></div>)}<button type="button" className="ghost-btn block-btn" onClick={addExtraStair}>Add another staircase</button></div></div>}
          {mode === 'stairs' && <div className="callout-box compact-card">
            <h4>Stair placement offset</h4>
            <label className="form-field"><span>Distance along selected edge (ft)</span>
              <input type="number" min={0} step={GRID_SIZE} value={Number(activeDeckValues.stairOffset ?? 0)}
                onChange={(event) => commitChange((current) => ({ ...current, [tierKey('stairOffset')]: snap(Number(event.target.value)) }))}/>
            </label>
            <p className="muted">Use the Stairs mode to click or drag the stair opening along an edge.</p>
          </div>}
          {mode === 'posts' && <div className="callout-box compact-card">
            <h4>Exact support-post layouts</h4>
            <div className="beam-selector-row" role="group" aria-label="Select beam supports">
              {model.beamLines.map((beam, index) => <button key={'post-select-' + index} type="button"
                aria-pressed={inspectedBeamIndex === index} className={inspectedBeamIndex === index ? 'secondary-btn small-btn' : 'ghost-btn small-btn'}
                onClick={() => setSelectedBeamIndex(index)}>{'Beam ' + (index + 1) + ' · ' + beam.postXs.length + ' posts'}</button>)}
            </div>
            <p className="muted">Click a support square to select it, then click a new place along its beam, drag the square, or type an exact station below. An automatic layout becomes editable on the first change. Unlock a locked post before moving it; structural engineering remains required.</p>
            {postFeedback && <p className="muted" role="status">{postFeedback}</p>}
            {model.postLayoutIssues.map((issue, i) => <p key={'post-issue-' + i} role="alert" style={{ color: '#b91c1c' }}>{issue}</p>)}
            {model.postEngineeringNotes.map((note, i) => <p key={'post-note-' + i} style={{ color: '#92400e' }}>{note}</p>)}
            <div className="stack-list">
              {model.beamLines.map((beam, beamIndex) => beamIndex !== inspectedBeamIndex ? null : <div key={'post-beam-' + beamIndex} style={{ border: '1px solid var(--border, #d1d5db)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <strong>{'Beam ' + (beamIndex + 1)}</strong>
                  <span className="muted">{beam.postMode === 'manual' ? 'Manual / exact' : 'Automatic'} · {beam.postSpecs.length} posts</span>
                </div>
                <div className="form-grid compact-grid">
                  <label className="form-field"><span>Post count</span><input type="number" min={Math.max(2, beam.segments.length * 2)} max={100} step={1} value={beam.postSpecs.length}
                    onChange={(e) => { const next=Number(e.target.value); if (Number.isInteger(next) && next >= 2) evenlySpaceBeamPosts(beamIndex, next); }}/></label>
                  <button type="button" className="secondary-btn small-btn" onClick={() => evenlySpaceBeamPosts(beamIndex, beam.postSpecs.length)}>Space evenly</button>
                  <button type="button" className="ghost-btn small-btn" onClick={() => addBeamPost(beamIndex)}>Add post</button>
                  <button type="button" className="ghost-btn small-btn" disabled={beam.postMode === 'automatic'} onClick={() => resetBeamPosts(beamIndex)}>Reset to auto</button>
                </div>
                <div className="stack-list">
                  {beam.postSpecs.map((post, postIndex) => <div key={post.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0' }}>
                    <span style={{ minWidth: 54 }}>{'B' + (beamIndex + 1) + '-P' + (postIndex + 1)}</span>
                    <label className="inline-mini-field"><span>Station (ft)</span>
                      <input type="number" min={0} step={1/12} disabled={post.locked} value={Number(post.x.toFixed(4))}
                        onChange={(e) => updateBeamPost(beamIndex, post.id, { x: Number(e.target.value) })}/></label>
                    <span className="muted">{feetAndInches(post.x)}</span>
                    <button type="button" className="ghost-btn small-btn" onClick={() => updateBeamPost(beamIndex, post.id, { locked: !post.locked })}>{post.locked ? 'Unlock' : 'Lock'}</button>
                    <button type="button" className="ghost-btn small-btn" disabled={post.locked} onClick={() => removeBeamPost(beamIndex, post.id)}>Remove</button>
                  </div>)}
                </div>
              </div>)}
            </div>
          </div>}
          {mode === 'beams' && <div className="callout-box compact-card beam-inspector">
            <h4>Beam placement</h4>
            <p className="muted">Choose a beam, then <strong>click an open spot on the grid to position it</strong>, drag its blue handle, or type a station. Use the ±1″ controls for precision. Locked support posts must be unlocked before moving their beam.</p>
            {postFeedback && <p role="status" className="deck-designer-feedback">{postFeedback}</p>}
            <div className="beam-selector-row" role="group" aria-label="Select beam to edit">
              {model.beamLines.map((_, index) => <button type="button" key={index}
                aria-pressed={inspectedBeamIndex === index}
                className={inspectedBeamIndex === index ? 'secondary-btn small-btn' : 'ghost-btn small-btn'}
                onClick={() => setSelectedBeamIndex(index)}>{'Beam ' + (index + 1)}</button>)}
            </div>
            {model.beamLines[inspectedBeamIndex] && <div className="beam-position-editor">
              <div className="beam-location-heading">
                <strong>{'B' + (inspectedBeamIndex + 1)} · {feetAndInches(beamOffsets[inspectedBeamIndex] ?? 0)}</strong>
                <span className="muted">{model.beamLines[inspectedBeamIndex].segments.length} continuous run(s)</span>
              </div>
              <label className="form-field"><span>{model.joistDirection === 'vertical' ? 'Distance from rear (ft)' : 'Distance from left (ft)'}</span>
                <input type="number" min={0} max={model.joistDirection === 'vertical' ? model.depth : model.width}
                  step={GRID_SIZE} value={Number((beamOffsets[inspectedBeamIndex] ?? 0).toFixed(4))}
                  onChange={(event) => moveBeamStation(inspectedBeamIndex, Number(event.target.value))}/>
              </label>
              <div className="beam-nudge-actions">
                <button type="button" className="ghost-btn small-btn" onClick={() => moveBeamStation(inspectedBeamIndex, (beamOffsets[inspectedBeamIndex] ?? 0) - 1)}>−1 ft</button>
                <button type="button" className="ghost-btn small-btn" onClick={() => moveBeamStation(inspectedBeamIndex, (beamOffsets[inspectedBeamIndex] ?? 0) - 1 / 12)}>−1 in</button>
                <button type="button" className="ghost-btn small-btn" onClick={() => moveBeamStation(inspectedBeamIndex, (beamOffsets[inspectedBeamIndex] ?? 0) + 1 / 12)}>+1 in</button>
                <button type="button" className="ghost-btn small-btn" onClick={() => moveBeamStation(inspectedBeamIndex, (beamOffsets[inspectedBeamIndex] ?? 0) + 1)}>+1 ft</button>
              </div>
              <div className="form-grid compact-grid">
                <label className="form-field"><span>Start trim (ft)</span>
                  <input type="number" min={0} step={GRID_SIZE} value={model.beamLines[inspectedBeamIndex].startTrim}
                    onChange={(event) => updateBeamEdit(inspectedBeamIndex, 'startTrim', Number(event.target.value))}/></label>
                <label className="form-field"><span>End trim (ft)</span>
                  <input type="number" min={0} step={GRID_SIZE} value={model.beamLines[inspectedBeamIndex].endTrim}
                    onChange={(event) => updateBeamEdit(inspectedBeamIndex, 'endTrim', Number(event.target.value))}/></label>
              </div>
              <button type="button" className="ghost-btn small-btn" disabled={beamOffsets.length <= 1}
                onClick={() => removeBeamLine(inspectedBeamIndex)}>Remove selected beam</button>
            </div>}
            <div className="beam-inspector-actions">
              <button type="button" className="secondary-btn small-btn" onClick={addBeamLine}>+ Add beam in open bay</button>
              <button type="button" className="ghost-btn small-btn" onClick={resetBeamLayout}>Reset beams & supports to auto</button>
            </div>
            {model.angledBeamLines?.length > 0 && <p className="muted">Angled perimeter braces follow their angled edges automatically; straight beam stations above are fully editable.</p>}
          </div>}
          {mode === 'house' && <div className="callout-box compact-card">
            <h4>Identify house attachment</h4>
            <p className="muted">Click each edge that touches the house. House edges affect ledger conditions and fascia, railing and picture-frame eligibility. Selected house edges: {[...houseEdges].map((i) => 'E' + (i + 1)).join(', ') || 'none'}.</p>
          </div>}
          {mode === 'railing' && <div className="callout-box compact-card">
            <h4>Choose railing edges</h4>
            <p className="muted">Solid green = railing selected, gray dashed = no railing. Click a deck edge or either side of a drawn staircase to toggle its railing. Stair entrances remain open. {railingEdges.size} of {model.edgeSegments.length} edges selected.</p>
             <p role="status" className="deck-designer-feedback">{railingFeedback||'Click a deck edge or a stair side to add or remove railing.'}</p>
             <div className="tag-row">{model.edgeSegments.map(edge=>
               <button type="button" key={'rail-edge-status-'+edge.index}
                 className={railingEdges.has(edge.index)?'secondary-btn small-btn':'ghost-btn small-btn'}
                 aria-pressed={railingEdges.has(edge.index)}
                 onClick={()=>toggleRailingEdge(edge.index)}>
                 E{edge.index+1}: {railingEdges.has(edge.index)?'✓ railing':'— no rail'}
               </button>)}</div>
          </div>}
          {mode === 'railing' && stairFootprints.length > 0 && <div className="callout-box compact-card">
            <h4>Stair railing edges</h4>
            <p className="muted">Left and right are viewed looking down each staircase.</p>
            {stairFootprints.map(flight => <div className="tag-row" key={'stair-rail-controls-' + flight.sourceIndex}>
              <strong>Stair {flight.sourceIndex + 1}</strong>
              {flight.sides.map(side => <button type="button" key={side.side}
                className={side.enabled ? 'secondary-btn small-btn' : 'ghost-btn small-btn'}
                aria-label={'Stair ' + (flight.sourceIndex + 1) + ' ' + side.side + ' railing'}
                aria-pressed={side.enabled}
                onClick={() => toggleStairRailing(flight.sourceIndex, side.side, !side.enabled)}>
                {side.side}: {side.enabled ? '✓ railing' : '— no rail'}
              </button>)}
            </div>)}
          </div>}
          {allowSiteConcrete && mode === 'concrete' && <div className="callout-box compact-card">
            <h4>Concrete areas</h4>
            <p className="muted">Draw patios, paths or landing areas anywhere on this plan. Each closed outline appears in 3D and contributes its measured concrete volume.</p>
            {concreteDraft ? <>
              <p>Click each corner, then C1 or Finish area to close. {concreteDraft.length} corner(s) drawn.</p>
              <div className="tag-row">
                <button type="button" className="secondary-btn small-btn" disabled={concreteDraft.length < 3} onClick={finishConcrete}>Finish concrete area</button>
                <button type="button" className="ghost-btn small-btn" disabled={!concreteDraft.length} onClick={() => setConcreteDraft(concreteDraft.slice(0,-1))}>Undo last corner</button>
                <button type="button" className="ghost-btn small-btn" onClick={() => {setConcreteDraft(null); setPreviewPoint(null);}}>Cancel drawing</button>
              </div>
            </> : <button type="button" className="secondary-btn block-btn" onClick={() => {
              setConcreteDraft([]); setActiveConcreteId(null); setConcretePointIndex(null); setConcreteFeedback(''); setPreviewPoint(null);
            }}>Draw concrete area</button>}
            {concreteAreas.length > 0 && <div className="stack-list" style={{marginTop:12}}>
              {concreteAreas.map(area => <button type="button" key={area.id}
                className={area.id === activeConcreteId ? 'secondary-btn small-btn' : 'ghost-btn small-btn'}
                aria-pressed={area.id === activeConcreteId} onClick={() => {
                  setActiveConcreteId(area.id); setConcretePointIndex(null); setConcreteDraft(null);
                }}>{area.name} · {polygonArea(area.points).toFixed(1)} sq ft</button>)}
            </div>}
            {activeConcrete && !concreteDraft && <div className="stack-list" style={{marginTop:12}}>
              <label className="form-field">Area name<input aria-label="Concrete area name" value={activeConcrete.name}
                onChange={event => updateConcrete({name:event.target.value})}/></label>
              <div className="form-grid compact-grid">
                <label className="form-field">X position (ft)<input aria-label="Concrete X position" type="number" step={GRID_SIZE}
                  value={Math.min(...activeConcrete.points.map(p => p.x))}
                  onChange={event => moveConcrete('x', Number(event.target.value))}/></label>
                <label className="form-field">Y position (ft)<input aria-label="Concrete Y position" type="number" step={GRID_SIZE}
                  value={Math.min(...activeConcrete.points.map(p => p.y))}
                  onChange={event => moveConcrete('y', Number(event.target.value))}/></label>
                <label className="form-field">Thickness (in)<input aria-label="Concrete thickness" type="number" min={2} max={24} step={.5}
                  value={activeConcrete.thicknessIn} onChange={event => updateConcrete({thicknessIn:Number(event.target.value)})}/></label>
                <label className="form-field">Top above grade (ft)<input aria-label="Concrete top elevation" type="number" min={-10} max={20} step={.05}
                  value={activeConcrete.elevationFt} onChange={event => updateConcrete({elevationFt:Number(event.target.value)})}/></label>
              </div>
              <label className="form-field">Edit corner<select aria-label="Concrete selected corner"
                value={concretePointIndex ?? ''} onChange={event => setConcretePointIndex(event.target.value === '' ? null : Number(event.target.value))}>
                <option value="">Select a corner</option>
                {activeConcrete.points.map((_,i) => <option key={i} value={i}>C{i+1}</option>)}
              </select></label>
              {concretePointIndex !== null && activeConcrete.points[concretePointIndex] && <>
                <div className="form-grid compact-grid">
                  <label className="form-field">Corner X (ft)<input aria-label="Concrete corner X" type="number" step={GRID_SIZE}
                    value={activeConcrete.points[concretePointIndex].x}
                    onChange={event => updateConcretePoint(concretePointIndex, 'x', Number(event.target.value))}/></label>
                  <label className="form-field">Corner Y (ft)<input aria-label="Concrete corner Y" type="number" step={GRID_SIZE}
                    value={activeConcrete.points[concretePointIndex].y}
                    onChange={event => updateConcretePoint(concretePointIndex, 'y', Number(event.target.value))}/></label>
                </div>
                <button type="button" className="ghost-btn small-btn" disabled={activeConcrete.points.length <= 3} onClick={() => {
                  updateConcrete({points:activeConcrete.points.filter((_,i) => i !== concretePointIndex)}); setConcretePointIndex(null);
                }}>Remove selected concrete corner</button>
              </>}
              <button type="button" className="ghost-btn small-btn" onClick={() => {
                writeConcrete(concreteAreas.filter(area => area.id !== activeConcrete.id)); setActiveConcreteId(null); setConcretePointIndex(null);
              }}>Remove concrete area</button>
            </div>}
            {concreteFeedback && <p role="status" className="deck-designer-feedback">{concreteFeedback}</p>}
            {concretePlan.validationIssues.length > 0 && <div role="alert" className="deck-designer-feedback">
              {concretePlan.validationIssues.map((issue,index) => <p key={index}>{issue}</p>)}
            </div>}
            {concreteAreas.length > 0 && <p className="muted">{concretePlan.canQuantify ? `Total: ${concretePlan.totalAreaSqFt.toFixed(1)} sq ft · ${concretePlan.totalVolumeCuYd.toFixed(2)} cubic yards before allowance.` : 'Concrete quantities are unavailable until the drawing issues above are corrected.'}</p>}
          </div>}
          {mode === 'points' && <div className="callout-box compact-card"><h4>Reset</h4><button type="button" className="ghost-btn block-btn" onClick={resetShape}>Reset shape and manual overrides</button></div>}
          {mode === 'points' && <div className="callout-box compact-card workflow-card"><h4>Geometry summary</h4><div className="metrics-mini-grid"><div><span>Area</span><strong>{polygonArea(points).toFixed(1)} sq ft</strong></div><div><span>Perimeter</span><strong>{polygonPerimeter(points).toFixed(1)} lf</strong></div><div><span>Viewport</span><strong>{feetAndInches(viewFeet)} × {feetAndInches(viewFeet)}</strong></div><div><span>Origin</span><strong>{feetAndInches(limits.minX)} , {feetAndInches(limits.minY)}</strong></div></div></div>}
          {mode === 'points' && <div className="callout-box compact-card workflow-card"><h4>Drawing workflow</h4><ul className="plain-list compact"><li>Click to place P1, then keep clicking each next corner.</li><li>The live line follows your cursor and snaps to 45° / 90° when nearby.</li><li>Click back on P1 to close the shape.</li><li>After closing, drag any point or insert a new one on any edge.</li><li>Use Pick house sides to mark any side that is against the house so picture frame/band/attachment logic follows the real plan.</li></ul></div>}
        </div>
      </div>
    </div>
  );
}
