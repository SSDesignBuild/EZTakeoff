type Values=Record<string,string|number|boolean>;
type Update=(updater:(current:Values)=>Values)=>void;
export function SalesTechnicalSettings({values,onValuesChange}:{values:Values;onValuesChange:Update}){
  const set=(key:string,value:string|number|boolean)=>onValuesChange((old)=>({...old,[key]:value}));
  return <details className="consultation-technical-settings">
    <summary><span className="consultation-setting-icon" aria-hidden="true">⚙</span>
      <span><strong>S&S construction standards</strong><small>Hidden from client choices · adjustable for site requirements and upgrades</small></span>
      <span className="consultation-settings-state">View / edit</span>
    </summary>
    <div className="consultation-technical-grid">
      <label>Support posts
        <select value={String(values.postSizeChoice??'6x6')} onChange={(e)=>set('postSizeChoice',e.target.value)}>
          <option value="6x6">6×6 PT · S&S standard</option>
          <option value="8x8">8×8 PT · upgraded</option>
        </select></label>
      <label>Joist framing
        <select value={String(values.joistSizeChoice??'auto')} onChange={(e)=>set('joistSizeChoice',e.target.value)}>
          <option value="auto">Auto · according to geometry</option>
          <option value="2x8">2×8</option><option value="2x10">2×10</option><option value="2x12">2×12</option>
        </select></label>
      <label>Double support beam
        <select value={String(values.beamSizeChoice??'auto')} onChange={(e)=>set('beamSizeChoice',e.target.value)}>
          <option value="auto">Auto · according to geometry</option><option value="2x10">Double 2×10</option>
          <option value="2x12">Double 2×12</option><option value="PSL">Engineered PSL · review required</option>
        </select></label>
      <label>Footing diameter (in)
        <input type="number" min={8} step={1} value={Number(values.footingDiameterIn??12)}
          onChange={(e)=>set('footingDiameterIn',Number(e.target.value))}/></label>
      <label>Footing depth (in)
        <input type="number" min={12} step={1} value={Number(values.footingDepthIn??24)}
          onChange={(e)=>set('footingDepthIn',Number(e.target.value))}/></label>
      <label>Framing fastener
        <select value={String(values.frameFastenerChoice??'framing-screws')} onChange={(e)=>set('frameFastenerChoice',e.target.value)}>
          <option value="framing-screws">3″ exterior framing screws</option>
          <option value="collated-nails">3″ exterior collated ring-shank nails</option>
        </select></label>
      <label>Joist hanger fastening
        <select value={String(values.connectorFastenerChoice??'hanger-nails')} onChange={(e)=>set('connectorFastenerChoice',e.target.value)}>
          <option value="hanger-nails">Manufacturer-approved connector nails</option>
          <option value="approved-screws">Rated structural connector screws</option>
        </select></label>
      <label>Attachment / ledger
        <select value={String(values.attachment??'siding')} onChange={(e)=>set('attachment',e.target.value)}>
          <option value="siding">Attached to suitable house framing</option>
          <option value="brick">Brick / masonry · independent support</option>
          <option value="freestanding">Freestanding</option>
        </select></label>
    </div>
    <p>Configuration defaults reflect S&S practices, not a structural seal. Local spans, ground conditions, fastener approvals and footing engineering still require field review.</p>
  </details>;
}
