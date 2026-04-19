import { useMemo, useRef, useState } from 'react';
import { exportCanvasAsPdf, exportCanvasAsPng, exportCanvasesAsPdf, svgElementToCanvas } from '../lib/export';
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

function sanitizeFilePart(value: string) {
  return value.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-').toLowerCase() || 'sns-material-order-list';
}

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  let out = value;
  while (out.length > 0 && ctx.measureText(out).width > maxWidth) out = `${out.slice(0, -2)}…`;
  return out;
}

function renderMaterialCanvas(title: string, values: Record<string, string | number | boolean>, grouped: Record<string, DisplayMaterialItem[]>) {
  const margin = 28;
  const rowHeight = 28;
  const gutter = 14;
  const minWidths = [160, 48, 52, 136, 72, 120];
  const maxWidths = [240, 64, 72, 200, 120, 200];
  const headers = ['Material', 'Qty', 'Unit', 'Stock recommendation', 'Color', 'Notes'];
  const canvas = document.createElement('canvas');
  const probe = canvas.getContext('2d');
  if (!probe) throw new Error('Canvas unavailable');
  probe.font = '12px Arial';
  const colWidths = headers.map((header, idx) => {
    let width = probe.measureText(header).width + 16;
    Object.values(grouped).forEach((rows) => {
      rows.forEach((row) => {
        const value = [row.name, String(row.quantity), row.unit, row.stockRecommendation ?? '', row.color ?? '—', row.notes ?? '—'][idx];
        width = Math.max(width, probe.measureText(String(value)).width + 16);
      });
    });
    return Math.min(maxWidths[idx], Math.max(minWidths[idx], Math.ceil(width)));
  });
  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0) + gutter * (colWidths.length - 1);
  const pageWidth = Math.max(900, tableWidth + margin * 2);
  let pageHeight = 138;
  Object.values(grouped).forEach((rows) => {
    pageHeight += 44 + 28 + rows.length * rowHeight + 18;
  });
  pageHeight += 32;
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
    ['Deliver', String(values.deliverYesNo ?? 'No')],
    ['Deliver date', String(values.deliverDate ?? '') || '—'],
  ];
  const infoColWidth = (pageWidth - margin * 2) / Math.max(1, info.length);
  ctx.font = '12px Arial';
  info.forEach(([label, value], idx) => {
    const x = margin + idx * infoColWidth;
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
      const rowY = y + idx * rowHeight;
      ctx.fillStyle = idx % 2 ? '#fafafa' : '#ffffff';
      ctx.fillRect(margin, rowY, tableWidth, rowHeight);
      ctx.strokeStyle = '#d1d5db';
      ctx.strokeRect(margin, rowY, tableWidth, rowHeight);
      ctx.fillStyle = '#111111';
      const rowValues = [row.name, String(row.quantity), row.unit, row.stockRecommendation ?? '', row.color ?? '—', row.notes ?? '—'];
      rowValues.forEach((value, colIdx) => {
        const x = cols[colIdx] + 8;
        const maxWidth = colWidths[colIdx] - 16;
        ctx.fillText(fitText(ctx, String(value), maxWidth), x, rowY + 18);
      });
    });
    y += rows.length * rowHeight + 20;
  });
  return canvas;
}

export function MaterialTable({ items, values, onValuesChange }: MaterialTableProps) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [customDraft, setCustomDraft] = useState(customDefaults);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<string>('');

  const customItems = useMemo(() => parseJsonArray<CustomMaterialItem>(values.customMaterialItems, []), [values.customMaterialItems]);
  const deletedKeys = useMemo(() => new Set(parseJsonArray<string>(values.deletedMaterialKeys, [])), [values.deletedMaterialKeys]);
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
    const estimateItems = items.map((item, index) => ({ ...item, rowKey: `estimate:${item.category}::${item.name}::${index}`, source: 'estimate' as const }));
    const appendedCustom = customItems.map((item) => ({ ...item, rowKey: `custom:${item.id}`, source: 'custom' as const }));
    return [...estimateItems, ...appendedCustom]
      .map((item) => ({ ...item, quantity: quantityOverrides[item.rowKey] ?? item.quantity }))
      .filter((item) => !deletedKeys.has(item.rowKey));
  }, [items, customItems, deletedKeys, quantityOverrides]);

  const grouped = useMemo(() => displayItems.reduce<Record<string, DisplayMaterialItem[]>>((acc, item) => {
    acc[item.category] = acc[item.category] ?? [];
    acc[item.category].push(item);
    return acc;
  }, {}), [displayItems]);

  const hiddenItemCount = deletedKeys.size;
  const exportBaseName = sanitizeFilePart(String(values.poJobName ?? 'sns-material-order-list'));
  const updateValue = (key: string, value: string) => onValuesChange((current) => ({ ...current, [key]: value }));
  const persistCustomItems = (nextItems: CustomMaterialItem[]) => onValuesChange((current) => ({ ...current, customMaterialItems: JSON.stringify(nextItems) }));
  const persistDeletedKeys = (nextKeys: Set<string>) => onValuesChange((current) => ({ ...current, deletedMaterialKeys: JSON.stringify(Array.from(nextKeys)) }));
  const persistQuantityOverrides = (nextOverrides: Record<string, number>) => onValuesChange((current) => ({ ...current, materialQuantityOverrides: JSON.stringify(nextOverrides) }));

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

  const restoreAllHidden = () => persistDeletedKeys(new Set());
  const startEdit = (item: DisplayMaterialItem) => { setEditingKey(item.rowKey); setEditingQuantity(String(quantityOverrides[item.rowKey] ?? item.quantity)); };
  const saveQuantity = (item: DisplayMaterialItem) => {
    const qty = Number(editingQuantity);
    const normalized = Number.isFinite(qty) && qty >= 0 ? qty : item.quantity;
    if (item.source === 'custom') persistCustomItems(customItems.map((entry) => entry.id === item.rowKey.replace('custom:', '') ? { ...entry, quantity: normalized } : entry));
    else persistQuantityOverrides({ ...quantityOverrides, [item.rowKey]: normalized });
    setEditingKey(null); setEditingQuantity('');
  };
  const cancelEdit = () => { setEditingKey(null); setEditingQuantity(''); };

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
    const layoutCanvas = await svgElementToCanvas(svg);
    if (!layoutCanvas) return;
    const materialCanvas = renderMaterialCanvas('S&S Design Build · Material order list', values, grouped);
    await exportCanvasesAsPdf([layoutCanvas, materialCanvas], 'S&S Design Build · Layout and material order list', `${exportBaseName}-layout-materials.pdf`);
  };

  return (
    <div className="table-card material-table-card">
      <div className="visual-header material-table-header">
        <div>
          <h3>Material order list</h3>
          <span>Grouped by family and board length for faster ordering</span>
        </div>
        <div className="preview-toolbar">
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
                    <th>Material</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Stock recommendation</th>
                    <th>Color</th>
                    <th>Notes</th>
                    <th data-export-ignore="true">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryItems.map((item) => (
                    <tr key={item.rowKey}>
                      <td>{item.name}</td>
                      <td>{editingKey === item.rowKey ? <input type="number" min="0" step="0.01" value={editingQuantity} onChange={(event) => setEditingQuantity(event.target.value)} style={{ width: '82px' }} /> : item.quantity}</td>
                      <td>{item.unit}</td>
                      <td>{item.stockRecommendation}</td>
                      <td>{item.color ?? '—'}</td>
                      <td>{item.notes ?? '—'}</td>
                      <td data-export-ignore="true">
                        {editingKey === item.rowKey ? (
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button type="button" className="ghost-btn small-btn" onClick={() => saveQuantity(item)}>Save</button>
                            <button type="button" className="ghost-btn small-btn" onClick={cancelEdit}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button type="button" className="ghost-btn small-btn" onClick={() => startEdit(item)}>Edit qty</button>
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
