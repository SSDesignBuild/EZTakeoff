import { createSunroomSection, parseSunroomSections } from '../lib/sectioning';
import { SunroomSectionConfig } from '../lib/types';

interface Props {
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

export function SunroomSectionEditor({ values, onValuesChange }: Props) {
  const sections = parseSunroomSections(values.sunroomSections, 3);
  const updateSections = (next: SunroomSectionConfig[]) => {
    onValuesChange((current) => ({ ...current, sunroomSections: JSON.stringify(next.map((section, index) => ({ ...section, label: `Section ${index + 1}` }))) }));
  };
  const updateSection = (id: string, patch: Partial<SunroomSectionConfig>) => updateSections(sections.map((section) => section.id === id ? { ...section, ...patch } : section));
  const addSection = () => {
    const template = sections[0] ?? createSunroomSection(0);
    updateSections([...sections, createSunroomSection(sections.length, { ...template, id: undefined as never, label: `Section ${sections.length + 1}` })]);
  };
  const removeSection = (id: string) => sections.length > 1 && updateSections(sections.filter((section) => section.id !== id));

  return <section className="content-card"><div className="section-heading inline-heading"><div><p className="eyebrow">Section editor</p><h3>Sunroom wall sections</h3></div><div className="tag-row"><span className="tag">24 ft stock logic with individually editable sections</span><button type="button" className="secondary-btn" onClick={addSection}>Add section</button></div></div><div className="section-card-grid">{sections.map((section)=><div key={section.id} className="section-card"><div className="inline-heading"><h4>{section.label}</h4><button type="button" className="ghost-btn small-btn" onClick={()=>removeSection(section.id)}>Remove</button></div><div className="form-grid section-input-grid">
    <label className="form-field"><span>Width (ft)</span><input type="number" step="0.1" value={section.width} onChange={(e)=>updateSection(section.id,{width:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Height (ft)</span><input type="number" step="0.1" value={section.height} onChange={(e)=>updateSection(section.id,{height:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Uprights</span><input type="number" step="1" min="0" value={section.uprights} onChange={(e)=>updateSection(section.id,{uprights:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Upright coverage</span><select value={section.uprightMode} onChange={(e)=>updateSection(section.id,{uprightMode:e.target.value as SunroomSectionConfig['uprightMode']})}><option value="main-only">Main only</option><option value="main-kick">Main + kick</option><option value="main-transom">Main + transom</option><option value="all">Main + kick + transom</option></select></label>
    <label className="form-field"><span>Main section</span><select value={section.mainSection} onChange={(e)=>updateSection(section.id,{mainSection:e.target.value as SunroomSectionConfig['mainSection']})}><option value="horizontal-sliders">Horizontal sliders</option><option value="panel">Panel</option><option value="picture-window">Picture window</option></select></label>
    <label className="form-field"><span>Main section window count</span><input type="number" step="1" min="0" value={section.mainWindowCount} onChange={(e)=>updateSection(section.id,{mainWindowCount:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Kick section</span><select value={section.kickSection} onChange={(e)=>updateSection(section.id,{kickSection:e.target.value as SunroomSectionConfig['kickSection']})}><option value="none">None</option><option value="panel">Panel</option><option value="window">Window</option><option value="insulated">Insulated panel</option></select></label>
    <label className="form-field"><span>Kick panel height (ft)</span><input type="number" step="0.1" min="0" value={section.kickHeight} onChange={(e)=>updateSection(section.id,{kickHeight:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Kick section window count</span><input type="number" step="1" min="0" value={section.kickWindowCount} onChange={(e)=>updateSection(section.id,{kickWindowCount:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Transom</span><select value={section.transomType} onChange={(e)=>updateSection(section.id,{transomType:e.target.value as SunroomSectionConfig['transomType']})}><option value="auto">Auto</option><option value="none">None</option><option value="panel">Panel</option><option value="picture-window">Picture window</option></select></label>
    <label className="form-field"><span>Transom center height (ft)</span><input type="number" step="0.1" min="0" value={section.transomHeight} onChange={(e)=>updateSection(section.id,{transomHeight:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Left transom height (ft)</span><input type="number" step="0.1" min="0" value={section.leftTransomHeight} onChange={(e)=>updateSection(section.id,{leftTransomHeight:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Right transom height (ft)</span><input type="number" step="0.1" min="0" value={section.rightTransomHeight} onChange={(e)=>updateSection(section.id,{rightTransomHeight:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Transom window count</span><input type="number" step="1" min="0" value={section.transomWindowCount} onChange={(e)=>updateSection(section.id,{transomWindowCount:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Electric chase</span><select value={section.electricChase ? 'yes' : 'no'} onChange={(e)=>updateSection(section.id,{electricChase:e.target.value === 'yes'})}><option value="no">No</option><option value="yes">Yes</option></select></label>
    <label className="form-field"><span>Door</span><select value={section.doorType} onChange={(e)=>updateSection(section.id,{doorType:e.target.value as SunroomSectionConfig['doorType']})}><option value="none">None</option><option value="single">Single 3' × 6'8"</option><option value="slider">Slider 6' × 6'8"</option></select></label>
  </div></div>)}</div></section>;
}
