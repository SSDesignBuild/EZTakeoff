import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { exportCanvasAsPng, exportCanvasesAsPdf, svgElementToExportCanvases, svgElementToCanvas } from '../lib/export';
import { MaterialItem } from '../lib/types';
import { renderMaterialExportPages,stackMaterialExportPages } from '../lib/materialExport';
import { ConstructionCadPanel } from './ConstructionCadPanel';
import { MaterialCutDetails } from './MaterialCutDetails';
import { materialDrawingLabel, mergeMaterialCutPlans } from '../lib/materialCutPlan';
import type { ConsultationProject } from '../lib/consultationProject';
import { buildProjectConstructionDrawingSet as buildConstructionDrawingSet } from '../lib/constructionProjectCad';
import { constructionVectorPdf } from '../lib/constructionCadExport';

interface MaterialTableProps {
  items: MaterialItem[];
  validationIssues?: string[];
  orderNotes?: string[];
  project?: ConsultationProject;
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

interface CustomMaterialItem extends MaterialItem { id: string; }
interface DisplayMaterialItem extends MaterialItem { rowKey: string; source: 'estimate' | 'custom'; }
interface RemovedMaterialRecord extends DisplayMaterialItem {
  reason: 'unspecified' | 'on-hand' | 'supplier-unavailable' | 'not-needed' | 'other';
  memo: string;
  removedAt: string;
}
const REMOVAL_REASONS:Record<RemovedMaterialRecord['reason'],string>={
  'unspecified':'Reason not yet selected',
  'on-hand':'Already on hand',
  'supplier-unavailable':'Supplier unavailable / substitute',
  'not-needed':'Not needed for this job',
  'other':'Other reason',
};

const infoFields = [
  { key: 'poJobName', label: 'P.O / Job name', type: 'text' as const },
  { key: 'drawingRevision', label: 'Drawing revision', type: 'text' as const },
  { key: 'jobAddress', label: 'Address', type: 'text' as const },
  { key: 'customerPhone', label: 'Customer phone', type: 'text' as const },
  { key: 'balanceDueCompletion', label: 'Balance due at completion', type: 'text' as const },
  { key: 'financedYesNo', label: 'Financed', type: 'select' as const, options: ['No', 'Yes'] },
  { key: 'deliverYesNo', label: 'Deliver', type: 'select' as const, options: ['No', 'Yes'] },
  { key: 'deliverDate', label: 'Deliver date', type: 'date' as const },
];

const customDefaults = { category: 'Custom items', name: '', quantity: '1', unit: 'ea', stockRecommendation: '', color: '', notes: '' };

function parseJsonArray<T>(raw: string | number | boolean | undefined, fallback: T[]): T[] {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}


function projectExportTitle(baseTitle: string, values: Record<string, string | number | boolean>) {
  const job = String(values.poJobName ?? '').trim();
  const address = String(values.jobAddress ?? '').trim();
  const phone = String(values.customerPhone ?? '').trim();
  const balance = String(values.balanceDueCompletion ?? '').trim();
  const financed = String(values.financedYesNo ?? '').trim();
  const lines = [
    job || baseTitle,
    address,
    phone ? `Phone: ${phone}` : '',
    balance ? `Balance due at completion: ${balance}` : '',
    financed ? `Financed: ${financed}` : '',
    job ? baseTitle : '',
  ].filter(Boolean);
  return lines.join('\n');
}

function sanitizeFilePart(value: string) {
  return value.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-').toLowerCase() || 'sns-material-order-list';
}

async function renderCombinedSkirtingSheet(cards: Element[]) {
  if (!cards.length) return null;
  // Each side/flight gets BOTH finish and framing elevations grouped in one
  // card. One landscape sheet prevents an N-side project from producing N PDF
  // sheets with tiny, unlabeled sections.
  const groups = await Promise.all(cards.map(async (card) => {
    const svgs = Array.from(card.querySelectorAll<SVGSVGElement>('svg[data-export-skirting="true"]'));
    const views = await Promise.all(svgs.map((svg) => svgElementToCanvas(svg)));
    const tier = card.closest('[data-export-skirt-tier]')?.getAttribute('data-export-skirt-tier') ?? 'Deck';
    const name = svgs[0]?.getAttribute('data-export-skirt-label') ?? 'Skirting side';
    const layers = svgs.map((svg) => svg.getAttribute('data-export-skirt-layer') ?? 'finish');
    return {label:tier+' · '+name,views,layers};
  }));
  const width=2400,height=1650;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#171717';ctx.font='bold 52px Arial';
  ctx.fillText('S&S DESIGN BUILD  /  DECK & STAIR SKIRTING',64,83);
  ctx.fillStyle='#475569';ctx.font='28px Arial';
  ctx.fillText('FINISH + 2x4 SUPPORT ELEVATIONS  ·  ALL SIDES ON ONE SHEET',64,127);
  const count=groups.length;
  const cols=count<=3?1:count<=9?2:3;
  const rows=Math.ceil(count/cols);
  const gap=20,left=54,top=167,bottom=70;
  const tileW=(width-left*2-gap*(cols-1))/cols;
  const tileH=(height-top-bottom-gap*(rows-1))/rows;
  for(let i=0;i<groups.length;i++){
    const item=groups[i],x=left+(i%cols)*(tileW+gap),y=top+Math.floor(i/cols)*(tileH+gap);
    ctx.fillStyle=i%2===0?'#f8fafc':'#edf2f7';
    ctx.fillRect(x,y,tileW,tileH);
    ctx.strokeStyle='#cbd5e1';ctx.lineWidth=2;ctx.strokeRect(x,y,tileW,tileH);
    ctx.fillStyle='#0f172a';ctx.font='bold 26px Arial';
    ctx.fillText(item.label.slice(0,52),x+20,y+35,tileW-40);
    const innerTop=y+49,innerHeight=tileH-60;
    const layerHeight=innerHeight/Math.max(1,item.views.length);
    item.views.forEach((view,j)=>{
      if(!view)return;
      const xPad=16,yPad=7;
      const availableW=tileW-2*xPad,availableH=layerHeight-2*yPad;
      const factor=Math.min(availableW/view.width,availableH/view.height);
      const drawW=view.width*factor,drawH=view.height*factor;
      const dx=x+(tileW-drawW)/2,dy=innerTop+j*layerHeight+(layerHeight-drawH)/2;
      ctx.drawImage(view,dx,dy,drawW,drawH);
      ctx.fillStyle='#334155';ctx.font='bold 17px Arial';
      ctx.fillText((item.layers[j]??'').toUpperCase(),x+14,innerTop+j*layerHeight+20);
    });
  }
  ctx.fillStyle='#475569';ctx.font='22px Arial';
  ctx.fillText('Field verify sloping stair details, ground contact, finished grades and manufacturer clearances before fabrication.',64,height-25);
  return canvas;
}

export function MaterialTable({ items, values, onValuesChange, validationIssues = [],orderNotes = [],project }: MaterialTableProps) {
  const { serviceSlug } = useParams();
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [customDraft, setCustomDraft] = useState(customDefaults);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState({ name: '', quantity: '', unit: '', stockRecommendation: '', color: '', notes: '' });
  const [stockView, setStockView] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  const customItems = useMemo(() => parseJsonArray<CustomMaterialItem>(values.customMaterialItems, []), [values.customMaterialItems]);
  const deletedKeys = useMemo(() => new Set(parseJsonArray<string>(values.deletedMaterialKeys, [])), [values.deletedMaterialKeys]);
  const removedLog = useMemo(() => parseJsonArray<RemovedMaterialRecord>(values.removedMaterialLog, []), [values.removedMaterialLog]);
  const removedRecords = useMemo<RemovedMaterialRecord[]>(() => {
    const records=new Map(removedLog.map((item)=>[item.rowKey,item]));
    // Older jobs saved only keys. Reconstruct those rows where they still match
    // the current estimate; keep the key even if the estimate has changed.
    deletedKeys.forEach((rowKey)=>{
      if(records.has(rowKey))return;
      const original=items.find((item)=>'estimate:'+item.category+'::'+item.name+'::'+
        (item.stockRecommendation??'')+'::'+item.unit+'::'+(item.color??'')+'::'+(item.layoutLabel??'')===rowKey);
      records.set(rowKey,{
        rowKey,source:'estimate',name:original?.name??rowKey.split('::')[1]??'Previously excluded line',
        category:original?.category??'Previously excluded',quantity:original?.quantity??0,unit:original?.unit??'ea',
        stockRecommendation:original?.stockRecommendation??'Current item no longer matches saved key',
        color:original?.color,notes:original?.notes,layoutLabel:original?.layoutLabel,
        reason:'unspecified',memo:'',removedAt:'',
      });
    });
    return [...records.values()];
  },[removedLog,deletedKeys,items]);
  const noteOverrides = useMemo(() => {
    const raw = values.materialNoteOverrides;
    if (typeof raw !== 'string' || raw.trim() === '') return {} as Record<string, string>;
    try { const parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}; } catch { return {} as Record<string, string>; }
  }, [values.materialNoteOverrides]);

  const parseOverrideMap = (raw: string | number | boolean | undefined) => {
    if (typeof raw !== 'string' || raw.trim() === '') return {} as Record<string, string>;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
    } catch {
      return {} as Record<string, string>;
    }
  };

  const nameOverrides = useMemo(() => parseOverrideMap(values.materialNameOverrides), [values.materialNameOverrides]);
  const unitOverrides = useMemo(() => parseOverrideMap(values.materialUnitOverrides), [values.materialUnitOverrides]);
  const stockOverrides = useMemo(() => parseOverrideMap(values.materialStockOverrides), [values.materialStockOverrides]);
  const colorOverrides = useMemo(() => parseOverrideMap(values.materialColorOverrides), [values.materialColorOverrides]);

  const quantityOverrides = useMemo(() => {
    const raw = values.materialQuantityOverrides;
    if (typeof raw !== 'string' || raw.trim() === '') return {} as Record<string, number>;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
    } catch {
      return {} as Record<string, number>;
    }
  }, [values.materialQuantityOverrides]);

  const displayItems = useMemo<DisplayMaterialItem[]>(() => {
    const estimateItems = items.map((item) => ({ ...item, rowKey: `estimate:${item.category}::${item.name}::${item.stockRecommendation ?? ''}::${item.unit}::${item.color ?? ''}::${item.layoutLabel ?? ''}`, source: 'estimate' as const }));
    const appendedCustom = customItems.map((item) => ({ ...item, rowKey: `custom:${item.id}`, source: 'custom' as const }));
    return [...estimateItems, ...appendedCustom]
      .map((item) => ({
        ...item,
        name: nameOverrides[item.rowKey] ?? item.name,
        quantity: quantityOverrides[item.rowKey] ?? item.quantity,
        unit: unitOverrides[item.rowKey] ?? item.unit,
        stockRecommendation: stockOverrides[item.rowKey] ?? item.stockRecommendation,
        color: colorOverrides[item.rowKey] ?? item.color,
        notes: noteOverrides[item.rowKey] ?? item.notes,
      }))
      .filter((item) => !deletedKeys.has(item.rowKey));
  }, [items, customItems, deletedKeys, nameOverrides, quantityOverrides, unitOverrides, stockOverrides, colorOverrides, noteOverrides]);

  // Keep every purchasing specification intact. Size-only grouping silently mixes
  // different components such as 2x8 joists, beams, and rim boards.
  const stockOrderIdentity = (item: DisplayMaterialItem) => {
    const name = String(item.name ?? '').trim();
    const stockRecommendation = String(item.stockRecommendation ?? '').trim();
    const color = String(item.color ?? '').trim();
    const unit = String(item.unit ?? '').trim();
    return {
      name,
      key: [name.toLowerCase(), unit.toLowerCase(), stockRecommendation.toLowerCase(), color.toLowerCase()].join('||'),
    };
  };

  const stockOrderItems = useMemo<DisplayMaterialItem[]>(() => {
    const merged = new Map<string, DisplayMaterialItem>();
    // Cut rows describe already-purchased stock and must never count as
    // additional supplier quantities in Stock order view.
    displayItems.filter(item=>item.category!=='Deck finish cut schedule (not order)').forEach((item) => {
      const identity = stockOrderIdentity(item);
      const existing = merged.get(identity.key);
      if (!existing) {
        merged.set(identity.key, { ...item, name: identity.name, category: 'Stock order view', rowKey: `stock:${identity.key}`, source: item.source, notes: item.notes ?? '' });
        return;
      }
      existing.quantity = Number((existing.quantity + item.quantity).toFixed(2));
      existing.cutPlan = mergeMaterialCutPlans(existing.cutPlan, item.cutPlan);
      const drawingLabel = materialDrawingLabel(item);
      const label = drawingLabel ? ` ${drawingLabel}` : '';
      const useNote = item.category + (item.name !== existing.name ? ` - ${item.name}` : '') + label;
      existing.notes = Array.from(new Set([existing.notes, useNote].filter(Boolean).join(' · ').split(' · ').filter(Boolean))).join(' · ');
    });
    // The grouped view is derived only from installer records. It must never
    // apply independent saved edits that would change the actual supplier order.
    return Array.from(merged.values())
      .sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.stockRecommendation).localeCompare(String(b.stockRecommendation)));
  }, [displayItems]);

  const activeItems = stockView ? stockOrderItems : displayItems;
  const grouped = useMemo(() => activeItems.reduce<Record<string, DisplayMaterialItem[]>>((acc, item) => {
    acc[item.category] = acc[item.category] ?? [];
    acc[item.category].push(item);
    return acc;
  }, {}), [activeItems]);

  const hiddenItemCount = removedRecords.length;
  const printGrouped = useMemo(()=>{
    const out={...grouped};
    // Supplier PDF/image exports exclude cut-only installer rows.
    delete out['Deck finish cut schedule (not order)'];
    if(removedRecords.length){
      out['REMOVED / DO NOT ORDER (reference only)']=removedRecords.map((row)=>({
        ...row, category:'REMOVED / DO NOT ORDER (reference only)',
        name:'EXCLUDED: '+row.name,
        notes:REMOVAL_REASONS[row.reason]+' · '+(row.memo||'No additional note')+' · '+(row.notes??''),
      }));
    }
    return out;
  },[grouped,removedRecords]);
  const exportBaseName = sanitizeFilePart(String(values.poJobName ?? 'sns-material-order-list'));
  const updateValue = (key: string, value: string) => onValuesChange((current) => ({ ...current, [key]: value }));
  const persistCustomItems = (nextItems: CustomMaterialItem[]) => onValuesChange((current) => ({ ...current, customMaterialItems: JSON.stringify(nextItems) }));

  const addCustomItem = () => {
    if (!customDraft.name.trim()) return;
    const quantity = Number(customDraft.quantity || 0);
    const nextItem: CustomMaterialItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: customDraft.category.trim() || 'Custom items',
      name: customDraft.name.trim(),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unit: customDraft.unit.trim() || 'ea',
      stockRecommendation: customDraft.stockRecommendation.trim() || 'Custom order item',
      color: customDraft.color.trim() || undefined,
      notes: customDraft.notes.trim() || undefined,
    };
    persistCustomItems([...customItems, nextItem]);
    setCustomDraft(customDefaults);
  };

  const deleteRow = (item: DisplayMaterialItem) => {
    const record:RemovedMaterialRecord={...item,reason:'unspecified',memo:'',removedAt:new Date().toISOString()};
    onValuesChange((current)=>({
      ...current,
      removedMaterialLog:JSON.stringify([...removedRecords.filter((row)=>row.rowKey!==item.rowKey),record]),
      ...(item.source==='custom'
        ? {customMaterialItems:JSON.stringify(customItems.filter((entry)=>entry.id!==item.rowKey.replace('custom:','')))}
        : {deletedMaterialKeys:JSON.stringify([...new Set([...deletedKeys,item.rowKey])])}),
    }));
  };
  const editRemoval=(rowKey:string,changes:Partial<RemovedMaterialRecord>)=>{
    onValuesChange((current)=>({
      ...current, removedMaterialLog:JSON.stringify(removedRecords.map((record)=>
        record.rowKey===rowKey?{...record,...changes}:record)),
    }));
  };
  const restoreRow=(row:RemovedMaterialRecord)=>{
    onValuesChange((current)=>{
      const nextRemoved=removedRecords.filter((record)=>record.rowKey!==row.rowKey);
      const nextDeleted=new Set(deletedKeys);nextDeleted.delete(row.rowKey);
      const existingCustom=parseJsonArray<CustomMaterialItem>(current.customMaterialItems,[]);
      const id=row.rowKey.replace('custom:','');
      return {...current,
        removedMaterialLog:JSON.stringify(nextRemoved),
        deletedMaterialKeys:JSON.stringify([...nextDeleted]),
        ...(row.source==='custom'&&!existingCustom.some((item)=>item.id===id)
          ? {customMaterialItems:JSON.stringify([...existingCustom,{id,category:row.category,name:row.name,quantity:row.quantity,
              unit:row.unit,stockRecommendation:row.stockRecommendation,color:row.color,notes:row.notes,layoutLabel:row.layoutLabel}])}
          : {}),
      };
    });
  };

  const refreshToStandard = () => {
    onValuesChange((current) => ({
      ...current,
      customMaterialItems: JSON.stringify([]),
      deletedMaterialKeys: JSON.stringify([]),
      removedMaterialLog: JSON.stringify([]),
      materialNameOverrides: JSON.stringify({}),
      materialQuantityOverrides: JSON.stringify({}),
      materialUnitOverrides: JSON.stringify({}),
      materialStockOverrides: JSON.stringify({}),
      materialColorOverrides: JSON.stringify({}),
      materialNoteOverrides: JSON.stringify({}),
    }));
    setEditingKey(null);
    setEditingDraft({ name: '', quantity: '', unit: '', stockRecommendation: '', color: '', notes: '' });
  };
  const restoreAllHidden = () => {
    const restoreCustom=removedRecords.filter((row)=>row.source==='custom').map((row)=>({
      id:row.rowKey.replace('custom:',''),category:row.category,name:row.name,quantity:row.quantity,
      unit:row.unit,stockRecommendation:row.stockRecommendation,color:row.color,notes:row.notes,layoutLabel:row.layoutLabel,
    }));
    onValuesChange((current)=>{
      const custom=parseJsonArray<CustomMaterialItem>(current.customMaterialItems,[]);
      const seen=new Set(custom.map((item)=>item.id));
      return {...current,deletedMaterialKeys:JSON.stringify([]),removedMaterialLog:JSON.stringify([]),
        customMaterialItems:JSON.stringify([...custom,...restoreCustom.filter((item)=>!seen.has(item.id))])};
    });
  };
  const startEdit = (item: DisplayMaterialItem) => {
    setEditingKey(item.rowKey);
    setEditingDraft({
      name: String(item.name ?? ''),
      quantity: String(item.quantity ?? ''),
      unit: String(item.unit ?? ''),
      stockRecommendation: String(item.stockRecommendation ?? ''),
      color: String(item.color ?? ''),
      notes: String(item.notes ?? ''),
    });
  };
  const saveEdit = (item: DisplayMaterialItem) => {
    const qty = Number(editingDraft.quantity);
    const normalized = Number.isFinite(qty) && qty >= 0 ? qty : item.quantity;
    if (item.source === 'custom') {
      persistCustomItems(customItems.map((entry) => entry.id === item.rowKey.replace('custom:', '') ? {
        ...entry,
        name: editingDraft.name.trim() || entry.name,
        quantity: normalized,
        unit: editingDraft.unit.trim() || entry.unit,
        stockRecommendation: editingDraft.stockRecommendation.trim() || entry.stockRecommendation,
        color: editingDraft.color.trim() || undefined,
        notes: editingDraft.notes.trim() || undefined,
      } : entry));
    } else {
      const nextNameOverrides = { ...nameOverrides, [item.rowKey]: editingDraft.name.trim() || item.name };
      const nextQuantityOverrides = { ...quantityOverrides, [item.rowKey]: normalized };
      const nextUnitOverrides = { ...unitOverrides, [item.rowKey]: editingDraft.unit.trim() || item.unit };
      const nextStockOverrides = { ...stockOverrides, [item.rowKey]: editingDraft.stockRecommendation.trim() || item.stockRecommendation };
      const nextColorOverrides = { ...colorOverrides, [item.rowKey]: editingDraft.color.trim() };
      const nextNoteOverrides = { ...noteOverrides, [item.rowKey]: editingDraft.notes.trim() };
      onValuesChange((current) => ({
        ...current,
        materialNameOverrides: JSON.stringify(nextNameOverrides),
        materialQuantityOverrides: JSON.stringify(nextQuantityOverrides),
        materialUnitOverrides: JSON.stringify(nextUnitOverrides),
        materialStockOverrides: JSON.stringify(nextStockOverrides),
        materialColorOverrides: JSON.stringify(nextColorOverrides),
        materialNoteOverrides: JSON.stringify(nextNoteOverrides),
      }));
    }
    setEditingKey(null);
    setEditingDraft({ name: '', quantity: '', unit: '', stockRecommendation: '', color: '', notes: '' });
  };
  const cancelEdit = () => { setEditingKey(null); setEditingDraft({ name: '', quantity: '', unit: '', stockRecommendation: '', color: '', notes: '' }); };

  const hasBlockingIssues = validationIssues.length > 0 || items.some((row) => String(row.stockRecommendation ?? '').startsWith('UNAVAILABLE:'));
  const blockingMessage = validationIssues.length ? validationIssues.join(' / ') : 'Resolve unavailable continuous decking cuts before exporting';

  const exportPdf = async () => {
    if (hasBlockingIssues) return;
    const pages = renderMaterialExportPages('S&S Design Build · Material order list', values, printGrouped,orderNotes);
    await exportCanvasesAsPdf(pages, 'S&S Design Build · Material order list', `${exportBaseName}.pdf`);
  };

  const exportPng = async () => {
    if (hasBlockingIssues) return;
    const canvas = stackMaterialExportPages(renderMaterialExportPages('S&S Design Build · Material order list', values, printGrouped,orderNotes));
    await exportCanvasAsPng(canvas, `${exportBaseName}.png`);
  };

  const exportCombinedPdf = async () => {
    if (hasBlockingIssues) return;
    if (serviceSlug === 'decks') {
      setExportMessage('Preparing CAD and material schedules...');
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      try {
        const set = buildConstructionDrawingSet(values, displayItems, { computedItems: items, issues: validationIssues, project });
        if (set.issues.length) { setExportMessage('Correct drawing errors before export: ' + set.issues.join(' / ')); return; }
        const data = constructionVectorPdf(set);
        const url = URL.createObjectURL(new Blob([new Uint8Array(data).buffer], { type: 'application/pdf' }));
        const a = document.createElement('a'); a.href = url; a.download = `${exportBaseName}-cad-materials.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        setExportMessage(`${set.sheets.length} CAD and material schedule sheets exported.`);
      } catch (error) { setExportMessage('CAD export failed: ' + (error instanceof Error ? error.message : 'Review the model inputs.')); }
      return;
    }
    const root = document.getElementById('service-export-root');
    // Include the deck plan and every configured skirting/railing elevation.
    // All these SVGs are driven by the same geometry as the supplier cuts.
    const drawings = Array.from(root?.querySelectorAll('svg:not([data-export-skirting]):not([data-construction-cad])') ?? []) as SVGSVGElement[];
    const skirtingCards = Array.from(root?.querySelectorAll('[data-export-skirt-card="true"]') ?? []);
    if (!drawings.length && !skirtingCards.length) return;
    const layoutTitle = projectExportTitle('S&S Design Build · Layout', values);
    const layoutCanvases = [] as HTMLCanvasElement[];
    for (const svg of drawings) {
      layoutCanvases.push(...await svgElementToExportCanvases(svg, layoutTitle));
    }
    const skirtingSheet = await renderCombinedSkirtingSheet(skirtingCards);
    if (skirtingSheet) layoutCanvases.push(skirtingSheet);
    if (!layoutCanvases.length) return;
    const materialPages = renderMaterialExportPages('S&S Design Build · Material order list', values, printGrouped,orderNotes);
    const forcePortraitByIndex = Object.fromEntries(materialPages.map((_,index)=>[layoutCanvases.length+index,true]));
    await exportCanvasesAsPdf([...layoutCanvases, ...materialPages], 'S&S Design Build · Layout and material order list', `${exportBaseName}-layout-materials.pdf`, { forcePortraitByIndex });
  };

  return (
    <>
    {serviceSlug === 'decks' && <ConstructionCadPanel values={values} items={displayItems} computedItems={items} issues={validationIssues} blocked={hasBlockingIssues} project={project} />}
    <div className="table-card material-table-card">
      <div className="visual-header material-table-header">
        <div>
          <h3>Material order list</h3>
          <span>Grouped by family and board length for faster ordering</span>
        </div>
        <div className="preview-toolbar">
          <button type="button" className={stockView ? 'secondary-btn small-btn' : 'ghost-btn small-btn'} onClick={() => setStockView((current) => !current)}>{stockView ? 'Installer view' : 'Stock order view'}</button>
          <button type="button" className="ghost-btn small-btn" disabled={hasBlockingIssues} title={hasBlockingIssues ? blockingMessage : undefined} onClick={exportPdf}>Export PDF</button>
          <button type="button" className="ghost-btn small-btn" disabled={hasBlockingIssues} title={hasBlockingIssues ? blockingMessage : undefined} onClick={exportPng}>Export image</button>
          <button type="button" className="ghost-btn small-btn" disabled={hasBlockingIssues} title={hasBlockingIssues ? blockingMessage : undefined} onClick={exportCombinedPdf}>{serviceSlug === 'decks' ? 'CAD + material schedules' : 'Export layout + materials'}</button>
        </div>
      </div>

      {exportMessage && <p role="status" aria-live="polite">{exportMessage}</p>}

      {validationIssues.length > 0 && <div role="alert" style={{ border: '1px solid #dc2626', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <strong>Material export blocked — correct drawing errors</strong>
        {validationIssues.map((issue, index) => <p key={index}>{issue}</p>)}
      </div>}
      <div className="material-header-grid compact-grid-4">
        {infoFields.map((field) => field.type === 'select' ? (
          <label key={field.key} className="form-field compact-form-field">
            <span>{field.label}</span>
            <select value={String(values[field.key] ?? 'No')} onChange={(event) => updateValue(field.key, event.target.value)}>
              {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ) : (
          <label key={field.key} className="form-field compact-form-field">
            <span>{field.label}</span>
            <input type={field.type} value={String(values[field.key] ?? '')} onChange={(event) => updateValue(field.key, event.target.value)} />
          </label>
        ))}
      </div>

      <div className="content-card" style={{ marginBottom: '1rem', padding: '1rem' }} data-export-ignore="true">
        <div className="section-heading" style={{ marginBottom: '0.8rem' }}>
          <p className="eyebrow">Custom items</p>
          <h3 style={{ marginBottom: 0 }}>Add anything extra you want ordered on this job</h3>
        </div>
        <div className="compact-grid-4" style={{ display: 'grid', gap: '0.75rem' }}>
          <label className="form-field compact-form-field"><span>Category</span><input value={customDraft.category} onChange={(e) => setCustomDraft((cur) => ({ ...cur, category: e.target.value }))} /></label>
          <label className="form-field compact-form-field"><span>Material name</span><input value={customDraft.name} onChange={(e) => setCustomDraft((cur) => ({ ...cur, name: e.target.value }))} placeholder="Custom order item" /></label>
          <label className="form-field compact-form-field"><span>Quantity</span><input type="number" min="0" step="1" value={customDraft.quantity} onChange={(e) => setCustomDraft((cur) => ({ ...cur, quantity: e.target.value }))} /></label>
          <label className="form-field compact-form-field"><span>Unit</span><input value={customDraft.unit} onChange={(e) => setCustomDraft((cur) => ({ ...cur, unit: e.target.value }))} placeholder="ea" /></label>
          <label className="form-field compact-form-field"><span>Stock recommendation</span><input value={customDraft.stockRecommendation} onChange={(e) => setCustomDraft((cur) => ({ ...cur, stockRecommendation: e.target.value }))} placeholder="Special order / stock size" /></label>
          <label className="form-field compact-form-field"><span>Color</span><input value={customDraft.color} onChange={(e) => setCustomDraft((cur) => ({ ...cur, color: e.target.value }))} placeholder="White / Bronze / etc." /></label>
          <label className="form-field compact-form-field" style={{ gridColumn: 'span 2' }}><span>Notes</span><input value={customDraft.notes} onChange={(e) => setCustomDraft((cur) => ({ ...cur, notes: e.target.value }))} placeholder="Vendor or reminder" /></label>
          <div style={{ display: 'flex', alignItems: 'end', gap: '0.75rem' }}>
            <button type="button" className="secondary-btn" onClick={addCustomItem}>Add custom item</button>
            {hiddenItemCount > 0 && <button type="button" className="ghost-btn" onClick={restoreAllHidden}>Restore deleted items ({hiddenItemCount})</button>}
            <button type="button" className="ghost-btn" onClick={refreshToStandard}>Refresh to standard</button>
          </div>
        </div>
      </div>

      <div className="stack-list material-groups" ref={tableRef}>
        {Object.entries(grouped).map(([category, categoryItems]) => (
          <details key={category} className="material-group" open={category !== 'Deck finish cut schedule (not order)'}>
            <summary className="material-group-header" style={{ cursor: 'pointer' }}>
              <h4>{category}</h4>
              <span>{categoryItems.length} line items</span>
            </summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Material</th>
                    <th>Stock recommendation</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Color</th>
                    <th>Notes</th>
                    <th data-export-ignore="true">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryItems.map((item) => (
                    <tr key={item.rowKey}>
                      <td>{materialDrawingLabel(item)}</td>
                      <td>{editingKey === item.rowKey ? <input type="text" value={editingDraft.name} onChange={(event) => setEditingDraft((current) => ({ ...current, name: event.target.value }))} style={{ width: '100%' }} /> : item.name}</td>
                      <td>{editingKey === item.rowKey ? <input type="text" value={editingDraft.stockRecommendation} onChange={(event) => setEditingDraft((current) => ({ ...current, stockRecommendation: event.target.value }))} style={{ width: '100%' }} /> : item.stockRecommendation}</td>
                      <td>{editingKey === item.rowKey ? <input type="number" min="0" step="0.01" value={editingDraft.quantity} onChange={(event) => setEditingDraft((current) => ({ ...current, quantity: event.target.value }))} style={{ width: '82px' }} /> : item.quantity}</td>
                      <td>{editingKey === item.rowKey ? <input type="text" value={editingDraft.unit} onChange={(event) => setEditingDraft((current) => ({ ...current, unit: event.target.value }))} style={{ width: '72px' }} /> : item.unit}</td>
                      <td>{editingKey === item.rowKey ? <input type="text" value={editingDraft.color} onChange={(event) => setEditingDraft((current) => ({ ...current, color: event.target.value }))} style={{ width: '100%' }} /> : item.color ?? '—'}</td>
                      <td>{editingKey === item.rowKey ? <input type="text" value={editingDraft.notes} onChange={(event) => setEditingDraft((current) => ({ ...current, notes: event.target.value }))} style={{ width: '100%' }} /> : <>{item.notes ?? '—'}<MaterialCutDetails item={item} /></>}</td>
                      <td data-export-ignore="true">
                        {editingKey === item.rowKey ? (
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button type="button" className="ghost-btn small-btn" onClick={() => saveEdit(item)}>Save</button>
                            <button type="button" className="ghost-btn small-btn" onClick={cancelEdit}>Cancel</button>
                          </div>
                        ) : (
                          stockView ? <span title="To change a material, switch to Installer view so both views stay synchronized.">View only</span> : (
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <button type="button" className="ghost-btn small-btn" onClick={() => startEdit(item)}>Edit</button>
                              <button type="button" className="ghost-btn small-btn" onClick={() => deleteRow(item)}>Delete</button>
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
      {hiddenItemCount>0 && <details className="removed-materials-panel">
        <summary>
          <strong>Excluded / removed materials ({hiddenItemCount})</strong>
          <span>Reference only — NOT on supplier order. Expand to show quantities, why they were removed, and restore individual lines.</span>
        </summary>
        <div className="removed-materials-notice">The items below are intentionally omitted from the active purchase order. They remain visible here and under “REMOVED / DO NOT ORDER” in exported PDFs for the crew.</div>
        <div className="table-wrap">
          <table className="removed-materials-table">
            <thead><tr><th>Material</th><th>Original quantity</th><th>Stock / specification</th><th>Removal reason</th><th>Crew / supplier note</th><th>Action</th></tr></thead>
            <tbody>
              {removedRecords.map((row)=><tr key={row.rowKey}>
                <td><strong>{row.name}</strong><small>{row.category}</small></td>
                <td>{row.quantity} {row.unit}</td>
                <td>{row.stockRecommendation}</td>
                <td>
                  <select value={row.reason} aria-label={'Removal reason for '+row.name} onChange={(event)=>
                    editRemoval(row.rowKey,{reason:event.target.value as RemovedMaterialRecord['reason']})}>
                    {Object.entries(REMOVAL_REASONS).map(([key,label])=><option value={key} key={key}>{label}</option>)}
                  </select>
                </td>
                <td><input type="text" value={row.memo??''} placeholder="On-hand location / supplier / substitute"
                  aria-label={'Crew note for '+row.name}
                  onChange={(event)=>editRemoval(row.rowKey,{memo:event.target.value})}/></td>
                <td><button type="button" className="secondary-btn small-btn" onClick={()=>restoreRow(row)}>Restore</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </details>}
    </div>
    </>
  );
}
