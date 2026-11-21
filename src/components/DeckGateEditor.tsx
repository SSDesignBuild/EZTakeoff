import { parseDeckGates, planDeckGateHardware, type DeckGate } from '../lib/deckGates';
import { buildDeckModel } from '../lib/deckModel';

type Values=Record<string,string|number|boolean>;
type OnChange=(update:(current:Values)=>Values)=>void;
export function DeckGateEditor({values,onValuesChange}:{values:Values;onValuesChange:OnChange}){
  const gates=parseDeckGates(values.deckGateEntries);
  const model=buildDeckModel(values);
  const stair=model.stairPlacements[0];
  const plan=planDeckGateHardware(values.deckGateEntries);
  const persist=(items:DeckGate[])=>onValuesChange((current)=>({...current,deckGateEntries:JSON.stringify(items)}));
  const add=()=>{
    const preferred=model.exposedSegments[0];
    persist([...gates,{id:'gate-'+Date.now()+'-'+gates.length,
      label:'Gate '+(gates.length+1),heightFt:3.1,
      widthFt:stair?.width??Math.min(3,preferred?.length??3),
      placement:stair?'stairs':'edge',
      edgeIndex:stair?.edgeIndex??preferred?.index??0,
      offsetFt:stair?.offset??0}]);
  };
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
      <label className="form-field"><span>Gate location</span>
        <select value={gate.placement??'edge'} onChange={event=>
          persist(gates.map(g=>g.id!==gate.id?g:{
            ...g,placement:event.target.value==='stairs'?'stairs':'edge',
            edgeIndex:event.target.value==='stairs'?(stair?.edgeIndex??g.edgeIndex):g.edgeIndex,
            offsetFt:event.target.value==='stairs'?(stair?.offset??g.offsetFt):g.offsetFt,
            widthFt:event.target.value==='stairs'?(stair?.width??g.widthFt):g.widthFt,
          }))}>
          <option value="edge">Custom deck edge position</option>
          {stair&&<option value="stairs">Across stair opening (gate)</option>}
        </select></label>
      <label className="form-field"><span>Deck edge</span>
        <select value={gate.edgeIndex??model.exposedSegments[0]?.index??0}
          onChange={event=>update(gate.id,'edgeIndex',Number(event.target.value))}>
          {model.exposedSegments.map(edge=><option key={edge.index} value={edge.index}>
            Edge {edge.index+1} · {edge.length.toFixed(1)} ft
          </option>)}
        </select></label>
      {gate.placement!=='stairs'&&<label className="form-field"><span>Offset along edge (ft)</span>
        <input type="number" step={.25} min={0}
          max={Math.max(0,(model.edgeSegments[gate.edgeIndex??0]?.length??0)-gate.widthFt)}
          value={gate.offsetFt??0}
          onChange={event=>update(gate.id,'offsetFt',Number(event.target.value))}/>
      </label>}
      <label className="form-field"><span>Gate height (ft)</span>
        <input type="number" step={1/12} min={1} value={gate.heightFt} onChange={(event)=>update(gate.id,'heightFt',Number(event.target.value))}/></label>
      <div className="gate-editor-hardware">
        <strong>{Number.isFinite(gate.heightFt)&&gate.heightFt>4?'3':'2'} self-closing hinges</strong>
        <small>1 slide bolt{gate.heightFt>4?' + 1 cane bolt':''}</small>
      </div>
      <button type="button" className="ghost-btn small-btn" onClick={()=>persist(gates.filter((_,i)=>i!==index))}>Remove</button>
    </div>)}
    {plan.issues.map((issue,index)=><p role="alert" style={{color:'#fca5a5'}} key={index}>{issue}</p>)}
    <p className="muted">Gate placement now reserves a visible 3D opening and draws its frame at the selected edge/offset or across the stair entrance. Verify real gate swing, code clearance and manufacturer-compatible infill before ordering.</p>
  </article>;
}
