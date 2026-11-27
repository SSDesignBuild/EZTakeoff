import { useMemo, useState } from 'react';
import type { MaterialItem } from '../lib/types';
import { buildProjectConstructionDrawingSet as buildConstructionDrawingSet } from '../lib/constructionProjectCad';
import { constructionSheetSvg } from '../lib/constructionCadScene';
import { constructionDxf, constructionVectorPdf } from '../lib/constructionCadExport';
import type { ConsultationProject } from '../lib/consultationProject';
import { buildConstructionAssembly } from '../lib/constructionAssembly';
import { constructionAssemblyCsv } from '../lib/constructionAssemblyCsv';

interface Props {
  values: Record<string, string | number | boolean>;
  items: MaterialItem[];
  computedItems: MaterialItem[];
  issues: string[];
  blocked: boolean;
  project?: ConsultationProject;
}
export function ConstructionCadPanel({ values, items, computedItems, issues, blocked, project }: Props) {
  const [open, setOpen] = useState(true), [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const [sheetKind, setSheetKind] = useState<'drawings' | 'schedules' | 'all'>('drawings');
  const [zoom, setZoom] = useState(0);
  // This panel mounts on the review step, outside normal geometry editing.
  const { drawing, previewError } = useMemo(() => {
    if (!open) return { drawing: null, previewError: '' };
    try { return { drawing: buildConstructionDrawingSet(values, items, { issues, computedItems, project }), previewError: '' }; }
    catch (error) { return { drawing: null, previewError: 'Review model inputs before drawing: ' + (error instanceof Error ? error.message : 'The current geometry could not be drawn.') }; }
  }, [open, values, items, computedItems, issues, project]);
  const visibleSheets = drawing?.sheets.map((sheet, i) => ({ sheet, i })).filter(({ sheet }) =>
    sheetKind === 'all' || (sheetKind === 'drawings' ? sheet.scale !== 1 : sheet.scale === 1)) ?? [];
  const index = visibleSheets.some(s => s.i === selected) ? selected : visibleSheets[0]?.i ?? 0;
  const svg = drawing?.sheets[index] ? constructionSheetSvg(drawing.sheets[index], drawing.blocks) : '';
  const download = async (format: 'pdf' | 'dxf' | 'csv') => {
    if (busy || blocked) return;
    setBusy(true); setStatus('Preparing construction sheets...');
    try {
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      const set = drawing ?? buildConstructionDrawingSet(values, items, { issues, computedItems, project });
      if (set.issues.length) { setStatus('Correct model errors before export: ' + set.issues.join(' / ')); return; }
      const data = format === 'pdf' ? constructionVectorPdf(set) : format === 'dxf' ? constructionDxf(set)
        : constructionAssemblyCsv(buildConstructionAssembly(values, { project }));
      const part: BlobPart = typeof data === 'string' ? data : new Uint8Array(data).buffer;
      const blob = new Blob([part], { type: format === 'pdf' ? 'application/pdf' : format === 'dxf' ? 'application/dxf;charset=utf-8' : 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      const base = String(values.poJobName || 'sns-deck').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'sns-deck';
      a.href = url; a.download = `${base}-construction-rev-${set.revision.replace(/[^a-z0-9-]/gi, '') || 'A'}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setStatus(format === 'csv' ? 'Complete deck part and connection register exported in inches.'
        : `${set.sheets.length} construction sheets exported as ${format === 'pdf' ? 'vector PDF' : 'native DXF'}.`);
    } catch (error) {
      setStatus('Construction export could not finish: ' + (error instanceof Error ? error.message : 'Please review model inputs.'));
    } finally { setBusy(false); }
  };
  return <section aria-label="Construction drawings" style={{ margin: '16px 0', border: '1px solid #cbd5e1', borderRadius: 10, background: '#f8fafc', padding: 16 }}>
    <div className="visual-header" style={{ gap: 14, flexWrap: 'wrap' }}>
      <div><h3 style={{ margin: '0 0 5px' }}>Installer CAD drawings</h3>
        <p style={{ margin: 0, maxWidth: 650, color: '#475569', fontSize: 13 }}>Scaled member plans, setout dimensions, individual part references, stairs and connection schedules from the configured model.</p></div>
      <div className="preview-toolbar">
        <button type="button" className="ghost-btn small-btn" onClick={() => setOpen(v => !v)} data-testid="construction-cad-review">{open ? 'Close sheets' : 'Review sheets'}</button>
        <button type="button" className="ghost-btn small-btn" disabled={blocked || busy} onClick={() => void download('pdf')} data-testid="construction-cad-pdf">Vector PDF</button>
        <button type="button" className="ghost-btn small-btn" disabled={blocked || busy} onClick={() => void download('dxf')} data-testid="construction-cad-dxf">CAD DXF</button>
        <button type="button" className="ghost-btn small-btn" disabled={blocked || busy} onClick={() => void download('csv')}>Deck parts CSV</button>
      </div>
    </div>
    <p style={{ color: '#475569', fontSize: 12, margin: '10px 0 0' }}>PDF: 17 x 11 in, print at 100% and check the scale bar. DXF: full-size inches, editable dimensions and scaled sheet layouts. Connection locations are shown; use the selected hardware instructions for drilling and fastening.</p>
    {status && <p role="status" aria-live="polite" style={{ fontSize: 13, marginBottom: 0 }}>{status}</p>}
    {previewError && <p role="alert" style={{ color: '#991b1b', fontSize: 13 }}>{previewError}</p>}
    {open && drawing && <div style={{ marginTop: 14 }}>
      {drawing.issues.length > 0 && <div role="alert" style={{ color: '#991b1b', marginBottom: 10 }}>{drawing.issues.join(' / ')}</div>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>Sheet
        <select aria-label="Sheet group" value={sheetKind} onChange={e => setSheetKind(e.target.value as typeof sheetKind)}>
          <option value="drawings">Drawings</option><option value="schedules">Schedules</option><option value="all">All sheets</option>
        </select>
        <select value={index} onChange={event => setSelected(Number(event.target.value))} aria-label="Construction sheet" style={{ maxWidth: '100%', padding: 7 }}>
          {visibleSheets.map(({ sheet, i }) => <option value={i} key={sheet.id}>{sheet.id} - {sheet.title}</option>)}
        </select>
        <span>{index + 1} / {drawing.sheets.length}</span>
        <select aria-label="Drawing preview zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>
          <option value={0}>Fit width</option><option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option>
        </select>
      </label>
      <div style={{ marginTop: 12, overflow: 'auto', border: '1px solid #94a3b8', background: 'white' }}>
        <div data-testid="construction-cad-sheet" style={{ minWidth: 720, width: zoom ? (drawing.sheets[index]?.width ?? 1224) * zoom : '100%' }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="display:block;width:100%;height:auto" ') }}/>
      </div>
      {drawing.warnings.length > 0 && <details style={{ marginTop: 12, fontSize: 12, color: '#475569' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Drawing basis and outstanding details ({drawing.warnings.length})</summary>
        <ul style={{ paddingLeft: 20 }}>{drawing.warnings.map((note, i) => <li key={i} style={{ margin: '7px 0' }}>{note}</li>)}</ul>
      </details>}
    </div>}
  </section>;
}
