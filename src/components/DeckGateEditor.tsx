import { parseDeckGates, planDeckGateHardware, type DeckGate } from '../lib/deckGates';

type Values=Record<string,string|number|boolean>;
type OnChange=(update:(current:Values)=>Values)=>void;
export function DeckGateEditor({values,onValuesChange}:{values:Values;onValuesChange:OnChange}){
  const gates=parseDeckGates(values.deckGateEntries);
  const plan=planDeckGateHardware(values.deckGateEntries);
  const persist=(items:DeckGate[])=>onValuesChange((current)=>({...current,deckGateEntries:JSON.stringify(items)}));
  const add=()=>persist([...gates,{id:'gate-'+Date.now()+'-'+gates.length,label:'Gate '+(gates.length+1),heightFt:4,widthFt:3}]);
  const update=(id:string,key:keyof DeckGate,value:string|number)=>persist(gates.map((gate)=>gate.id===id?{...gate,[key]:value}:gate));
  return <article className="content-card deck-gate-editor">
    <div className="deck-workflow-section-heading">
      <h4>4 · Deck railing gates and hardware</h4>
      <p className="muted">Specify each gate separately to order the right number of exterior self-closing hinges, slide bolts and cane bolts.</p>
    </div>
    <div className="gate-editor-actions">
      <strong>{gates.length} gate(s) · {plan.hinges} hinges · {plan.slideBolts} slide bolts · {plan.caneBolts} cane bolts</strong>
      <button type="button" className="secondary-btn small-btn" onClick={add}>+ Add gate</button>
    </div>
    {gates.map((gate,index)=><div className="gate-editor-row" key={gate.id}>
      <label className="form-field"><span>Gate label</span>
        <input type="text" value={gate.label} onChange={(event)=>update(gate.id,'label',event.target.value)}/></label>
      <label className="form-field"><span>Gate width (ft)</span>
        <input type="number" step={1/12} min={.5} value={gate.widthFt} onChange={(event)=>update(gate.id,'widthFt',Number(event.target.value))}/></label>
      <label className="form-field"><span>Gate height (ft)</span>
        <input type="number" step={1/12} min={1} value={gate.heightFt} onChange={(event)=>update(gate.id,'heightFt',Number(event.target.value))}/></label>
      <div className="gate-editor-hardware">
        <strong>{Number.isFinite(gate.heightFt)&&gate.heightFt>4?'3':'2'} self-closing hinges</strong>
        <small>1 slide bolt{gate.heightFt>4?' + 1 cane bolt':''}</small>
      </div>
      <button type="button" className="ghost-btn small-btn" onClick={()=>persist(gates.filter((_,i)=>i!==index))}>Remove</button>
    </div>)}
    {plan.issues.map((issue,index)=><p role="alert" style={{color:'#fca5a5'}} key={index}>{issue}</p>)}
    <p className="muted">Gate framing, infill and exact railing opening deduction require job-specific confirmation. These quantities cover hardware only and are not a complete gate kit.</p>
  </article>;
}
