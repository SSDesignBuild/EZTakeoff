import { useMemo, useRef, useState } from 'react';
import { exportCanvasAsPdf, exportCanvasAsPng, exportCanvasesAsPdf, svgElementToExportCanvases } from '../lib/export';
import { MaterialItem } from '../lib/types';

interface MaterialTableProps {
  items: MaterialItem[];
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

interface CustomMaterialItem extends MaterialItem { id: string; }
interface DisplayMaterialItem extends MaterialItem { rowKey: string; source: 'estimate' | 'custom'; }

const infoFields = [
  { key: 'poJobName', label: 'P.O / Job name', type: 'text' as const },
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

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  let out = value;
  while (out.length > 0 && ctx.measureText(out).width > maxWidth) out = `${out.slice(0, -2)}…`;
  return out;
}

function wrapText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  if (!words.length) return ['—'];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const attempt = `${current} ${words[i]}`;
    if (ctx.measureText(attempt).width <= maxWidth) current = attempt;
    else { lines.push(current); current = words[i]; }
  }
  lines.push(current);
  return lines;
}

function renderMaterialCanvas(title: string, values: Record<string, string | number | boolean>, grouped: Record<string, DisplayMaterialItem[]>) {
  const margin = 28;
  const rowBaseHeight = 28;
  const gutter = 10;
  const minWidths = [52, 150, 128, 44, 44, 130, 180];
  const maxWidths = [60, 210, 260, 58, 58, 220, 320];
  const headers = ['Label', 'Material', 'Stock recommendation', 'Qty', 'Unit', 'Color', 'Notes'];
  const canvas = document.createElement('canvas');
  const probe = canvas.getContext('2d');
  if (!probe) throw new Error('Canvas unavailable');
  probe.font = '12px Arial';
  const colWidths = headers.map((header, idx) => {
    let width = probe.measureText(header).width + 16;
    Object.values(grouped).forEach((rows) => {
      rows.forEach((row) => {
        const value = [row.layoutLabel ?? '', row.name, row.stockRecommendation ?? '', String(row.quantity), row.unit, row.color ?? '—', row.notes ?? '—'][idx];
        const measured = probe.measureText(String(value)).width + 16;
        width = Math.max(width, measured);
      });
    });
    return Math.min(maxWidths[idx], Math.max(minWidths[idx], Math.ceil(width)));
  });
  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0) + gutter * (colWidths.length - 1);
  const pageWidth = Math.max(940, tableWidth + margin * 2);
  const rowHeightsByCategory = Object.fromEntries(Object.entries(grouped).map(([category, rows]) => [category, rows.map((row) => {
    const stockLines = wrapText(probe, row.stockRecommendation ?? '—', colWidths[2] - 16).length;
    const colorLines = wrapText(probe, row.color ?? '—', colWidths[5] - 16).length;
    const noteLines = wrapText(probe, row.notes ?? '—', colWidths[6] - 16).length;
    return Math.max(rowBaseHeight, 18 + Math.max(stockLines, colorLines, noteLines) * 14);
  })]));
  let pageHeight = 138;
  Object.entries(grouped).forEach(([category]) => {
    const heights = rowHeightsByCategory[category] as number[];
    pageHeight += 44 + 28 + heights.reduce((sum, height) => sum + height, 0) + 18;
  });
  pageHeight += String(values.jobNotes ?? '').trim() ? 92 : 32;
  canvas.width = pageWidth;
  canvas.height = Math.max(700, pageHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageWidth, canvas.height);

  ctx.fillStyle = '#111111';
  ctx.font = '700 28px Arial';
  ctx.fillText(title, margin, 44);
  const info = [
    ['P.O / Job name', String(values.poJobName ?? '') || '—'],
    ['Address', String(values.jobAddress ?? '') || '—'],
    ['Phone', String(values.customerPhone ?? '') || '—'],
    ['Balance due', String(values.balanceDueCompletion ?? '') || '—'],
    ['Financed', String(values.financedYesNo ?? 'No')],
    ['Deliver', String(values.deliverYesNo ?? 'No')],
    ['Deliver date', String(values.deliverDate ?? '') || '—'],
  ];
  const infoWidths = info.map(([label, value], idx) => {
    const preferred = idx === 1 ? pageWidth * 0.34 : idx === 0 ? 145 : idx === 3 ? 130 : 105;
    return Math.min(preferred, Math.max(idx === 1 ? 170 : 84, probe.measureText(String(value)).width + 18, probe.measureText(label).width + 12));
  });
  const infoTotal = infoWidths.reduce((a,b) => a+b,0);
  const stretch = Math.max(0, pageWidth - margin * 2 - infoTotal);
  infoWidths[1] += stretch;
  let infoCursor = margin;
  ctx.font = '12px Arial';
  info.forEach(([label, value], idx) => {
    const x = infoCursor; const infoColWidth = infoWidths[idx]; infoCursor += infoColWidth;
    ctx.fillStyle = '#6b7280';
    ctx.fillText(label, x, 68);
    ctx.fillStyle = '#111111';
    ctx.font = '600 14px Arial';
    ctx.fillText(fitText(ctx, value, infoColWidth - 16), x, 88);
    ctx.font = '12px Arial';
  });

  const cols = [margin];
  for (let i = 0; i < colWidths.length - 1; i += 1) cols.push(cols[i] + colWidths[i] + gutter);
  let y = 116;
  Object.entries(grouped).forEach(([category, rows]) => {
    ctx.fillStyle = '#111111';
    ctx.font = '700 18px Arial';
    ctx.fillText(category, margin, y);
    ctx.font = '12px Arial';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`${rows.length} line items`, margin + 220, y);
    y += 16;
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(margin, y, tableWidth, 28);
    ctx.fillStyle = '#111111';
    ctx.font = '600 12px Arial';
    headers.forEach((label, idx) => ctx.fillText(label, cols[idx] + 8, y + 18));
    y += 28;
    ctx.font = '12px Arial';
    rows.forEach((row, idx) => {
      const rowHeight = (rowHeightsByCategory[category] as number[])[idx];
      const rowY = y;
      ctx.fillStyle = idx % 2 ? '#fafafa' : '#ffffff';
      ctx.fillRect(margin, rowY, tableWidth, rowHeight);
      ctx.strokeStyle = '#d1d5db';
      ctx.strokeRect(margin, rowY, tableWidth, rowHeight);
      ctx.fillStyle = '#111111';
      const rowValues = [row.layoutLabel ?? '', row.name];
      rowValues.forEach((value, colIdx) => {
        const x = cols[colIdx] + 8;
        const maxWidth = colWidths[colIdx] - 16;
        ctx.fillText(fitText(ctx, String(value), maxWidth), x, rowY + 18);
      });
      const stockLines = wrapText(ctx, row.stockRecommendation ?? '—', colWidths[2] - 16);
      stockLines.forEach((line, lineIdx) => ctx.fillText(line, cols[2] + 8, rowY + 18 + lineIdx * 14));
      ctx.fillText(fitText(ctx, String(row.quantity), colWidths[3] - 16), cols[3] + 8, rowY + 18);
      ctx.fillText(fitText(ctx, String(row.unit), colWidths[4] - 16), cols[4] + 8, rowY + 18);
      const colorLines = wrapText(ctx, row.color ?? '—', colWidths[5] - 16);
      colorLines.forEach((line, lineIdx) => ctx.fillText(line, cols[5] + 8, rowY + 18 + lineIdx * 14));
      const noteLines = wrapText(ctx, row.notes ?? '—', colWidths[6] - 16);
      noteLines.forEach((line, lineIdx) => ctx.fillText(line, cols[6] + 8, rowY + 18 + lineIdx * 14));
      y += rowHeight;
    });
    y += 20;
  });
  const jobNotes = String(values.jobNotes ?? '').trim();
  if (jobNotes) {
    y += 8;
    ctx.fillStyle = '#111111';
    ctx.font = '700 13px Arial';
    ctx.fillText('Job notes', margin, y);
    y += 18;
    ctx.font = '12px Arial';
    ctx.fillStyle = '#374151';
    wrapText(ctx, jobNotes, pageWidth - margin * 2).forEach((line, idx) => ctx.fillText(line, margin, y + idx * 14));
  }
  return canvas;
}

export function MaterialTable({ items, values, onValuesChange }: MaterialTableProps) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [customDraft, setCustomDraft] = useState(customDefaults);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState({ name: '', quantity: '', unit: '', stockRecommendation: '', color: '', notes: '' });
  const [stockView, setStockView] = useState(false);

  const customItems = useMemo(() => parseJsonArray<CustomMaterialItem>(values.customMaterialItems, []), [values.customMaterialItems]);
  const deletedKeys = useMemo(() => new Set(parseJsonArray<string>(values.deletedMaterialKeys, [])), [values.deletedMaterialKeys]);
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

  const stockOrderIdentity = (item: DisplayMaterialItem) => {
    const name = String(item.name ?? '').trim();
    const stockRecommendation = String(item.stockRecommendation ?? '').trim();
    const color = String(item.color ?? '').trim();
    const unit = String(item.unit ?? '').trim();
    const combined = `${name} ${stockRecommendation}`;
    const lumberMatch = combined.match(/\b(\d+x\d+)\b/i);
    if (lumberMatch && /\b(?:ft|foot)\b/i.test(stockRecommendation)) {
      const size = lumberMatch[1].toLowerCase().replace('x', 'x');
      return {
        name: `${size} lumber`,
        key: [`lumber:${size}`, unit, stockRecommendation.toLowerCase(), color.toLowerCase()].join('||'),
      };
    }
    if (/deck board/i.test(name) && /\b(?:ft|foot)\b/i.test(stockRecommendation)) {
      const normalizedColor = color.toLowerCase();
      const displayColor = color && color !== '—' ? `${color} ` : '';
      return {
        name: `${displayColor}deck boards`,
        key: ['deck-board', unit.toLowerCase(), stockRecommendation.toLowerCase(), normalizedColor].join('||'),
      };
    }
    return { name, key: [name.toLowerCase(), unit, stockRecommendation.toLowerCase(), color.toLowerCase()].join('||') };
  };

  const stockOrderItems = useMemo<DisplayMaterialItem[]>(() => {
    const merged = new Map<string, DisplayMaterialItem>();
    displayItems.forEach((item) => {
      const identity = stockOrderIdentity(item);
      const existing = merged.get(identity.key);
      if (!existing) {
        merged.set(identity.key, { ...item, name: identity.name, category: 'Stock order view', rowKey: `stock:${identity.key}`, source: item.source, notes: item.notes ?? '' });
        return;
      }
      existing.quantity = Number((existing.quantity + item.quantity).toFixed(2));
      const label = item.layoutLabel ? ` ${item.layoutLabel}` : '';
      const useNote = item.category + (item.name !== existing.name ? ` - ${item.name}` : '') + label;
      existing.notes = Array.from(new Set([existing.notes, useNote].filter(Boolean).join(' · ').split(' · ').filter(Boolean))).join(' · ');
    });
    return Array.from(merged.values())
      .map((item) => ({
        ...item,
        name: nameOverrides[item.rowKey] ?? item.name,
        quantity: quantityOverrides[item.rowKey] ?? item.quantity,
        unit: unitOverrides[item.rowKey] ?? item.unit,
        stockRecommendation: stockOverrides[item.rowKey] ?? item.stockRecommendation,
        color: colorOverrides[item.rowKey] ?? item.color,
        notes: noteOverrides[item.rowKey] ?? item.notes,
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.stockRecommendation).localeCompare(String(b.stockRecommendation)));
  }, [displayItems, nameOverrides, quantityOverrides, unitOverrides, stockOverrides, colorOverrides, noteOverrides]);

  const activeItems = stockView ? stockOrderItems : displayItems;
  const grouped = useMemo(() => activeItems.reduce<Record<string, DisplayMaterialItem[]>>((acc, item) => {
    acc[item.category] = acc[item.category] ?? [];
    acc[item.category].push(item);
    return acc;
  }, {}), [activeItems]);

  const hiddenItemCount = deletedKeys.size;
  const exportBaseName = sanitizeFilePart(String(values.poJobName ?? 'sns-material-order-list'));
  const updateValue = (key: string, value: string) => onValuesChange((current) => ({ ...current, [key]: value }));
  const persistCustomItems = (nextItems: CustomMaterialItem[]) => onValuesChange((current) => ({ ...current, customMaterialItems: JSON.stringify(nextItems) }));
  const persistDeletedKeys = (nextKeys: Set<string>) => onValuesChange((current) => ({ ...current, deletedMaterialKeys: JSON.stringify(Array.from(nextKeys)) }));

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
    if (item.source === 'custom') {
      persistCustomItems(customItems.filter((entry) => entry.id !== item.rowKey.replace('custom:', '')));
      return;
    }
    const nextKeys = new Set(deletedKeys);
    nextKeys.add(item.rowKey);
    persistDeletedKeys(nextKeys);
  };

  const refreshToStandard = () => {
    onValuesChange((current) => ({
      ...current,
      customMaterialItems: JSON.stringify([]),
      deletedMaterialKeys: JSON.stringify([]),
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
  const restoreAllHidden = () => persistDeletedKeys(new Set());
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

  const exportPdf = async () => {
    const canvas = renderMaterialCanvas('S&S Design Build · Material order list', values, grouped);
    await exportCanvasAsPdf(canvas, 'S&S Design Build · Material order list', `${exportBaseName}.pdf`);
  };

  const exportPng = async () => {
    const canvas = renderMaterialCanvas('S&S Design Build · Material order list', values, grouped);
    await exportCanvasAsPng(canvas, `${exportBaseName}.png`);
  };

  const exportCombinedPdf = async () => {
    const root = document.getElementById('service-export-root');
    const svg = root?.querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;
    const layoutTitle = projectExportTitle('S&S Design Build · Layout', values);
    const layoutCanvases = await svgElementToExportCanvases(svg, layoutTitle);
    if (!layoutCanvases.length) return;
    const materialCanvas = renderMaterialCanvas('S&S Design Build · Material order list', values, grouped);
    const forcePortraitByIndex = { [layoutCanvases.length]: true } as Record<number, boolean>;
    await exportCanvasesAsPdf([...layoutCanvases, materialCanvas], 'S&S Design Build · Layout and material order list', `${exportBaseName}-layout-materials.pdf`, { forcePortraitByIndex });
  };

  return (
    <div className="table-card material-table-card">
      <div className="visual-header material-table-header">
        <div>
          <h3>Material order list</h3>
          <span>Grouped by family and board length for faster ordering</span>
        </div>
        <div className="preview-toolbar">
          <button type="button" className={stockView ? 'secondary-btn small-btn' : 'ghost-btn small-btn'} onClick={() => setStockView((current) => !current)}>{stockView ? 'Installer view' : 'Stock order view'}</button>
          <button type="button" className="ghost-btn small-btn" onClick={exportPdf}>Export PDF</button>
          <button type="button" className="ghost-btn small-btn" onClick={exportPng}>Export image</button>
          <button type="button" className="ghost-btn small-btn" onClick={exportCombinedPdf}>Export layout + materials</button>
        </div>
      </div>

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
          <div key={category} className="material-group">
            <div className="material-group-header">
              <h4>{category}</h4>
              <span>{categoryItems.length} line items</span>
            </div>
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
                      <td>{item.layoutLabel ?? ''}</td>
                      <td>{editingKey === item.rowKey ? <input type="text" value={editingDraft.name} onChange={(event) => setEditingDraft((current) => ({ ...current, name: event.target.value }))} style={{ width: '100%' }} /> : item.name}</td>
                      <td>{editingKey === item.rowKey ? <input type="text" value={editingDraft.stockRecommendation} onChange={(event) => setEditingDraft((current) => ({ ...current, stockRecommendation: event.target.value }))} style={{ width: '100%' }} /> : item.stockRecommendation}</td>
                      <td>{editingKey === item.rowKey ? <input type="number" min="0" step="0.01" value={editingDraft.quantity} onChange={(event) => setEditingDraft((current) => ({ ...current, quantity: event.target.value }))} style={{ width: '82px' }} /> : item.quantity}</td>
                      <td>{editingKey === item.rowKey ? <input type="text" value={editingDraft.unit} onChange={(event) => setEditingDraft((current) => ({ ...current, unit: event.target.value }))} style={{ width: '72px' }} /> : item.unit}</td>
                      <td>{editingKey === item.rowKey ? <input type="text" value={editingDraft.color} onChange={(event) => setEditingDraft((current) => ({ ...current, color: event.target.value }))} style={{ width: '100%' }} /> : item.color ?? '—'}</td>
                      <td>{editingKey === item.rowKey ? <input type="text" value={editingDraft.notes} onChange={(event) => setEditingDraft((current) => ({ ...current, notes: event.target.value }))} style={{ width: '100%' }} /> : item.notes ?? '—'}</td>
                      <td data-export-ignore="true">
                        {editingKey === item.rowKey ? (
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button type="button" className="ghost-btn small-btn" onClick={() => saveEdit(item)}>Save</button>
                            <button type="button" className="ghost-btn small-btn" onClick={cancelEdit}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button type="button" className="ghost-btn small-btn" onClick={() => startEdit(item)}>Edit</button>
                            <button type="button" className="ghost-btn small-btn" onClick={() => deleteRow(item)}>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
