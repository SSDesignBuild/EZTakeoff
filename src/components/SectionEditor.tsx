import { parseSections, createSection } from '../lib/sectioning';
import { SectionConfig } from '../lib/types';

interface SectionEditorProps {
  renaissance?: boolean;
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

export function SectionEditor({ renaissance = false, values, onValuesChange }: SectionEditorProps) {
  const sections = parseSections(values.sections, 3);

  const updateSections = (next: SectionConfig[]) => {
    onValuesChange((current) => ({ ...current, sections: JSON.stringify(next) }));
  };

  const updateSection = (id: string, patch: Partial<SectionConfig>) => {
    updateSections(sections.map((section) => section.id === id ? { ...section, ...patch } : section));
  };

  const addSection = () => updateSections([...sections, createSection(sections.length)]);
  const removeSection = (id: string) => sections.length > 1 && updateSections(sections.filter((section) => section.id !== id).map((section, index) => ({ ...section, label: `Section ${index + 1}` })));

  return (
    <section className="content-card">
      <div className="section-heading inline-heading">
        <div>
          <p className="eyebrow">Section editor</p>
          <h3>{renaissance ? 'Renaissance wall sections' : 'Screen room wall sections'}</h3>
        </div>
        <button type="button" className="secondary-btn" onClick={addSection}>Add section</button>
      </div>
      <div className="stack-list">
        {sections.map((section, index) => (
          <div key={section.id} className="section-card">
            <div className="inline-heading">
              <h4>{section.label}</h4>
              <button type="button" className="ghost-btn small-btn" onClick={() => removeSection(section.id)}>Remove</button>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>Width (ft)</span>
                <input type="number" step="0.1" value={section.width} onChange={(event) => updateSection(section.id, { width: Number(event.target.value) })} />
              </label>
              <label className="form-field">
                <span>Height (ft)</span>
                <input type="number" step="0.1" value={section.height} onChange={(event) => updateSection(section.id, { height: Number(event.target.value) })} />
              </label>
              <label className="form-field">
                <span>Uprights</span>
                <input type="number" step="1" min="0" value={section.uprights} onChange={(event) => updateSection(section.id, { uprights: Number(event.target.value) })} />
              </label>
              <label className="form-field">
                <span>Door type</span>
                <select value={section.doorType} onChange={(event) => updateSection(section.id, { doorType: event.target.value as SectionConfig['doorType'] })}>
                  <option value="none">No door</option>
                  <option value="single">Single door</option>
                  <option value="french">French doors</option>
                </select>
              </label>
              <label className="form-field">
                <span>Door placement</span>
                <select value={section.doorPlacement} onChange={(event) => updateSection(section.id, { doorPlacement: event.target.value as SectionConfig['doorPlacement'] })}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="form-field">
                <span>Door swing</span>
                <select value={section.doorSwing} onChange={(event) => updateSection(section.id, { doorSwing: event.target.value as SectionConfig['doorSwing'] })}>
                  <option value="outswing">Outswing</option>
                  <option value="inswing">Inswing</option>
                </select>
              </label>
            </div>
            <div className="toggle-cluster">
              <label className="toggle-field"><input type="checkbox" checked={section.chairRail} onChange={(event) => updateSection(section.id, { chairRail: event.target.checked })} /><div><span>Chair rail</span></div></label>
              <label className="toggle-field"><input type="checkbox" checked={section.pickets} onChange={(event) => updateSection(section.id, { pickets: event.target.checked })} /><div><span>Pickets with chair rail</span></div></label>
              <label className="form-field">
                <span>Kick panel</span>
                <select value={section.kickPanel} onChange={(event) => updateSection(section.id, { kickPanel: event.target.value as SectionConfig['kickPanel'] })}>
                  <option value="none">None</option>
                  <option value="trim-coil">Trim coil kick panel</option>
                  <option value="insulated">Insulated kick panel</option>
                </select>
              </label>
            </div>
            <p className="muted">{renaissance ? 'Custom cut 1x2 7/8 and 2x2 7/8 with decorative brackets.' : '24 ft stock receiver, 1x2, 2x2, and U-channel logic.'} Section {index + 1} can mix doors, pickets, and kick panel types.</p>
          </div>
        ))}
      </div>
    </section>
  );
}
