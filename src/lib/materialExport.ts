import type { MaterialItem } from './types';

type Values=Record<string,string|number|boolean>;
type Measure=(text:string)=>number;

/** Wrap complete content, including long product URLs and unbroken identifiers. */
export function wrapMaterialExportText(value:string,width:number,measure:Measure){
  const lines:string[]=[];let current='';
  for(const word of String(value||'—').split(/\s+/).filter(Boolean)){
    if(current&&measure(current+' '+word)<=width){current+=' '+word;continue;}
    if(current){lines.push(current);current='';}
    let remainder=Array.from(word);
    while(measure(remainder.join(''))>width&&remainder.length>1){
      let count=1;
      while(count<remainder.length&&measure(remainder.slice(0,count+1).join(''))<=width)count++;
      lines.push(remainder.slice(0,count).join(''));remainder=remainder.slice(count);
    }
    current=remainder.join('');
  }
  if(current)lines.push(current);
  return lines.length?lines:['—'];
}

export const materialExportQuantity=(value:number)=>Number.isFinite(value)?
  value.toLocaleString('en-US',{maximumFractionDigits:3}):'Unavailable';

/** Paginate the measured rows before rasterizing. A normal row stays intact;
 * an exceptionally long row continues with repeated category/column headers. */
export function renderMaterialExportPages(title:string,values:Values,grouped:Record<string,MaterialItem[]>,orderNotes:readonly string[]=[]){
  const margin=32,gutter=8,lineHeight=20;
  const widths=[240,210,75,85,160,340];
  const headers=['Material','Stock recommendation','Qty','Unit','Color','Notes'];
  const tableWidth=widths.reduce((sum,width)=>sum+width,0)+gutter*(widths.length-1);
  const width=tableWidth+margin*2,height=Math.floor(width*(764/584));
  const columns=[margin];for(let i=0;i<widths.length-1;i++)columns.push(columns[i]+widths[i]+gutter);
  const pages:HTMLCanvasElement[]=[];
  let ctx!:CanvasRenderingContext2D,y=0,bodyStart=0;
  const bottom=height-48;
  const wrap=(value:string,column:number)=>wrapMaterialExportText(value,widths[column]-16,text=>ctx.measureText(text).width);
  const labelsFor=(row:MaterialItem)=>{
    if(!row.layoutLabel?.trim())return [];
    ctx.font='14px Arial';
    const lines=wrapMaterialExportText('Drawing labels: '+row.layoutLabel,tableWidth-16,text=>ctx.measureText(text).width);
    ctx.font='16px Arial';return lines;
  };
  const cellsFor=(row:MaterialItem)=>[row.name,row.stockRecommendation||'—',materialExportQuantity(row.quantity),
    row.unit,row.color||'—',row.notes||'—'].map(wrap);
  const pageHeader=()=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
    ctx=context;pages.push(canvas);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#111827';ctx.font='700 28px Arial';
    const titleLines=wrapMaterialExportText(title,tableWidth,text=>ctx.measureText(text).width);
    const heading=pages.length>1?['Material order list · continued']:
      titleLines.length<=4?titleLines:['Material order list'];
    y=44;for(const line of heading){ctx.fillText(line,margin,y);y+=34;}
    ctx.font='16px Arial';y+=4;bodyStart=y;
  };
  // Full customer metadata belongs to the document once. Repeating an
  // arbitrarily long job name on every page can leave no room for even one
  // material row and make pagination loop forever.
  const documentDetails=()=>{
    ctx.font='700 28px Arial';
    const titleLines=wrapMaterialExportText(title,tableWidth,text=>ctx.measureText(text).width);
    ctx.font='16px Arial';
    const info=[
      ...(titleLines.length>4?['Document title: '+title]:[]),
      'P.O / Job name: '+String(values.poJobName||'—'),
      'Address: '+String(values.jobAddress||'—'),
      'Phone: '+String(values.customerPhone||'—')+' · Balance due: '+String(values.balanceDueCompletion||'—')+
        ' · Financed: '+String(values.financedYesNo||'No')+' · Deliver: '+String(values.deliverYesNo||'No')+
        ' · Delivery date: '+String(values.deliverDate||'—'),
    ];
    for(const value of info)for(const line of wrapMaterialExportText(value,tableWidth,text=>ctx.measureText(text).width)){
      if(y+lineHeight>bottom)pageHeader();
      ctx.fillText(line,margin,y);y+=lineHeight;
    }
    y+=16;
    if(y+100>bottom)pageHeader();
  };
  const groupHeader=(category:string,continued=false)=>{
    ctx.fillStyle='#111827';ctx.font='700 20px Arial';
    let titleLines=wrapMaterialExportText(category+(continued?' (continued)':''),tableWidth,text=>ctx.measureText(text).width);
    if(continued&&titleLines.length>4)titleLines=['Materials (continued)'];
    for(const line of titleLines){
      if(y+90>bottom){pageHeader();ctx.font='700 20px Arial';}
      ctx.fillText(line,margin,y+20);y+=26;
    }
    y+=4;ctx.fillStyle='#edf2f7';ctx.fillRect(margin,y,tableWidth,30);
    ctx.fillStyle='#111827';ctx.font='700 14px Arial';
    headers.forEach((label,i)=>ctx.fillText(label,columns[i]+8,y+20));y+=30;ctx.font='16px Arial';
  };
  pageHeader();
  documentDetails();
  for(const [category,rows] of Object.entries(grouped)){
    if(!rows.length)continue;
    const first=rows[0],firstLines=cellsFor(first),firstLabels=labelsFor(first);
    const firstHeight=16+Math.max(...firstLines.map(column=>column.length))*lineHeight+
      (firstLabels.length?16+firstLabels.length*18:0);
    if(y+60+Math.min(firstHeight,bottom-bodyStart-60)>bottom)pageHeader();
    groupHeader(category);
    rows.forEach((row,rowIndex)=>{
      const lines=cellsFor(row),labels=labelsFor(row),count=Math.max(...lines.map(column=>column.length));
      const rowHeight=16+count*lineHeight+(labels.length?16+labels.length*18:0);
      if(y+rowHeight>bottom&&rowHeight<bottom-bodyStart-60){pageHeader();groupHeader(category,true);}
      let labelOffset=0;
      while(labelOffset<labels.length){
        const fits=Math.floor((bottom-y-16)/18);
        if(fits<1){pageHeader();groupHeader(category,true);continue;}
        const length=Math.min(fits,labels.length-labelOffset),labelHeight=16+length*18;
        ctx.fillStyle='#f1f5f9';ctx.fillRect(margin,y,tableWidth,labelHeight);
        ctx.strokeStyle='#cbd5e1';ctx.strokeRect(margin,y,tableWidth,labelHeight);
        ctx.fillStyle='#475569';ctx.font='14px Arial';
        labels.slice(labelOffset,labelOffset+length).forEach((line,j)=>ctx.fillText(line,margin+8,y+20+j*18));
        ctx.font='16px Arial';labelOffset+=length;y+=labelHeight;
      }
      let offset=0;
      while(offset<count){
        const fits=Math.floor((bottom-y-16)/lineHeight);
        if(fits<1){pageHeader();groupHeader(category,true);continue;}
        const length=Math.min(fits,count-offset),segmentHeight=16+length*lineHeight;
        ctx.fillStyle=rowIndex%2?'#e4edf7':'#fff';ctx.fillRect(margin,y,tableWidth,segmentHeight);
        ctx.strokeStyle='#cbd5e1';ctx.strokeRect(margin,y,tableWidth,segmentHeight);
        ctx.fillStyle='#111827';ctx.font='16px Arial';
        lines.forEach((column,i)=>column.slice(offset,offset+length).forEach((line,j)=>ctx.fillText(line,columns[i]+8,y+22+j*lineHeight)));
        y+=segmentHeight;offset+=length;
        if(offset<count){pageHeader();groupHeader(category,true);}
      }
    });
    y+=20;
  }
  const renderNotes=(heading:string,paragraphs:readonly string[])=>{
    if(!paragraphs.length)return;
    const noteHeader=(continued=false)=>{
      ctx.fillStyle='#111827';ctx.font='700 18px Arial';
      ctx.fillText(heading+(continued?' (continued)':''),margin,y+20);y+=32;ctx.font='16px Arial';
    };
    if(y+70>bottom)pageHeader();
    noteHeader();
    for(const paragraph of paragraphs){
      for(const line of wrapMaterialExportText(paragraph,tableWidth,text=>ctx.measureText(text).width)){
        if(y+lineHeight>bottom){pageHeader();noteHeader(true);}
        ctx.fillText(line,margin,y+18);y+=lineHeight;
      }
      y+=8;
    }
  };
  const notes=String(values.jobNotes||'').trim();
  renderNotes('Job notes',notes?[notes]:[]);
  // These notes travel with the quantities. In particular, a Studio copy can
  // include selected cover/enclosure context without a verified roof BOM.
  // Keep that boundary on the exported document, not only on the web page.
  renderNotes('Order notes & scope',Array.from(new Set(orderNotes.map(note=>String(note).trim()).filter(Boolean)))
    .map((note,index)=>(index+1)+'. '+note));
  pages.forEach((page,index)=>{
    const context=page.getContext('2d')!;context.font='14px Arial';context.fillStyle='#64748b';
    context.fillText('Material order list · page '+(index+1)+' of '+pages.length+' · Quantities shown to 0.001',margin,height-18);
  });
  return pages;
}

export function stackMaterialExportPages(pages:HTMLCanvasElement[]){
  const canvas=document.createElement('canvas');canvas.width=Math.max(...pages.map(page=>page.width));
  canvas.height=pages.reduce((sum,page)=>sum+page.height,0);
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  let y=0;for(const page of pages){ctx.drawImage(page,0,y);y+=page.height;}
  return canvas;
}
