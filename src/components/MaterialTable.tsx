import { useMemo, useRef, useState } from 'react';
import { exportElementAsPdf } from '../lib/export';
import { MaterialItem } from '../lib/types';

interface MaterialTableProps {
  items: MaterialItem[];
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

interface CustomMaterialItem extends MaterialItem {
  id: string;
}

interface DisplayMaterialItem extends MaterialItem {
  rowKey: string;
  source: 'estimate' | 'custom';
}

const infoFields = [
  { key: 'poJobName', label: 'P.O / Job name', type: 'text' as const },
  { key: 'jobAddress', label: 'Address', type: 'text' as const },
  { key: 'deliverYesNo', label: 'Deliver', type: 'select' as const, options: ['No', 'Yes'] },
  { key: 'deliverDate', label: 'Deliver date', type: 'date' as const },
];

const customDefaults = {
  category: 'Custom items',
  name: '',
  quantity: '1',
  unit: 'ea',
  stockRecommendation: '',
  notes: '',
};

function parseJsonArray<T>(raw: string | number | boolean | undefined, fallback: T[]): T[] {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeFilePart(value: string) {
  return value.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-').toLowerCase() || 'sns-material-order-list';
}

export function MaterialTable({ items, values, onValuesChange }: MaterialTableProps) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [customDraft, setCustomDraft] = useState(customDefaults);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<string>('');

  const customItems = useMemo(
    () => parseJsonArray<CustomMaterialItem>(values.customMaterialItems, []),
    [values.customMaterialItems],
  );
  const deletedKeys = useMemo(
    () => new Set(parseJsonArray<string>(values.deletedMaterialKeys, [])),
    [values.deletedMaterialKeys],
  );
  const quantityOverrides = useMemo(
    () => {
      const raw = values.materialQuantityOverrides;
      if (typeof raw !== 'string' || raw.trim() === '') return {} as Record<string, number>;
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
      } catch {
        return {} as Record<string, number>;
      }
    },
    [values.materialQuantityOverrides],
  );

  const displayItems = useMemo<DisplayMaterialItem[]>(() => {
    const estimateItems = items.map((item, index) => ({
      ...item,
      rowKey: `estimate:${item.category}::${item.name}::${index}`,
      source: 'estimate' as const,
    }));
    const appendedCustom = customItems.map((item) => ({
      ...item,
      rowKey: `custom:${item.id}`,
      source: 'custom' as const,
    }));
    return [...estimateItems, ...appendedCustom]
      .map((item) => ({ ...item, quantity: quantityOverrides[item.rowKey] ?? item.quantity }))
      .filter((item) => !deletedKeys.has(item.rowKey));
  }, [items, customItems, deletedKeys, quantityOverrides]);

  const grouped = useMemo(
    () => displayItems.reduce<Record<string, DisplayMaterialItem[]>>((accumulator, item) => {
      accumulator[item.category] = accumulator[item.category] ?? [];
      accumulator[item.category].push(item);
      return accumulator;
    }, {}),
    [displayItems],
  );

  const hiddenItemCount = deletedKeys.size;

  const updateValue = (key: string, value: string) => onValuesChange((current) => ({ ...current, [key]: value }));

  const persistCustomItems = (nextItems: CustomMaterialItem[]) => {
    onValuesChange((current) => ({
      ...current,
      customMaterialItems: JSON.stringify(nextItems),
    }));
  };

  const persistDeletedKeys = (nextKeys: Set<string>) => {
    onValuesChange((current) => ({
      ...current,
      deletedMaterialKeys: JSON.stringify(Array.from(nextKeys)),
    }));
  };


  const persistQuantityOverrides = (nextOverrides: Record<string, number>) => {
    onValuesChange((current) => ({
      ...current,
      materialQuantityOverrides: JSON.stringify(nextOverrides),
    }));
  };

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

  const restoreAllHidden = () => {
    persistDeletedKeys(new Set());
  };


  const startEdit = (item: DisplayMaterialItem) => {
    setEditingKey(item.rowKey);
    setEditingQuantity(String(quantityOverrides[item.rowKey] ?? item.quantity));
  };

  const saveQuantity = (item: DisplayMaterialItem) => {
    const qty = Number(editingQuantity);
    const normalized = Number.isFinite(qty) && qty >= 0 ? qty : item.quantity;
    if (item.source === 'custom') {
      persistCustomItems(customItems.map((entry) => entry.id === item.rowKey.replace('custom:', '') ? { ...entry, quantity: normalized } : entry));
    } else {
      persistQuantityOverrides({ ...quantityOverrides, [item.rowKey]: normalized });
    }
    setEditingKey(null);
    setEditingQuantity('');
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingQuantity('');
  };

  const exportCombinedPdf = async () => {
    const root = document.getElementById('service-export-root');
    if (!root) return;
    await exportElementAsPdf(root as HTMLElement, 'S&S Design Build · Layout and material order list', `${exportBaseName}-layout-materials.pdf`);
  };

  const buildPrintHtml = () => {
    const headerHtml = `
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px;font-family:Inter,Arial,sans-serif;">
        <div><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.08em">P.O / Job name</div><div style="font-weight:600">${String(values.poJobName ?? '') || '—'}</div></div>
        <div><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.08em">Address</div><div style="font-weight:600">${String(values.jobAddress ?? '') || '—'}</div></div>
        <div><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.08em">Deliver</div><div style="font-weight:600">${String(values.deliverYesNo ?? 'No')}</div></div>
        <div><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.08em">Deliver date</div><div style="font-weight:600">${String(values.deliverDate ?? '') || '—'}</div></div>
      </div>`;
    const bodyHtml = tableRef.current?.innerHTML ?? '';
    return `<!doctype html><html><head><title>Material order list</title><style>
      @page { size: letter landscape; margin: 0.35in; }
      body{font-family:Inter,Arial,sans-serif;margin:0;padding:18px;color:#111;background:#fff}
      h1{font-size:20px;margin:0 0 14px}
      .material-group{margin-bottom:18px}
      .material-group-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #d1d5db;padding:6px 7px;text-align:left;vertical-align:top}
      th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
    </style></head><body><h1>S&S Design Build · Material order list</h1>${headerHtml}${bodyHtml}</body></html>`;
  };

  const exportBaseName = sanitizeFilePart(String(values.poJobName ?? 'sns-material-order-list'));

  const exportPdf = async () => {
    if (!tableRef.current) return;
    await exportElementAsPdf(tableRef.current, 'S&S Design Build · Material order list', `${exportBaseName}.pdf`);
  };

  const exportPng = async () => {
    if (!tableRef.current) return;
    const wrapper = document.createElement('div');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrapper.style.background = '#ffffff';
    wrapper.style.padding = '20px';
    wrapper.style.width = '1400px';
    wrapper.style.fontFamily = 'Inter, Arial, sans-serif';
    wrapper.innerHTML = `<h1 style="margin:0 0 14px;font-size:22px;color:#111">S&S Design Build · Material order list</h1>${buildPrintHtml().match(/<body>([\s\S]*)<\/body>/)?.[1] ?? tableRef.current.outerHTML}`;
    const data = new XMLSerializer().serializeToString(wrapper);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="${Math.max(900, tableRef.current.scrollHeight + 280)}"><foreignObject width="100%" height="100%">${data}</foreignObject></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1500;
      canvas.height = Math.max(900, tableRef.current?.scrollHeight ? tableRef.current.scrollHeight + 280 : 900);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${exportBaseName}.png`;
      link.click();
    };
    img.src = url;
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
          <label className="form-field compact-form-field" style={{ gridColumn: 'span 2' }}><span>Notes</span><input value={customDraft.notes} onChange={(e) => setCustomDraft((cur) => ({ ...cur, notes: e.target.value }))} placeholder="Vendor, color, or reminder" /></label>
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
