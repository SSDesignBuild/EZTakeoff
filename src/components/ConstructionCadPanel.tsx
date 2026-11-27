import { useMemo, useState } from 'react';
import type { MaterialItem } from '../lib/types';
import { buildConstructionDrawingSet } from '../lib/constructionCad';
import { constructionSheetSvg } from '../lib/constructionCadScene';
import { constructionDxf, constructionVectorPdf } from '../lib/constructionCadExport';

interface Props {
  values: Record<string, string | number | boolean>;
  items: MaterialItem[];
  computedItems: MaterialItem[];
  issues: string[];
  blocked: boolean;
}
export function ConstructionCadPanel({ values, items, computedItems, issues, blocked }: Props) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  // Keep CAD work out of normal form editing until the reviewer opens sheets.
  const drawing = useMemo(() => open ? buildConstructionDrawingSet(values, items, { issues, computedItems }) : null,
    [open, values, items, computedItems, issues]);
  const index = Math.min(selected, Math.max(0, (drawing?.sheets.length ?? 1) - 1));
  const svg = drawing?.sheets[index] ? constructionSheetSvg(drawing.sheets[index], drawing.blocks) : '';
  const download = async (format: 'pdf' | 'dxf') => {
    if (busy || blocked) return;
    setBusy(true); setStatus('Preparing construction sheets...');
    try {
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      const set = drawing ?? buildConstructionDrawingSet(values, items, { issues, computedItems });
      if (set.issues.length) { setStatus('Correct model errors before export: ' + set.issues.join(' / ')); return; }
      const data = format === 'pdf' ? constructionVectorPdf(set) : constructionDxf(set);
      const part: BlobPart = typeof data === 'string' ? data : new Uint8Array(data).buffer;
      const blob = new Blob([part], { type: format === 'pdf' ? 'application/pdf' : 'application/dxf;charset=utf-8' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      const base = String(values.poJobName || 'sns-deck').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'sns-deck';
      a.href = url; a.download = `${base}-construction-rev-${set.revision.replace(/[^a-z0-9-]/gi, '') || 'A'}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setStatus(`${set.sheets.length} construction sheets exported as ${format === 'pdf' ? 'vector PDF' : 'native DXF'}.`);
    } catch (error) {
      setStatus('Construction export could not finish: ' + (error instanceof Error ? error.message : 'Please review model inputs.'));
    } finally { setBusy(false); }
  };
  return <section aria-label="Construction drawings" style={{ margin: '16px 0', border: '1px solid #cbd5e1', borderRadius: 10, background: '#f8fafc', padding: 16 }}>
    <div className="visual-header" style={{ gap: 14, flexWrap: 'wrap' }}>
      <div><h3 style={{ margin: '0 0 5px' }}>Construction drawings</h3>
        <p style={{ margin: 0, maxWidth: 650, color: '#475569', fontSize: 13 }}>Dimensioned footing, framing, decking, stair and connection sheets with your current hardware and member order.</p></div>
      <div className="preview-toolbar">
        <button type="button" className="ghost-btn small-btn" onClick={() => setOpen(v => !v)} data-testid="construction-cad-review">{open ? 'Close sheets' : 'Review sheets'}</button>
        <button type="button" className="ghost-btn small-btn" disabled={blocked || busy} onClick={() => void download('pdf')} data-testid="construction-cad-pdf">Vector PDF</button>
        <button type="button" className="ghost-btn small-btn" disabled={blocked || busy} onClick={() => void download('dxf')} data-testid="construction-cad-dxf">CAD DXF</button>
      </div>
    </div>
    <p style={{ color: '#475569', fontSize: 12, margin: '10px 0 0' }}>PDF: 17 x 11 in, print at 100%. DXF: inches at 1:1 with editable dimensions. Confirm field conditions and approved structural connections.</p>
    {status && <p role="status" aria-live="polite" style={{ fontSize: 13, marginBottom: 0 }}>{status}</p>}
    {open && drawing && <div style={{ marginTop: 14 }}>
      {drawing.issues.length > 0 && <div role="alert" style={{ color: '#991b1b', marginBottom: 10 }}>{drawing.issues.join(' / ')}</div>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>Sheet
        <select value={index} onChange={event => setSelected(Number(event.target.value))} aria-label="Construction sheet" style={{ maxWidth: '100%', padding: 7 }}>
          {drawing.sheets.map((sheet, i) => <option value={i} key={sheet.id}>{sheet.id} - {sheet.title}</option>)}
        </select>
        <span>{index + 1} / {drawing.sheets.length}</span>
      </label>
      <div style={{ marginTop: 12, overflow: 'auto', border: '1px solid #94a3b8', background: 'white' }}>
        <div data-testid="construction-cad-sheet" style={{ minWidth: 720 }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="display:block;width:100%;height:auto" ') }}/>
      </div>
      {drawing.warnings[0] && <p style={{ fontSize: 12, color: '#475569' }}>{drawing.warnings[0]}</p>}
    </div>}
  </section>;
}
