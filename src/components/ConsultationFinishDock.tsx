import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ConsultationProject } from '../lib/consultationProject';
import {
  deckVisualProducts, deckCollections, getDeckVisualProduct, railVisualProducts,
  coverVisualProducts, getCoverVisualProduct, coverFrameColors, coverRoofColors, coverCeilingFinishes,
  getCoverFinish, getCoverRoofFinish, getCoverCeilingFinish,
  type CoverFamily, type CoverColor, type CoverRoofColor, type CoverCeilingFinish,
} from '../data/visualCatalog';
import { railingPhotos, coverPhotos } from '../data/consultationPhotos';
import {
  getFinishDockTabs, getBoardFinishState, changeBoardFinish, changeFinishCourseCount, finishDockRailProduct,
  changeRailingFinishStyle, changeCoverFinishStyle, coverFinishStyleIssue, changeSunroomFinish, changePostCapLighting,
  drinkRailBoardProducts, sunroomFinishChoices, railingFinishSwatch, finishDockCategoryTabs, getOverheadAddonFinish,
  type FinishDockCategory, type FinishDockTab, type BoardFinishTarget,
} from '../lib/consultationFinishDock';
import { currentEliteSunroomSettings, type EliteSunroomFinish } from '../lib/eliteSunroomStudio';
import { readSiteConcreteAreas, updateSiteConcreteArea, type SiteConcreteArea } from '../lib/siteConcrete';
import {
  SIKA_CONCRETE_STAMPS, SIKA_CONCRETE_COLORS, SIKA_CONCRETE_BORDERS,
  DEFAULT_CONCRETE_BORDER_WIDTH_IN, resolveConcreteAppearance,
} from '../lib/sikaConcreteCatalog';
import { getLightingOptions, getOverheadAddonAvailability, planLightingAddons } from '../lib/lightingAddons';
import { getLightingProduct } from '../data/lightingCatalog';
import './ConsultationFinishDock.css';

interface DockChoice {
  id:string;
  label:string;
  detail?:string;
  image?:string;
  color?:string;
  disabled?:boolean;
  reason?:string;
  sourceUrl?:string;
  visual?:'label';
}
type AddonMode='fans'|'can-lights'|'post'|'post-cap'|'stair'|'deck';
const human=(value:string)=>value.replace(/-/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const boardName=(value:string)=>{
  const board=getDeckVisualProduct(value);
  return board?board.color:value||'Choose a finish';
};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
const scrollBehavior=():ScrollBehavior=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';

function Chevron({direction}:{direction:'left'|'right'|'down'}){
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"
    className={'finish-dock-chevron finish-dock-chevron--'+direction}>
    <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function ExternalLinkIcon(){
  return <svg className="finish-dock-external-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M8 4H4v12h12v-4M10 3h7v7M9 11l8-8" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function ChoicePreview({choice}:{choice:DockChoice}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[choice.image]);
  return <span className={'finish-dock-sample'+(choice.visual==='label'?' finish-dock-sample--label':'')}
    style={choice.color?{background:choice.color}:undefined}>
    {choice.image&&!failed?<img src={choice.image} alt="" loading="lazy"
      onError={()=>setFailed(true)} referrerPolicy="no-referrer"/>:
      !choice.color&&<span>{choice.visual==='label'?choice.label:
        choice.image?'Reference unavailable':choice.id==='none'?'None':'Reference in details'}</span>}
  </span>;
}
function DockCarousel({choices,selected,onSelect,label}:{
  choices:DockChoice[];selected:string;onSelect:(id:string)=>void;label:string;
}){
  const viewport=useRef<HTMLDivElement>(null);
  const [edges,setEdges]=useState({left:false,right:false});
  const signature=choices.map(choice=>choice.id).join('|');
  const measure=()=>{
    const node=viewport.current;if(!node)return;
    const next={left:node.scrollLeft>2,right:node.scrollLeft+node.clientWidth<node.scrollWidth-2};
    setEdges(previous=>previous.left===next.left&&previous.right===next.right?previous:next);
  };
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    const centerSelection=()=>{
      const picked=node.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if(picked)node.scrollTo({left:Math.max(0,node.scrollLeft+picked.getBoundingClientRect().left-
        node.getBoundingClientRect().left-(node.clientWidth-picked.offsetWidth)/2),behavior:'auto'});
      else node.scrollTo({left:0,behavior:'auto'});
    };
    centerSelection();measure();
    let measuredWidth=node.clientWidth;
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{
      if(node.clientWidth!==measuredWidth){measuredWidth=node.clientWidth;centerSelection();}
      measure();
    });
    observer?.observe(node);
    return ()=>observer?.disconnect();
  },[signature,selected]);
  const slide=(direction:number)=>{
    const node=viewport.current;if(!node)return;
    node.scrollBy({left:direction*Math.max(220,node.clientWidth*.78),behavior:scrollBehavior()});
  };
  const moveFocus=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(current<0)return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
      clamp(current+(event.key==='ArrowLeft'?-1:1),0,buttons.length-1);
    buttons[next]?.focus();
  };
  return <div className="finish-dock-carousel">
    <button type="button" className="finish-dock-arrow" aria-label={'Previous '+label}
      disabled={!edges.left} onClick={()=>slide(-1)}><Chevron direction="left"/></button>
    <div className="finish-dock-options" ref={viewport} onScroll={measure}
      role="group" aria-label={label} onKeyDown={moveFocus}>
      {choices.map(choice=><button type="button" key={choice.id}
        className={'finish-dock-choice'+(selected===choice.id?' is-selected':'')}
        aria-pressed={selected===choice.id} disabled={choice.disabled}
        title={choice.reason??choice.detail??choice.label}
        onClick={()=>{if(choice.id!==selected)onSelect(choice.id);}}>
        <ChoicePreview choice={choice}/>
        {selected===choice.id&&<span className="finish-dock-check" aria-hidden="true">✓</span>}
        <strong>{choice.label}</strong>
        <small>{choice.disabled?choice.reason:choice.detail}</small>
      </button>)}
    </div>
    <button type="button" className="finish-dock-arrow" aria-label={'More '+label}
      disabled={!edges.right} onClick={()=>slide(1)}><Chevron direction="right"/></button>
  </div>;
}
function ModeButtons({items,value,onChange,label}:{
  items:{id:string;label:string}[];value:string;onChange:(value:string)=>void;label:string;
}){
  return <div className="finish-dock-modes" role="group" aria-label={label}>
    {items.map(item=><button type="button" key={item.id} aria-pressed={value===item.id}
      className={value===item.id?'is-active':''} onClick={()=>onChange(item.id)}>{item.label}</button>)}
  </div>;
}

export interface ConsultationFinishDockProps {
  project:ConsultationProject;
  onChange:(patch:Partial<ConsultationProject>)=>void;
  /** Layout-dependent additions open the corresponding existing editor. */
  onRequestDetails?:(section:string)=>void;
}

/** A compact catalog at the bottom of the live 3D workbench. Every selection
 * updates the same saved project values used by drawings and takeoff. */
export function ConsultationFinishDock({project,onChange,onRequestDetails}:ConsultationFinishDockProps){
  const uid=useId().replace(/:/g,'');
  const [activeId,setActiveId]=useState('deck');
  const [revealed,setRevealed]=useState<FinishDockCategory|null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const [collection,setCollection]=useState('All collections');
  const [modes,setModes]=useState<Record<string,string>>({});
  const [areaId,setAreaId]=useState('');
  const [announcement,setAnnouncement]=useState('');
  const tabsRef=useRef<HTMLDivElement>(null);
  const addButton=useRef<HTMLButtonElement>(null);
  const installedTabs=useMemo(()=>getFinishDockTabs(project),[project.values,project.coverFamily,project.coverScreenStyle]);
  const tabs:FinishDockTab[]=revealed&&!installedTabs.some(tab=>tab.category===revealed)
    ?[...installedTabs,...finishDockCategoryTabs(revealed).slice(0,1)]:installedTabs;
  const active=tabs.find(tab=>tab.id===activeId)??tabs[0];
  const lightingPlan=useMemo(()=>active.category==='add-ons'?planLightingAddons(project):null,[active.category,project]);
  const areas=useMemo(()=>readSiteConcreteAreas(project.values.siteConcreteAreas),[project.values.siteConcreteAreas]);
  const area=areas.find(item=>item.id===areaId)??areas[0];
  const concreteIssues=active.category==='concrete'&&area?resolveConcreteAppearance(area).issues:[];
  const mode=modes[active.category]??active.mode??(active.category==='add-ons'?'post':'style');
  const activateTab=(item:FinishDockTab)=>{
    setActiveId(item.id);
    setModes(previous=>({...previous,[item.category]:item.mode??(item.category==='add-ons'?'post':'style')}));
  };
  const setMode=(value:string)=>{
    const direct=tabs.find(item=>item.category===active.category&&item.mode===value);
    if(direct)setActiveId(direct.id);
    setModes(previous=>({...previous,[active.category]:value}));
  };
  const values=project.values;
  const updateValues=(changes:Partial<typeof values>,label:string)=>{
    if(Object.entries(changes).every(([key,value])=>values[key]===value))return;
    onChange({values:{...values,...changes} as typeof values});setAnnouncement(label);
  };
  const updateProject=(patch:Partial<ConsultationProject>,label:string)=>{
    if(Object.entries(patch).every(([key,value])=>project[key as keyof ConsultationProject]===value))return;
    onChange(patch);setAnnouncement(label);
  };
  const openCategory=(category:FinishDockCategory)=>{
    setRevealed(category);activateTab(installedTabs.find(tab=>tab.category===category)??finishDockCategoryTabs(category)[0]);
    setMenuOpen(false);
  };
  useEffect(()=>{
    const node=tabsRef.current;
    if(!node)return;
    const centerTab=(behavior:ScrollBehavior)=>{
      const picked=node.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if(picked)node.scrollTo({left:Math.max(0,node.scrollLeft+picked.getBoundingClientRect().left-
        node.getBoundingClientRect().left-(node.clientWidth-picked.offsetWidth)/2),behavior});
    };
    centerTab(scrollBehavior());
    let measuredWidth=node.clientWidth;
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{
      if(node.clientWidth!==measuredWidth){measuredWidth=node.clientWidth;centerTab('auto');}
    });
    observer?.observe(node);
    return ()=>observer?.disconnect();
  },[active.id]);
  const tabKeys=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const current=tabs.findIndex(tab=>tab.id===active.id);
    const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:
      (current+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length;
    event.preventDefault();activateTab(tabs[index]);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  };
  const requestDetails=(section:string)=>{
    setMenuOpen(false);onRequestDetails?.(section);
    if(!onRequestDetails)setAnnouncement('Use the design settings to edit '+section.replace(/-/g,' ')+'.');
  };

  let choices:DockChoice[]=[],selected='',selectedTitle='',selectedDetail='';
  let controls:ReactNode=null,extra:ReactNode=null;
  let selectChoice:(id:string)=>void=()=>{};
  let note='Manufacturer references. Delivered color and grain vary with lighting.';
  const boardTargets:Partial<Record<FinishDockCategory,BoardFinishTarget>>={
    deck:'deck','picture-frame':'picture-frame',breaker:'breaker',stairs:'stairs',
    fascia:'fascia',risers:'risers','drink-rail':'drink-rail',
  };
  const boardTarget=active.category==='stairs'&&mode==='side-fascia'?'stair-fascia':boardTargets[active.category];
  if(boardTarget){
    const state=getBoardFinishState(values,boardTarget,active.course);
    const products=(boardTarget==='drink-rail'?drinkRailBoardProducts:deckVisualProducts)
      .filter(board=>collection==='All collections'||board.collection===collection);
    choices=[...state.matchOptions.map(option=>({id:option.value,label:option.label,
      detail:option.resolved?boardName(option.resolved):'Check the approved stair details',
      image:getDeckVisualProduct(option.resolved)?.swatch,
      visual:option.value==='open'?'label' as const:undefined,
    })),...products.map(board=>({id:board.label,label:board.color,
      detail:board.collection+' · '+(board.family==='pvc'?'PVC':'Composite'),
      image:board.swatch,sourceUrl:board.sourcePage,
    }))];
    if(!getDeckVisualProduct(state.value)&&!state.matchOptions.some(option=>option.value===state.value))
      choices.unshift({id:state.value,label:state.value||'Existing selection',detail:'Saved material · reference unavailable'});
    selected=state.value;
    const special=state.matchOptions.find(option=>option.value===selected);
    selectedTitle=special?special.label:boardName(state.resolved);
    selectedDetail=special&&state.resolved?boardName(state.resolved):getDeckVisualProduct(state.resolved)?.collection??state.label;
    selectChoice=id=>{
      const next=changeBoardFinish(values,boardTarget,id,active.course);
      if(next===values)return;
      onChange({values:next});
      setAnnouncement(state.label+' updated to '+(choices.find(choice=>choice.id===id)?.label??id));
    };
    controls=<>
      {active.category==='stairs'&&<ModeButtons value={mode==='side-fascia'?'side-fascia':'style'}
        items={[{id:'style',label:'Treads'},{id:'side-fascia',label:'Side fascia'}]}
        label="Stair finish part" onChange={setMode}/>}
      <label className="finish-dock-select"><span className="finish-dock-sr-only">Decking collection</span>
        <select aria-label="Decking collection" value={collection} onChange={event=>setCollection(event.target.value)}>
          {['All collections',...deckCollections].map(item=><option key={item}>{item}</option>)}
        </select></label>
    </>;
    if(active.category==='picture-frame'||active.category==='breaker')extra=<label className="finish-dock-inline-setting">
      {values.multiTierEnabled===true||String(values.multiTierEnabled)==='true'?'Main courses':'Courses'} <select aria-label={active.category==='picture-frame'?'Picture frame course count':'Breaker board course count'}
        value={Number(values[active.category==='picture-frame'?'pictureFrameCount':'breakerBoardCount']??0)}
        onChange={event=>{
          const count=Number(event.target.value);
          const next=changeFinishCourseCount(values,active.category as 'picture-frame'|'breaker',count);
          if(next===values)return;
          onChange({values:next});
          setAnnouncement((active.category==='picture-frame'?'Picture frame':'Breaker board')+' courses: '+count);
        }}>{[0,1,2,3].map(count=><option key={count} value={count}>{count===0?'None':count}</option>)}</select>
    </label>;
    if(active.category==='drink-rail'){
      note=state.unavailableReason??'Compatible full-profile, square-shouldered boards for the drink rail.';
      if(state.unavailableReason){
        choices=choices.map(choice=>({...choice,disabled:true,reason:'Preview unavailable for this railing'}));
        extra=<button type="button" className="finish-dock-text-button" onClick={()=>openCategory('railing')}>
          Choose railing style
        </button>;
      }
    }
  }else if(active.category==='railing'){
    const rail=finishDockRailProduct(values);
    const railMode=['color','infill'].includes(mode)?mode:'style';
    controls=<ModeButtons value={railMode} onChange={setMode} label="Railing selection"
      items={[{id:'style',label:'Style'},{id:'color',label:'Color'},{id:'infill',label:'Infill'}]}/>;
    if(railMode==='style'){
      choices=railVisualProducts.map(item=>({id:item.id,label:item.label,detail:human(item.family),
        image:railingPhotos[item.id]?.url,sourceUrl:item.sourcePage}));
      selected=rail.id;selectedTitle=rail.label;selectedDetail=human(String(values.railingColor??rail.colors[0]));
      selectChoice=id=>{
        const next=changeRailingFinishStyle(values,id);if(next===values)return;
        onChange({values:next});setAnnouncement('Railing style updated');
      };
    }else if(railMode==='color'){
      choices=rail.colors.map(color=>({id:color,label:human(color),color:railingFinishSwatch(color)}));
      selected=String(values.railingColor??rail.colors[0]);selectedTitle=human(selected);selectedDetail=rail.label;
      selectChoice=id=>updateValues({railingColor:id},'Railing finish updated to '+human(id));
    }else{
      choices=rail.infills.map(infill=>({id:infill,label:human(infill),visual:'label'}));
      selected=String(values.railingInfill??rail.infills[0]);selectedTitle=human(selected);selectedDetail=rail.label;
      selectChoice=id=>updateValues({railingInfill:id},'Railing infill updated to '+human(id));
    }
    extra=<label className="finish-dock-inline-setting">Height <select aria-label="Railing height"
      value={String(values.railingHeightIn??36)} onChange={event=>updateValues({railingHeightIn:event.target.value},'Railing height updated')}>
      <option value="36">36″</option><option value="42">42″</option></select></label>;
  }else if(active.category==='cover'){
    const cover=getCoverVisualProduct(project.coverFamily);
    const solid=project.coverFamily!=='none'&&['solid-studio','solid-truss-ends','full-trusses'].includes(cover.family);
    const coverModes=[{id:'style',label:'Style'},...(project.coverFamily==='none'?[]:[{id:'color',label:'Frame color'}]),
      ...(solid?[{id:'roof',label:'Roof color'},{id:'ceiling',label:'Ceiling'}]:[])];
    const coverMode=coverModes.some(item=>item.id===mode)?mode:'style';
    controls=<ModeButtons items={coverModes} value={coverMode} onChange={setMode} label="Patio cover selection"/>;
    if(coverMode==='style'){
      choices=coverVisualProducts.map(item=>({id:item.id,label:item.name,
        detail:item.id==='none'?'Open-air deck':'Renaissance',image:coverPhotos[item.id]?.url,
        visual:item.id==='none'?'label':undefined,sourceUrl:item.sourcePage,
        disabled:!!coverFinishStyleIssue(project,item.id),reason:coverFinishStyleIssue(project,item.id)}));
      selected=project.coverFamily;selectedTitle=cover.name;selectedDetail='Renaissance patio covers';
      selectChoice=id=>updateProject(changeCoverFinishStyle(project,id as CoverFamily),'Patio cover updated to '+id);
    }else if(coverMode==='color'){
      choices=coverFrameColors.map(color=>({id:color,label:color,color:getCoverFinish(color)}));
      selected=project.coverColor;selectedTitle=selected;selectedDetail=cover.name+' · frame';
      selectChoice=id=>updateProject({coverColor:id as CoverColor},'Patio cover frame updated to '+id);
    }else if(coverMode==='roof'){
      choices=coverRoofColors.map(color=>({id:color,label:color,color:getCoverRoofFinish(color)}));
      selected=project.coverRoofColor??'White';selectedTitle=selected;selectedDetail='Exterior roof panels';
      selectChoice=id=>updateProject({coverRoofColor:id as CoverRoofColor},'Roof panel finish updated to '+id);
    }else{
      choices=coverCeilingFinishes.map(color=>({id:color,label:color,
        detail:color.includes('Wood Grain')?'Illustrative grain finish':undefined,
        color:color.includes('Wood Grain')?`repeating-linear-gradient(96deg, ${getCoverCeilingFinish(color)} 0 3px, ${color==='Mahogany Wood Grain'?'#4a2b23':'#dcc099'} 4px 6px, ${getCoverCeilingFinish(color)} 7px 10px)`:getCoverCeilingFinish(color)}));
      selected=project.coverCeilingFinish??'White';selectedTitle=selected;selectedDetail='Ceiling / underside';
      selectChoice=id=>updateProject({coverCeilingFinish:id as CoverCeilingFinish},'Ceiling finish updated to '+id);
    }
  }else if(active.category==='screen'){
    choices=[{id:'match',label:'Match patio cover',detail:project.coverColor,color:getCoverFinish(project.coverColor)},
      ...coverFrameColors.map(color=>({id:color,label:color,color:getCoverFinish(color)}))];
    selected=project.coverScreenColor??'match';selectedTitle=selected==='match'?'Match patio cover':selected;
    selectedDetail='Dolce screen framing & kick panels';
    selectChoice=id=>updateProject({coverScreenColor:id as 'match'|CoverColor},'Screen room finish updated');
  }else if(active.category==='sunroom'){
    const sunroom=currentEliteSunroomSettings(project);
    const same=sunroom.framingColor===sunroom.panelColor&&sunroom.framingColor===sunroom.windowColor;
    choices=sunroomFinishChoices.map(color=>({id:color.id,label:color.label,color:color.color}));
    selected=same?sunroom.framingColor:'';selectedTitle=same?human(selected):'Mixed finishes';
    selectedDetail='Elite frame, panels & windows';
    selectChoice=id=>updateProject(changeSunroomFinish(project,id as EliteSunroomFinish),'Sunroom finishes updated to '+human(id));
    note='Change individual frame, panel and window finishes in sunroom details.';
  }else if(active.category==='concrete'&&area){
    const concreteMode=['color','border','border-color'].includes(mode)?mode:'style';
    controls=<>
      <label className="finish-dock-select"><span className="finish-dock-sr-only">Concrete area</span>
        <select aria-label="Concrete area" value={area.id} onChange={event=>setAreaId(event.target.value)}>
          {areas.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <ModeButtons value={concreteMode} onChange={setMode} label="Concrete finish selection"
        items={[{id:'style',label:'Style'},{id:'color',label:'Color'},{id:'border',label:'Border'},{id:'border-color',label:'Border color'}]}/>
    </>;
    const catalog=concreteMode==='style'?SIKA_CONCRETE_STAMPS:concreteMode==='border'?SIKA_CONCRETE_BORDERS:SIKA_CONCRETE_COLORS;
    choices=catalog.map(item=>({id:item.id,label:item.name,detail:item.description,
      image:'imageUrl' in item?item.imageUrl:undefined,color:'swatch' in item?item.swatch:undefined,
      sourceUrl:item.sourceUrl,visual:['none','plain'].includes(item.id)?'label':undefined}));
    const changeArea=(patch:Partial<SiteConcreteArea>,label:string)=>updateValues({
      siteConcreteAreas:updateSiteConcreteArea(values.siteConcreteAreas,area.id,patch),
    },area.name+' '+label);
    if(concreteMode==='style'){
      selected=area.stampId??'plain';selectChoice=id=>changeArea({stampId:id},'style updated');
    }else if(concreteMode==='color'){
      selected=area.colorId??'natural';selectChoice=id=>changeArea({colorId:id},'color updated');
    }else if(concreteMode==='border'){
      selected=area.borderStampId??'none';
      selectChoice=id=>{
        const option=SIKA_CONCRETE_BORDERS.find(item=>item.id===id);
        changeArea({borderStampId:id,borderWidthIn:id==='none'?0:
          Number(area.borderWidthIn)>0?area.borderWidthIn:option?.defaultWidthIn??DEFAULT_CONCRETE_BORDER_WIDTH_IN},'border updated');
      };
    }else{
      const matching=SIKA_CONCRETE_COLORS.find(item=>item.id===(area.colorId??'natural'));
      choices.unshift({id:'match',label:'Match concrete color',detail:matching?.name,color:matching?.swatch});
      selected=area.borderColorId??'match';selectChoice=id=>changeArea({borderColorId:id},'border color updated');
    }
    selectedTitle=choices.find(choice=>choice.id===selected)?.label??selected;selectedDetail=area.name;
    if(area.borderStampId&&area.borderStampId!=='none')extra=<label className="finish-dock-inline-setting">
      Border width <input type="number" min={1} max={72} step={1} aria-label="Concrete border width in inches"
        value={area.borderWidthIn??DEFAULT_CONCRETE_BORDER_WIDTH_IN}
        onChange={event=>changeArea({borderWidthIn:clamp(Number(event.target.value),1,72)},'border width updated')}/> in
    </label>;
    note='Sika manufacturer references. Pattern and color preview is approximate; verify a physical sample.';
  }else if(active.category==='add-ons'){
    const addonMode:AddonMode=['fans','can-lights','post','post-cap','stair','deck'].includes(mode)?mode as AddonMode:'post';
    controls=<ModeButtons value={addonMode} onChange={setMode} label="Add-on category" items={[
      {id:'fans',label:'Fans'},{id:'can-lights',label:'Can lights'},{id:'post',label:'Post lights'},
      {id:'post-cap',label:'Post caps'},{id:'stair',label:'Riser lights'},{id:'deck',label:'Deck lights'},
    ]}/>;
    if(addonMode==='fans'||addonMode==='can-lights'){
      const fan=addonMode==='fans',availability=getOverheadAddonAvailability(project);
      const enabled=fan?availability.fans:availability.canLights;
      const countKey=fan?'patioFanCount':'patioCanLightCount',finishKey=fan?'patioFanFinish':'patioCanLightFinish';
      const layoutKey=fan?'patioFanLayout':'patioCanLightLayout';
      selected=getOverheadAddonFinish(values,fan?'fan':'can-light');
      choices=['black','white'].map(color=>({id:color,label:human(color),color:railingFinishSwatch(color),
        detail:fan?'Generic outdoor fan':'Generic recessed light',disabled:!enabled,reason:enabled?undefined:availability.reason}));
      selectedTitle=Number(values[countKey]??0)+' '+(fan?'fan':'can light')+(Number(values[countKey]??0)===1?'':'s');
      selectedDetail=enabled?'Generic layout · choose final fixture in details':availability.reason??'A solid patio cover is required';
      selectChoice=id=>updateValues({[finishKey]:id,[countKey]:Math.max(1,Number(values[countKey])||0)},human(id)+' '+(fan?'fan':'can light')+' selected');
      extra=<div className="finish-dock-inline-settings">
        <label className="finish-dock-inline-setting">Quantity <input type="number" min={0} max={fan?4:24} step={1}
          aria-label={fan?'Patio fan quantity':'Patio can light quantity'} value={Number(values[countKey]??0)} disabled={!enabled}
          onChange={event=>updateValues({[countKey]:Math.round(clamp(Number(event.target.value),0,fan?4:24))},'Add-on quantity updated')}/></label>
        <label className="finish-dock-inline-setting">Layout <select aria-label={fan?'Fan layout':'Can light layout'}
          disabled={!enabled} value={String(values[layoutKey]??(fan?'centered':'grid'))}
          onChange={event=>updateValues({[layoutKey]:event.target.value},'Add-on layout updated')}>
          {(fan?['centered','front','rear']:['grid','perimeter']).map(item=><option key={item} value={item}>{human(item)}</option>)}
        </select></label>
        {fan&&<label className="finish-dock-inline-setting">Mount <select aria-label="Fan mounting style"
          disabled={!enabled} value={String(values.patioFanMount??'standard')}
          onChange={event=>updateValues({patioFanMount:event.target.value},'Fan mounting style updated')}>
          <option value="standard">Standard · 12-inch preview drop</option>
          <option value="low-profile">Low profile · 8-inch preview drop</option>
        </select></label>}
        {!enabled&&Number(values[countKey])>0&&<button type="button" className="finish-dock-text-button"
          onClick={()=>updateValues({[countKey]:0},'Incompatible overhead add-on removed')}>Remove saved {fan?'fans':'lights'}</button>}
      </div>;
      note='Generic fixture layout. Final fixture, support and electrical specifications remain in project details.';
    }else{
      const options=getLightingOptions(project,addonMode);
      const fixtureKey=addonMode==='post'?'lightingPostFixture':addonMode==='post-cap'?'lightingPostCapFixture':
        addonMode==='stair'?'lightingStairFixture':'lightingDeckFixture';
      selected=String(values[fixtureKey]??'none');
      choices=options.map(item=>({id:item.id,label:item.label,disabled:!item.enabled,reason:item.reason,
        sourceUrl:getLightingProduct(item.id)?.sourceUrl,image:getLightingProduct(item.id)?.imageUrl,
        visual:getLightingProduct(item.id)?.imageUrl?undefined:'label'}));
      selectedTitle=choices.find(choice=>choice.id===selected)?.label??human(selected);
      selectedDetail=addonMode==='stair'?'Stair risers':addonMode==='deck'?'Deck surface':'Railing posts';
      selectChoice=id=>{
        if(addonMode==='post-cap'){
          const next=changePostCapLighting(values,id);if(next===values)return;
          onChange({values:next});setAnnouncement('Post-cap lighting updated');
        }else updateValues({[fixtureKey]:id},selectedDetail+' lighting updated');
      };
      const patternKey=addonMode==='post'?'lightingPostPattern':addonMode==='post-cap'?'lightingPostCapPattern':'lightingStairPattern';
      extra=<div className="finish-dock-inline-settings">
        {addonMode==='deck'?<label className="finish-dock-inline-setting">Spacing <input type="number" min={2} max={12} step={1}
          aria-label="Deck light spacing in feet" value={Number(values.lightingDeckSpacingFt??6)}
          onChange={event=>updateValues({lightingDeckSpacingFt:clamp(Number(event.target.value),2,12)},'Deck light spacing updated')}/> ft</label>:
          <label className="finish-dock-inline-setting">Placement <select aria-label="Lighting placement pattern"
            value={String(values[patternKey]??'all')} onChange={event=>updateValues({[patternKey]:event.target.value},'Lighting placement updated')}>
            <option value="all">Every {addonMode==='stair'?'riser':'post'}</option>
            <option value="alternating">Every other {addonMode==='stair'?'riser':'post'}</option>
          </select></label>}
        {addonMode==='stair'&&<label className="finish-dock-inline-setting">Per riser <select aria-label="Lights per riser"
          value={Number(values.lightingStairPerRiser??1)} onChange={event=>updateValues({lightingStairPerRiser:Number(event.target.value)},'Riser light quantity updated')}>
          <option value={1}>1 centered</option><option value={2}>2 evenly spaced</option></select></label>}
        {(values.multiTierEnabled===true||String(values.multiTierEnabled)==='true')&&<label className="finish-dock-inline-setting">
          Tier <select aria-label="Lighting deck tier" value={String(values.lightingTier??'all')}
            onChange={event=>updateValues({lightingTier:event.target.value},'Lighting tier updated')}>
            <option value="all">Both tiers</option><option value="main">Main deck</option><option value="lower">Lower deck</option></select></label>}
      </div>;
      note='Compatible TimberTech fixtures for the selected railing and stairs. Switch to evening view to preview illumination.';
      if(getLightingProduct(selected)?.geometryFidelity==='mounting-symbol')
        note='Placement preview; confirm the fixture profile with your supplier.';
    }
    if(lightingPlan){
      const category=addonMode==='fans'?'fan':addonMode==='can-lights'?'can-light':addonMode;
      if(lightingPlan.requestedCounts[category]>0)selectedDetail=
        lightingPlan.placedCounts[category]+' of '+lightingPlan.requestedCounts[category]+' placed · '+selectedDetail;
    }
  }
  const selectedChoice=choices.find(choice=>choice.id===selected);
  const featureItems=[
    {label:'Picture frame',action:()=>{
      if(!installedTabs.some(tab=>tab.category==='picture-frame'))onChange({values:changeFinishCourseCount(values,'picture-frame',1)});
      setActiveId('picture-frame-1');setRevealed(null);setMenuOpen(false);
    }},
    {label:'Breaker boards',action:()=>{
      if(!installedTabs.some(tab=>tab.category==='breaker'))onChange({values:changeFinishCourseCount(values,'breaker',1)});
      setActiveId('breaker-1');setRevealed(null);setMenuOpen(false);
    }},
    {label:'Stairs',action:()=>requestDetails('stairs')},
    {label:'Railing',action:()=>installedTabs.some(tab=>tab.category==='railing')?openCategory('railing'):requestDetails('railing')},
    {label:'Patio cover',action:()=>openCategory('cover')},
    {label:'Screen room',action:()=>installedTabs.some(tab=>tab.category==='screen')?openCategory('screen'):requestDetails('screen')},
    {label:'Sunroom',action:()=>installedTabs.some(tab=>tab.category==='sunroom')?openCategory('sunroom'):requestDetails('sunroom')},
    {label:'Concrete area',action:()=>areas.length?openCategory('concrete'):requestDetails('concrete')},
    {label:'Lighting & add-ons',action:()=>openCategory('add-ons')},
  ];
  return <section className="consultation-finish-dock" aria-label="Live design finish catalog">
    <div className="finish-dock-navigation">
      <div className="finish-dock-tabs" role="tablist" aria-label="Design finish categories" ref={tabsRef} onKeyDown={tabKeys}>
        {tabs.map(item=><button type="button" role="tab" key={item.id} id={uid+'-tab-'+item.id}
          aria-selected={active.id===item.id} aria-controls={uid+'-panel'} tabIndex={active.id===item.id?0:-1}
          className={active.id===item.id?'is-active':''} onClick={()=>activateTab(item)}>{item.label}</button>)}
      </div>
      <div className="finish-dock-add">
        <button type="button" className="finish-dock-add-button" ref={addButton}
          aria-expanded={menuOpen} aria-controls={uid+'-add-menu'} aria-haspopup="menu"
          onClick={()=>setMenuOpen(previous=>!previous)}><span aria-hidden="true">＋</span> Add / edit <Chevron direction="down"/></button>
        {menuOpen&&<div className="finish-dock-add-menu" id={uid+'-add-menu'} role="menu" aria-label="Add or edit a feature"
          onKeyDown={event=>{
            if(event.key==='Escape'){setMenuOpen(false);addButton.current?.focus();return;}
            if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
            event.preventDefault();
            const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
            const current=items.indexOf(document.activeElement as HTMLButtonElement);
            const next=event.key==='Home'?0:event.key==='End'?items.length-1:
              (current+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;
            items[next]?.focus();
          }}>
          {featureItems.map(item=><button type="button" role="menuitem" key={item.label} onClick={item.action}>{item.label}<ExternalLinkIcon/></button>)}
        </div>}
      </div>
    </div>
    <div id={uid+'-panel'} role="tabpanel" aria-labelledby={uid+'-tab-'+active.id} className="finish-dock-panel">
      <div className="finish-dock-toolbar">
        <div className="finish-dock-selection">
          <span>{active.label}</span><strong title={selectedTitle}>{selectedTitle||'Choose a feature'}</strong>
          <small>{selectedDetail}</small>
        </div>
        <div className="finish-dock-controls">{controls}</div>
      </div>
      {choices.length?<DockCarousel choices={choices} selected={selected} onSelect={selectChoice}
        label={active.label+' choices'}/>:<div className="finish-dock-empty">
        Draw this feature to choose its finish.
        <button type="button" onClick={()=>requestDetails(active.category)}>Open design settings</button>
      </div>}
      {!!lightingPlan?.issues.length&&<details className="finish-dock-placement-issues">
        <summary>{lightingPlan.issues.length} lighting placement {lightingPlan.issues.length===1?'check':'checks'}</summary>
        <ul>{lightingPlan.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>
      </details>}
      {concreteIssues.length>0&&<div className="finish-dock-placement-issues" role="status">
        {concreteIssues.map(issue=><p key={issue}>{issue}</p>)}
      </div>}
      <div className="finish-dock-footer">
        <div className="finish-dock-note">{note}
          {selectedChoice?.sourceUrl&&<> <a href={selectedChoice.sourceUrl} target="_blank" rel="noreferrer">Product reference <ExternalLinkIcon/></a></>}
        </div>
        {extra}
        {onRequestDetails&&active.category!=='add-ons'&&<button type="button" className="finish-dock-text-button" onClick={()=>requestDetails(
          active.category==='breaker'?'breaker-boards':active.category==='deck'?'materials':active.category
        )}>Details <ExternalLinkIcon/></button>}
      </div>
    </div>
    <span className="finish-dock-sr-only" role="status" aria-live="polite">{announcement}</span>
  </section>;
}
