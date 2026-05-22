import { createSunroomSection, parseSunroomSections } from '../lib/sectioning';
import { SunroomSectionConfig } from '../lib/types';

interface Props {
  values: Record<string, string | number | boolean>;
  onValuesChange: (updater: (current: Record<string, string | number | boolean>) => Record<string, string | number | boolean>) => void;
}

const attachOptions: { label: string; value: SunroomSectionConfig['bottomAttach'] }[] = [
  { label: 'Wood - 1 1/8 in wood screws', value: 'wood' },
  { label: 'Metal - 3/4 in tek screws', value: 'metal' },
  { label: 'Concrete - 1 1/2 in Tapcon screws', value: 'concrete' },
];

export function SunroomSectionEditor({ values, onValuesChange }: Props) {
  const sections = parseSunroomSections(values.sunroomSections, 3);
  const updateSections = (next: SunroomSectionConfig[]) => {
    onValuesChange((current) => ({ ...current, sunroomSections: JSON.stringify(next.map((section, index) => ({ ...section, label: `Section ${index + 1}` }))) }));
  };
  const updateSection = (id: string, patch: Partial<SunroomSectionConfig>) => updateSections(sections.map((section) => section.id === id ? { ...section, ...patch } : section));
  const addSection = () => {
    const template = sections[0] ?? createSunroomSection(0);
    const { id: _id, label: _label, ...copyable } = template;
    updateSections([...sections, createSunroomSection(sections.length, copyable)]);
  };
  const removeSection = (id: string) => sections.length > 1 && updateSections(sections.filter((section) => section.id !== id));

  return <section className="content-card"><div className="section-heading inline-heading"><div><p className="eyebrow">Section editor</p><h3>Sunroom wall sections</h3></div><div className="tag-row"><span className="tag">24 ft stock logic with individually editable sections</span><button type="button" className="secondary-btn" onClick={addSection}>Add section</button></div></div><div className="section-card-grid">{sections.map((section)=>{
    const doorWidth = section.doorType === 'slider' ? 6 : section.doorType === 'single' ? 3 : 0;
    const maxDoorOffset = Math.max(0, section.width * 12 - doorWidth * 12);
    return <div key={section.id} className="section-card"><div className="inline-heading"><h4>{section.label}</h4><button type="button" className="ghost-btn small-btn" onClick={()=>removeSection(section.id)}>Remove</button></div><div className="form-grid section-input-grid">
    <label className="form-field"><span>Width (ft)</span><input type="number" step="0.1" value={section.width} onChange={(e)=>updateSection(section.id,{width:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Height (ft)</span><input type="number" step="0.1" value={section.height} onChange={(e)=>updateSection(section.id,{height:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Uprights</span><input type="number" step="1" min="0" value={section.uprights} onChange={(e)=>updateSection(section.id,{uprights:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Upright coverage</span><select value={section.uprightMode} onChange={(e)=>updateSection(section.id,{uprightMode:e.target.value as SunroomSectionConfig['uprightMode']})}><option value="main-only">Main only</option><option value="main-kick">Main + kick</option><option value="main-transom">Main + transom</option><option value="all">Main + kick + transom</option></select></label>
    <label className="form-field"><span>Main section</span><select value={section.mainSection} onChange={(e)=>updateSection(section.id,{mainSection:e.target.value as SunroomSectionConfig['mainSection']})}><option value="horizontal-sliders">Horizontal sliders</option><option value="panel">Panel</option><option value="picture-window">Picture window</option></select></label>
    <label className="form-field"><span>Kick section</span><select value={section.kickSection} onChange={(e)=>updateSection(section.id,{kickSection:e.target.value as SunroomSectionConfig['kickSection']})}><option value="none">None</option><option value="panel">Panel</option><option value="window">Window</option><option value="insulated">Insulated panel</option></select></label>
    <label className="form-field"><span>Kick panel height (ft)</span><input type="number" step="0.1" min="0" value={section.kickHeight} onChange={(e)=>updateSection(section.id,{kickHeight:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Transom</span><select value={section.transomType} onChange={(e)=>updateSection(section.id,{transomType:e.target.value as SunroomSectionConfig['transomType']})}><option value="auto">Auto</option><option value="none">None</option><option value="panel">Panel</option><option value="picture-window">Picture window</option></select></label>
    <label className="form-field"><span>Left transom height (ft)</span><input type="number" step="0.1" min="0" value={section.leftTransomHeight} onChange={(e)=>updateSection(section.id,{leftTransomHeight:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Right transom height (ft)</span><input type="number" step="0.1" min="0" value={section.rightTransomHeight} onChange={(e)=>updateSection(section.id,{rightTransomHeight:Number(e.target.value)})} /></label>
    <label className="form-field"><span>Electric chase</span><select value={section.electricChase ? 'yes' : 'no'} onChange={(e)=>updateSection(section.id,{electricChase:e.target.value === 'yes'})}><option value="no">No</option><option value="yes">Yes</option></select></label>
    <label className="form-field"><span>Door</span><select value={section.doorType} onChange={(e)=>updateSection(section.id,{doorType:e.target.value as SunroomSectionConfig['doorType']})}><option value="none">None</option><option value="single">Single 3' x 6'8"</option><option value="slider">Slider 6' x 6'8"</option></select></label>
    {section.doorType !== 'none' && <><label className="form-field"><span>Door placement</span><select value={section.doorPlacement} onChange={(e)=>updateSection(section.id,{doorPlacement:e.target.value as SunroomSectionConfig['doorPlacement']})}><option value="left">Left edge</option><option value="center">Center</option><option value="right">Right edge</option><option value="custom">Custom offset</option></select></label><label className="form-field"><span>Door left offset (in)</span><input type="number" min="0" max={maxDoorOffset} step="1" value={section.doorPlacement === 'custom' ? section.doorOffsetInches : section.doorPlacement === 'right' ? maxDoorOffset : section.doorPlacement === 'center' ? Math.round(maxDoorOffset / 2) : 0} onChange={(e)=>updateSection(section.id,{doorPlacement:'custom',doorOffsetInches:Math.max(0, Math.min(maxDoorOffset, Number(e.target.value) || 0))})} /></label></>}
    <label className="form-field"><span>Bottom attaches to</span><select value={section.bottomAttach} onChange={(e)=>updateSection(section.id,{bottomAttach:e.target.value as SunroomSectionConfig['bottomAttach']})}>{attachOptions.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label className="form-field"><span>Top attaches to</span><select value={section.topAttach} onChange={(e)=>updateSection(section.id,{topAttach:e.target.value as SunroomSectionConfig['topAttach']})}>{attachOptions.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label className="form-field"><span>Left side attaches to</span><select value={section.leftAttach} onChange={(e)=>updateSection(section.id,{leftAttach:e.target.value as SunroomSectionConfig['leftAttach']})}>{attachOptions.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label className="form-field"><span>Right side attaches to</span><select value={section.rightAttach} onChange={(e)=>updateSection(section.id,{rightAttach:e.target.value as SunroomSectionConfig['rightAttach']})}>{attachOptions.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  </div></div>})}</div></section>;
}
