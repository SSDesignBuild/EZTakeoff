import { useMemo, useRef } from 'react';
import { MaterialItem } from '../lib/types';

interface MaterialTableProps {
  items: MaterialItem[];
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

const infoFields = [
  { key: 'poJobName', label: 'P.O / Job name', type: 'text' as const },
  { key: 'jobAddress', label: 'Address', type: 'text' as const },
  { key: 'deliverYesNo', label: 'Deliver', type: 'select' as const, options: ['No', 'Yes'] },
  { key: 'deliverDate', label: 'Deliver date', type: 'date' as const },
];

export function MaterialTable({ items, values, onValuesChange }: MaterialTableProps) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const grouped = useMemo(() => items.reduce<Record<string, MaterialItem[]>>((accumulator, item) => {
    accumulator[item.category] = accumulator[item.category] ?? [];
    accumulator[item.category].push(item);
    return accumulator;
  }, {}), [items]);

  const updateValue = (key: string, value: string) => onValuesChange((current) => ({ ...current, [key]: value }));

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

  const exportPdf = () => {
    const win = window.open('', '_blank', 'width=1400,height=1000');
    if (!win) return;
    win.document.write(buildPrintHtml());
    win.document.close();
    win.focus();
    window.setTimeout(() => win.print(), 180);
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
      link.download = 'sns-material-order-list.png';
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
                  </tr>
                </thead>
                <tbody>
                  {categoryItems.map((item) => (
                    <tr key={`${item.category}-${item.name}`}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{item.unit}</td>
                      <td>{item.stockRecommendation}</td>
                      <td>{item.notes ?? '—'}</td>
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
