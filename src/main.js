"use strict";
/* ============================ 儲存 ============================ */
const KEY="clinical-kb.v1";
let memOnly=false;
function load(){
  try{const raw=localStorage.getItem(KEY);if(raw)return JSON.parse(raw);}
  catch(e){memOnly=true;}
  return {format:"clinical-kb",version:1,items:[]};
}
function save(){
  if(memOnly)return;
  try{localStorage.setItem(KEY,JSON.stringify(db));}
  catch(e){memOnly=true;document.getElementById("storageBanner").hidden=false;
    toast("本機儲存已滿或被封鎖，請用「匯出」保留資料");}
}
let db=load();
if(memOnly)document.getElementById("storageBanner").hidden=false;

const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=s=>document.querySelector(s);
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),2600);}

/* ============================ 狀態 ============================ */
const KINDS={
  text:{icon:"📝",name:"文字"}, flow:{icon:"🔀",name:"流程圖"}, table:{icon:"📋",name:"表格"},
  image:{icon:"🖼",name:"圖片"}, keywords:{icon:"🏷",name:"關鍵字"}, calc:{icon:"🧮",name:"計算機"}
};
const FTYPE={Q:"問題",A:"處置",R:"結論",N:"註記"};
let cur=null, curTab=0, onePage=false, query="", listSel=-1;
let edit={}, tools={}, metaOpen=false, flowState={}, flowCache={}, flowRaw={};
const itemById=id=>db.items.find(i=>i.id===id);
function setView(v){document.body.dataset.view=v;}
const viewIs=v=>document.body.dataset.view===v;

/* ============================ 簡化 Markdown ============================ */
function inlineMd(s){
  return esc(s).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
}
function renderText(src){
  const lines=String(src||"").split(/\r?\n/);let out="",inUl=false;
  const closeUl=()=>{if(inUl){out+="</ul>";inUl=false;}};
  for(const raw of lines){
    const l=raw.trim();
    if(!l){closeUl();continue;}
    if(/^#\s+/.test(l)){closeUl();out+="<h3>"+inlineMd(l.replace(/^#\s+/,""))+"</h3>";}
    else{closeUl();out+="<p>"+inlineMd(l)+"</p>";}
  }
  closeUl();
  return out||'<p style="color:var(--ink-3)">（尚無內容）</p>';
}

/* ============================ CSV ============================ */
function parseCsv(txt){
  const rows=[];let row=[],f="",q=false;const s=String(txt||"").replace(/\r\n?/g,"\n");
  for(let i=0;i<s.length;i++){const c=s[i];
    if(q){ if(c==='"'){ if(s[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
    else if(c==='"')q=true;
    else if(c===","||c==="\t"){row.push(f);f="";}
    else if(c==="\n"){row.push(f);f="";rows.push(row);row=[];}
    else f+=c;
  }
  if(f!==""||row.length){row.push(f);rows.push(row);}
  return rows.filter(r=>r.some(x=>x.trim()!==""));
}
function renderTable(src,header){
  const rows=parseCsv(src);
  if(!rows.length)return '<p style="color:var(--ink-3)">（尚無資料，貼上 CSV 或讀入檔案）</p>';
  const w=Math.max(...rows.map(r=>r.length));
  const pad=r=>{const c=r.slice();while(c.length<w)c.push("");return c;};
  let h="";
  if(header!==false){h="<thead><tr>"+pad(rows[0]).map(c=>"<th>"+inlineMd(c.trim())+"</th>").join("")+"</tr></thead>";rows.shift();}
  const b="<tbody>"+rows.map(r=>"<tr>"+pad(r).map(c=>"<td>"+inlineMd(c.trim())+"</td>").join("")+"</tr>").join("")+"</tbody>";
  return '<div class="tbl"><table>'+h+b+"</table></div>";
}

/* ============================ 流程圖：解析 ============================ */
function parseFlow(src){
  const nodes=[];const map={};
  const lines=String(src||"").split(/\r?\n/);
  let last=null;
  for(const raw of lines){
    if(!raw.trim())continue;
    const indented=/^\s/.test(raw);
    const l=raw.trim();
    const m=l.match(/^([QARNqarn])\s+([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
    if(m&&!indented){
      const n={id:m[2],type:m[1].toUpperCase(),text:m[3].trim(),out:[],notes:[]};
      nodes.push(n);map[n.id]=n;last=n;continue;
    }
    if(!last)continue;
    if(/^\*\s*/.test(l)){last.notes.push(l.replace(/^\*\s*/,""));continue;}
    const e=l.match(/^(.*?)->\s*([A-Za-z0-9_\-]+)\s*$/);
    if(e){last.out.push({label:e[1].trim(),to:e[2]});continue;}
    if(m){const n={id:m[2],type:m[1].toUpperCase(),text:m[3].trim(),out:[],notes:[]};nodes.push(n);map[n.id]=n;last=n;}
  }
  return {nodes,map,start:nodes[0]?nodes[0].id:null};
}

/* 文字折行（中英混排估寬） */
function wrap(text,maxCh){
  const words=String(text).split(/(\s+)/);const lines=[];let line="";
  const width=s=>[...s].reduce((a,c)=>a+(/[\u2E80-\u9FFF\uFF00-\uFFEF]/.test(c)?2:1),0);
  for(const w of words){
    if(width(line+w)>maxCh*2&&line.trim()){lines.push(line.trim());line=w.trim()?w:"";}
    else line+=w;
    while(width(line)>maxCh*2+4){
      let cut="",i=0;const chars=[...line];
      while(i<chars.length&&width(cut+chars[i])<=maxCh*2){cut+=chars[i++];}
      lines.push(cut);line=chars.slice(i).join("");
    }
  }
  if(line.trim())lines.push(line.trim());
  return lines.length?lines:[""];
}

/* 分層佈局 → SVG */
function renderFlowSvg(src){
  const {nodes,map,start}=parseFlow(src);
  if(!nodes.length)return '<p style="color:var(--ink-3)">（尚無流程，點「編輯」寫入節點）</p>';
  const rank={};const order=[];
  const targeted=new Set();nodes.forEach(n=>n.out.forEach(e=>targeted.add(e.to)));
  const roots=nodes.filter(n=>!targeted.has(n.id)).map(n=>n.id);
  if(start&&!roots.includes(start))roots.unshift(start);   // 第一個節點永遠算入口，迴路才不會被推到深層
  let queue=roots.map(id=>[id,0]);
  while(queue.length){
    const [id,d]=queue.shift();const n=map[id];if(!n)continue;
    if(rank[id]!==undefined&&rank[id]>=d)continue;
    if(rank[id]===undefined)order.push(id);
    rank[id]=d;
    n.out.forEach(e=>{if(map[e.to])queue.push([e.to,d+1]);});
  }
  nodes.forEach(n=>{if(rank[n.id]===undefined){rank[n.id]=0;order.push(n.id);}});

  const CW=8.2,LH=17,PADX=13,PADY=11,GAPX=26,GAPY=52,MAXCH=16;
  const box={};
  nodes.forEach(n=>{
    const lines=wrap(n.text,MAXCH);
    const notes=n.notes.length?wrap(n.notes.join("；"),MAXCH+4):[];
    const w=Math.max(...lines.concat(notes).map(l=>[...l].reduce((a,c)=>a+(/[\u2E80-\u9FFF\uFF00-\uFFEF]/.test(c)?2:1),0)))*CW/2*1.02;
    box[n.id]={lines,notes,w:Math.max(96,Math.min(230,w+PADX*2)),h:PADY*2+lines.length*LH+(notes.length?notes.length*14+4:0)};
  });
  const byRank={};order.forEach(id=>{(byRank[rank[id]]=byRank[rank[id]]||[]).push(id);});
  const ranks=Object.keys(byRank).map(Number).sort((a,b)=>a-b);
  const rowW={},rowH={};
  ranks.forEach(r=>{rowW[r]=byRank[r].reduce((a,id)=>a+box[id].w+GAPX,-GAPX);rowH[r]=Math.max(...byRank[r].map(id=>box[id].h));});
  const totalW=Math.max(...ranks.map(r=>rowW[r]))+40;
  let y=18;const pos={};
  ranks.forEach(r=>{
    let x=(totalW-rowW[r])/2;
    byRank[r].forEach(id=>{pos[id]={x,y,w:box[id].w,h:box[id].h};x+=box[id].w+GAPX;});
    y+=rowH[r]+GAPY;
  });
  const totalH=y-GAPY+22;
  const col={Q:["var(--q-bg)","var(--q)"],A:["var(--a-bg)","var(--a)"],R:["var(--r-bg)","var(--r)"],N:["var(--n-bg)","var(--n)"]};

  let edges="";
  nodes.forEach(n=>{
    const p=pos[n.id];if(!p)return;
    n.out.forEach((e,i)=>{
      const t=pos[e.to];if(!t)return;
      const x1=p.x+p.w/2,y1=p.y+p.h,x2=t.x+t.w/2,y2=t.y;
      const down=y2>y1;
      const my=down?(y1+y2)/2:y1+26;
      const d=down
        ? `M${x1} ${y1} V${my} H${x2} V${y2}`
        : `M${x1} ${y1} V${my} H${x2+t.w/2+16} V${y2+t.h/2} H${t.x+t.w}`;
      edges+=`<path class="fedge" d="${d}" marker-end="url(#ar)"/>`;
      if(e.label){
        const lx=down?(x1+x2)/2:x2+t.w/2+20, ly=down?my-4:my-4;
        const wpx=[...e.label].reduce((a,c)=>a+(/[\u2E80-\u9FFF]/.test(c)?11:6),0);
        edges+=`<rect x="${lx-wpx/2-4}" y="${ly-12}" width="${wpx+8}" height="15" rx="3" fill="var(--paper)" stroke="var(--line)"/>`
             +`<text class="felabel" x="${lx}" y="${ly}" text-anchor="middle">${esc(e.label)}</text>`;
      }
    });
  });
  let boxes="";
  nodes.forEach(n=>{
    const p=pos[n.id];if(!p)return;const b=box[n.id];const[c1,c2]=col[n.type]||col.N;
    boxes+=`<g class="fnode"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${n.type==="R"?12:7}" fill="${c1}" stroke="${c2}"/>`;
    let ty=p.y+PADY+13;
    b.lines.forEach(l=>{boxes+=`<text x="${p.x+p.w/2}" y="${ty}" text-anchor="middle" fill="var(--ink)" font-weight="${n.type==="Q"?600:500}">${esc(l)}</text>`;ty+=LH;});
    ty+=2;
    b.notes.forEach(l=>{boxes+=`<text x="${p.x+p.w/2}" y="${ty}" text-anchor="middle" fill="var(--ink-3)" font-size="11">${esc(l)}</text>`;ty+=14;});
    boxes+="</g>";
  });
  return `<div class="flowscroll"><svg viewBox="0 0 ${Math.round(totalW)} ${Math.round(totalH)}" width="${Math.round(totalW)}" height="${Math.round(totalH)}" style="max-width:100%;height:auto">
    <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="var(--ink-3)"/></marker></defs>
    ${edges}${boxes}</svg></div>`;
}

/* 逐步模式 */
function renderFlowStep(blk){
  const f=parseFlow(blk.src);
  if(!f.nodes.length)return '<p style="color:var(--ink-3)">（尚無流程）</p>';
  const st=flowState[blk.id]=flowState[blk.id]||{path:[],at:f.start};
  if(!f.map[st.at])st.at=f.start;
  const n=f.map[st.at];
  const TY={Q:["q","問題"],A:["a","處置"],R:["r","結論"],N:["n","註記"]}[n.type]||["n","節點"];
  let trail="";
  if(st.path.length){
    trail='<div class="trail">'+st.path.map((p,i)=>{
      const pn=f.map[p.nodeId];
      return `<div class="trailrow"><span>${i+1}.</span><span>${esc(pn?pn.text:p.nodeId)}</span>${p.label?`<b>→ ${esc(p.label)}</b>`:""}</div>`;
    }).join("")+"</div>";
  }
  let opts="";
  if(n.out.length){
    opts='<div class="opts">'+n.out.map((e,i)=>
      `<button class="opt" data-go="${esc(e.to)}" data-lab="${esc(e.label)}"><span class="k">${i+1}</span><span>${esc(e.label||"繼續")}</span><span class="ar">›</span></button>`
    ).join("")+"</div>";
  }else{
    opts='<div class="opts"><button class="opt" data-restart="1"><span>回到開頭</span></button></div>';
  }
  const notes=n.notes.length?'<div class="stepdetail"><ul>'+n.notes.map(x=>"<li>"+inlineMd(x)+"</li>").join("")+"</ul></div>":"";
  return `<div class="step" data-step="${blk.id}">${trail}
    <div class="stepcard ${TY[0]}"><div class="steplab">${TY[1]}</div>
      <div class="stepq">${inlineMd(n.text)}</div>${notes}${opts}</div>
    <div class="stepnav">
      <button class="btn" data-back="1" ${st.path.length?"":"disabled"}>上一步</button>
      <button class="btn" data-restart="1">重新開始</button>
    </div></div>`;
}

/* ============================ 計算機 ============================ */
function parseCalc(src){
  const c={fields:[],expr:"SUM",label:"結果",dec:0,bands:[]};
  String(src||"").split(/\r?\n/).forEach(raw=>{
    const l=raw.trim();if(!l)return;
    let m;
    if(m=l.match(/^number\s+([A-Za-z_][\w]*)\s*:\s*([^(=]*)(?:\(([^)]*)\))?\s*(?:=\s*(-?[\d.]+))?$/)){
      c.fields.push({kind:"number",id:m[1],label:m[2].trim(),unit:(m[3]||"").trim(),def:m[4]!==undefined?+m[4]:""});return;}
    if(m=l.match(/^check\s+([A-Za-z_][\w]*)\s*:\s*(.*?)\s*(?:=\s*(-?[\d.]+))?$/)){
      c.fields.push({kind:"check",id:m[1],label:m[2].trim(),w:m[3]!==undefined?+m[3]:1});return;}
    if(m=l.match(/^select\s+([A-Za-z_][\w]*)\s*:\s*([^|]*)\|(.*)$/)){
      const opts=m[3].split("|").map(o=>{const p=o.split("=");return{label:p[0].trim(),value:+(p[1]||0)};}).filter(o=>o.label);
      c.fields.push({kind:"select",id:m[1],label:m[2].trim(),opts});return;}
    if(m=l.match(/^=\s*(.+)$/)){c.expr=m[1].trim();return;}
    if(m=l.match(/^label\s+(.+)$/)){c.label=m[1].trim();return;}
    if(m=l.match(/^dec\s+(\d+)$/)){c.dec=+m[1];return;}
    if(m=l.match(/^band\s+(-?[\d.]+)\s*-\s*(-?[\d.]+)\s*:\s*(.+)$/)){c.bands.push({min:+m[1],max:+m[2],text:m[3].trim()});return;}
  });
  return c;
}
/* 安全運算式：遞迴下降，不用 eval */
function evalExpr(src,vars){
  let i=0;const s=String(src);
  const ws=()=>{while(i<s.length&&/\s/.test(s[i]))i++;};
  const eat=t=>{ws();if(s.startsWith(t,i)){i+=t.length;return true;}return false;};
  const F={min:Math.min,max:Math.max,round:Math.round,floor:Math.floor,ceil:Math.ceil,abs:Math.abs,
           sqrt:Math.sqrt,ln:Math.log,log:Math.log10,exp:Math.exp,pow:Math.pow};
  function atom(){
    ws();
    if(eat("(")){const v=or();eat(")");return v;}
    if(eat("-"))return -atom();
    if(eat("+"))return atom();
    let m=/^\d+(\.\d+)?/.exec(s.slice(i));
    if(m){i+=m[0].length;return parseFloat(m[0]);}
    m=/^[A-Za-z_][\w]*/.exec(s.slice(i));
    if(m){
      i+=m[0].length;const name=m[0];
      if(eat("(")){
        const args=[];if(!eat(")")){do{args.push(or());}while(eat(","));eat(")");}
        if(name==="if")return args[0]?args[1]:args[2];
        if(F[name])return F[name].apply(null,args);
        return 0;
      }
      const v=vars[name];return typeof v==="number"&&isFinite(v)?v:0;
    }
    i++;return 0;
  }
  function pow(){let a=atom();ws();if(eat("^"))return Math.pow(a,pow());return a;}
  function mul(){let a=pow();for(;;){ws();
    if(eat("*"))a*=pow();else if(eat("/")){const b=pow();a=b===0?NaN:a/b;}
    else if(eat("%"))a%=pow();else return a;}}
  function add(){let a=mul();for(;;){ws();if(eat("+"))a+=mul();else if(eat("-"))a-=mul();else return a;}}
  function cmp(){let a=add();for(;;){ws();
    if(eat(">="))a=a>=add()?1:0;else if(eat("<="))a=a<=add()?1:0;
    else if(eat("=="))a=a===add()?1:0;else if(eat("!="))a=a!==add()?1:0;
    else if(eat(">"))a=a>add()?1:0;else if(eat("<"))a=a<add()?1:0;else return a;}}
  function and(){let a=cmp();for(;;){ws();if(eat("&&"))a=(a&&cmp())?1:0;else return a;}}
  function or(){let a=and();for(;;){ws();if(eat("||"))a=(a||and())?1:0;else return a;}}
  const out=or();
  return isFinite(out)?out:NaN;
}
function calcValues(blk){
  const c=parseCalc(blk.src);const st=blk.state=blk.state||{};
  const vars={};let sum=0;
  c.fields.forEach(f=>{
    let v;
    if(f.kind==="check")v=st[f.id]?f.w:0;
    else if(f.kind==="select")v=st[f.id]!==undefined?+st[f.id]:(f.opts[0]?f.opts[0].value:0);
    else v=st[f.id]!==undefined&&st[f.id]!==""?+st[f.id]:(f.def===""?0:f.def);
    vars[f.id]=v;sum+=v;
  });
  vars.SUM=sum;
  const raw=evalExpr(c.expr,vars);
  return {c,raw};
}
function renderCalc(blk){
  const {c,raw}=calcValues(blk);const st=blk.state=blk.state||{};
  if(!c.fields.length)return '<p style="color:var(--ink-3)">（尚無欄位，點「編輯」定義量表）</p>';
  let rows="";
  c.fields.forEach(f=>{
    if(f.kind==="check"){
      rows+=`<div class="chkrow"><input type="checkbox" id="c_${blk.id}_${f.id}" data-cid="${f.id}" ${st[f.id]?"checked":""}>
        <label for="c_${blk.id}_${f.id}">${esc(f.label)}</label><span class="w">+${f.w}</span></div>`;
    }else if(f.kind==="select"){
      rows+=`<label for="s_${blk.id}_${f.id}">${esc(f.label)}</label><select id="s_${blk.id}_${f.id}" data-cid="${f.id}">`+
        f.opts.map(o=>`<option value="${o.value}" ${(+st[f.id]===o.value)?"selected":""}>${esc(o.label)}</option>`).join("")+"</select>";
    }else{
      rows+=`<label for="n_${blk.id}_${f.id}">${esc(f.label)}${f.unit?` <span class="u">${esc(f.unit)}</span>`:""}</label>
        <input type="number" step="any" id="n_${blk.id}_${f.id}" data-cid="${f.id}" value="${st[f.id]!==undefined?esc(st[f.id]):(f.def===""?"":f.def)}">`;
    }
  });
  const val=isNaN(raw)?"—":raw.toFixed(c.dec);
  const band=c.bands.find(b=>raw>=b.min&&raw<=b.max);
  return `<div class="calc" data-calc="${blk.id}"><div class="calcgrid">${rows}</div>
    <div class="result"><div class="val">${esc(val)}</div>
      <div class="note">${esc(c.label)}</div>
      ${band?`<div class="band">${inlineMd(band.text)}</div>`:""}</div>
    <div style="margin-top:9px"><button class="btn" data-calcreset="1">清除輸入</button></div></div>`;
}

/* ============================ 圖片／塗鴉 ============================ */
function drawStrokes(cv,strokes){
  const ctx=cv.getContext("2d");const {width:W,height:H}=cv;
  ctx.clearRect(0,0,W,H);ctx.lineJoin=ctx.lineCap="round";
  (strokes||[]).forEach(s=>{
    ctx.strokeStyle=s.c;ctx.lineWidth=s.w*Math.min(W,H)/600;
    ctx.beginPath();s.p.forEach((pt,i)=>{const x=pt[0]*W,y=pt[1]*H;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    if(s.p.length===1)ctx.arc(s.p[0][0]*W,s.p[0][1]*H,ctx.lineWidth/2,0,7);
    ctx.stroke();
  });
}
function mountCanvas(wrap,blk,editable){
  const cv=wrap.querySelector("canvas");const img=wrap.querySelector("img");
  const size=()=>{
    const r=wrap.getBoundingClientRect();
    cv.width=Math.max(300,Math.round(r.width));cv.height=Math.max(160,Math.round(r.height));
    drawStrokes(cv,blk.strokes);
  };
  if(img&&!img.complete)img.onload=size;else size();
  new ResizeObserver(size).observe(wrap);
  if(!editable)return;
  let drawing=null;
  const scope=()=>wrap.closest(".block");
  const tool=()=>scope().querySelector("[data-tool].primary")?.dataset.tool||"pen";
  const color=()=>scope().querySelector(".swatch.on")?.dataset.color||"#c8372c";
  const width=()=>+(scope().querySelector("[data-width]")?.value||4);
  const pt=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];};
  cv.addEventListener("pointerdown",e=>{
    cv.setPointerCapture(e.pointerId);
    if(tool()==="erase"){
      const [x,y]=pt(e);const idx=(blk.strokes||[]).findIndex(s=>s.p.some(p=>Math.hypot(p[0]-x,p[1]-y)<.025));
      if(idx>=0){blk.strokes.splice(idx,1);drawStrokes(cv,blk.strokes);save();}
      return;
    }
    blk.strokes=blk.strokes||[];
    drawing={c:color(),w:width(),p:[pt(e)]};blk.strokes.push(drawing);
  });
  cv.addEventListener("pointermove",e=>{if(!drawing)return;drawing.p.push(pt(e));drawStrokes(cv,blk.strokes);});
  const stop=()=>{if(drawing){drawing=null;save();}};
  cv.addEventListener("pointerup",stop);cv.addEventListener("pointercancel",stop);
}

/* ============================ 搜尋 ============================ */
function blockText(b){
  if(b.type==="table")return (b.title||"")+" "+(b.desc||"")+" "+String(b.src||"").replace(/[,"]/g," ");
  if(b.type==="flow")return (b.title||"")+" "+String(b.src||"").replace(/^[QARN]\s+[\w-]+:/gm," ").replace(/->/g," ");
  if(b.type==="calc")return (b.title||"")+" "+(b.desc||"")+" "+String(b.src||"").replace(/^(number|check|select|=|label|dec|band)/gm," ");
  return (b.title||"")+" "+(b.desc||"")+" "+String(b.src||"");
}
function score(item,qs){
  const title=(item.title+" "+(item.subtitle||"")+" "+(item.tags||[]).join(" ")).toLowerCase();
  const kws=(item.blocks||[]).filter(b=>b.type==="keywords").map(b=>b.src||"").join(",").toLowerCase();
  let s=0,hit=null,hitTab=-1;
  for(const t of qs){
    if(title.includes(t))s+=10;
    else if(kws.includes(t))s+=6;
    else{
      let found=false;
      (item.blocks||[]).forEach((b,bi)=>{
        if(found)return;
        const txt=blockText(b);
        const at=txt.toLowerCase().indexOf(t);
        if(at>=0){found=true;s+=2;if(!hit){hit=txt.slice(Math.max(0,at-24),at+56).trim();hitTab=bi;}}
      });
      if(!found)return {s:0};
    }
  }
  return {s,hit,hitTab};
}
function hl(txt,qs){
  let out=esc(txt);
  qs.forEach(t=>{if(!t)return;
    out=out.replace(new RegExp("("+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","gi"),"<mark>$1</mark>");});
  return out;
}

function strip(it){
  const o={title:it.title,subtitle:it.subtitle||"",tags:it.tags||[],blocks:(it.blocks||[]).map(b=>{
    const x={type:b.type};if(b.title)x.title=b.title;if(b.desc)x.desc=b.desc;
    if(b.src)x.src=b.src;if(b.mode)x.mode=b.mode;if(b.header===false)x.header=false;
    if((b.strokes||[]).length)x.strokes=b.strokes;return x;
  })};
  return o;
}
function normBlock(b){
  const o={id:uid(),type:(b.type||"text").toLowerCase(),title:b.title||"",desc:b.desc||"",src:b.src||b.content||b.body||""};
  if(!KINDS[o.type])o.type="text";
  if(Array.isArray(b.src))o.src=b.src.join(", ");
  if(o.type==="flow")o.mode=b.mode==="step"?"step":"page";
  if(o.type==="table"&&b.header===false)o.header=false;
  if(o.type==="image"){o.strokes=Array.isArray(b.strokes)?b.strokes:[];}
  return o;
}
function merge(data){
  let items=[];
  if(Array.isArray(data))items=data;
  else if(Array.isArray(data.items))items=data.items;
  else if(data.title)items=[data];
  let n=0;
  items.forEach(raw=>{
    if(!raw||!raw.title)return;
    const blocks=(raw.blocks||[]).map(normBlock);
    const exist=db.items.find(x=>(raw.id&&x.id===raw.id)||x.title===raw.title);
    if(exist){exist.subtitle=raw.subtitle||exist.subtitle;exist.tags=raw.tags||exist.tags;exist.blocks=blocks;}
    else db.items.push({id:raw.id||uid(),title:raw.title,subtitle:raw.subtitle||"",tags:raw.tags||[],blocks});
    n++;
  });
  save();renderList();
  return n;
}
function download(name,text){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));
  a.download=name.replace(/[\\/:*?"<>|]/g,"_");a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* ============================ 文字：MD <-> HTML ============================ */
function mdToHtml(src){
  const lines=String(src||"").split(/\r?\n/);
  if(!lines.length||(lines.length===1&&!lines[0]))return "<div><br></div>";
  return lines.map(l=>{
    const t=l.trim();
    if(/^#\s+/.test(t))return "<h3>"+inlineMd(t.replace(/^#\s+/,""))+"</h3>";
    if(!t)return "<div><br></div>";
    return "<div>"+inlineMd(l)+"</div>";
  }).join("");
}
function inlineToMd(node){
  let out="";
  node.childNodes.forEach(n=>{
    if(n.nodeType===3){out+=n.nodeValue.replace(/\u00a0/g," ");return;}
    if(n.nodeType!==1)return;
    const tag=n.tagName;
    if(tag==="BR"){out+="\n";return;}
    const inner=inlineToMd(n);
    if(!inner.trim()){out+=inner;return;}
    if(tag==="STRONG"||tag==="B")out+="**"+inner.trim()+"**";
    else out+=inner;
  });
  return out;
}
function htmlToMd(el){
  const parts=[];
  el.childNodes.forEach(n=>{
    if(n.nodeType===3){const t=n.nodeValue.replace(/\u00a0/g," ");if(t.trim())parts.push(t);return;}
    if(n.nodeType!==1)return;
    if(n.tagName==="BR"){parts.push("");return;}
    const md=inlineToMd(n);
    if(/^H[1-6]$/.test(n.tagName))parts.push("# "+md.trim());
    else parts.push(md.replace(/\n+$/,""));
  });
  return parts.join("\n").replace(/\n{3,}/g,"\n\n").trim();
}

/* ============================ 流程圖：序列化 ============================ */
function serializeFlow(nodes){
  return nodes.map(n=>{
    let s=n.type+" "+n.id+": "+(n.text||"");
    (n.notes||[]).forEach(x=>{if(x.trim())s+="\n  * "+x.trim();});
    (n.out||[]).forEach(e=>{if(e.to)s+="\n  "+(e.label?e.label+" ":"")+"-> "+e.to;});
    return s;
  }).join("\n");
}
function fnodes(blk){
  if(!flowCache[blk.id])flowCache[blk.id]=parseFlow(blk.src).nodes;
  return flowCache[blk.id];
}
function commitFlow(blk,structural){
  blk.src=serializeFlow(fnodes(blk));
  flowState[blk.id]=null;save();
  if(structural)renderMain(); else renderList();
}
function nextFid(nodes){
  let i=1;const has=id=>nodes.some(n=>n.id===id);
  while(has("n"+i))i++;
  return "n"+i;
}
function renderFlowEditor(blk){
  const nodes=fnodes(blk);
  if(flowRaw[blk.id]){
    return `<div class="row" style="margin-bottom:8px">
        <button class="btn" data-raw="0">圖形編輯</button><button class="btn on" data-raw="1">原始碼</button></div>
      <textarea class="src" data-src>${esc(blk.src||"")}</textarea>
      <div class="syntax">Q 問題／A 處置／R 結論／N 註記；縮排兩格寫「選項 -&gt; 目標id」或「* 補充」</div>`;
  }
  const opts=id=>`<option value="">（未指定）</option>`+nodes.map(n=>
      `<option value="${esc(n.id)}" ${n.id===id?"selected":""}>${esc((n.text||n.id).slice(0,16))}</option>`).join("");
  const cards=nodes.map((n,i)=>`
    <div class="fnodecard ${n.type.toLowerCase()}" data-nid="${esc(n.id)}">
      <div class="top">
        <span class="id">${i===0?"入口 ":""}${esc(n.id)}</span>
        <div class="seg">${["Q","A","R","N"].map(t=>
          `<button data-ftype="${t}" class="${n.type===t?"on":""}">${FTYPE[t]}</button>`).join("")}</div>
        <span style="flex:1"></span>
        <button class="ib" data-fup title="上移">↑</button>
        <button class="ib" data-fdown title="下移">↓</button>
        <button class="ib" data-fdel title="刪除節點">✕</button>
      </div>
      <input class="tx" data-ftext value="${esc(n.text||"")}" placeholder="節點文字">
      <input class="notein" data-fnote value="${esc((n.notes||[]).join("；"))}" placeholder="補充小字（選填）">
      ${(n.out||[]).map((e,j)=>`<div class="outrow" data-oi="${j}">
          <input data-flabel value="${esc(e.label||"")}" placeholder="${n.type==="Q"?"選項文字":"（無條件）"}">
          <select data-fto>${opts(e.to)}</select>
          <button class="x" data-odel title="移除出口">✕</button>
        </div>`).join("")}
      <div class="foot"><button class="btn bare" data-oadd>＋ 出口</button></div>
    </div>`).join("");
  return `<div class="row" style="margin-bottom:8px">
      <button class="btn on" data-raw="0">圖形編輯</button><button class="btn" data-raw="1">原始碼</button></div>
    <div class="fe">${cards}
      <div class="row">${["Q","A","R","N"].map(t=>
        `<button class="btn" data-fadd="${t}">＋ ${FTYPE[t]}</button>`).join("")}</div>
    </div>`;
}

/* ============================ 側欄列表 ============================ */
let shown=[];
function renderList(){
  const box=document.getElementById("list");
  const qs=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let arr=db.items.map(it=>({it,...(qs.length?score(it,qs):{s:1})})).filter(x=>x.s>0);
  if(qs.length)arr.sort((a,b)=>b.s-a.s||a.it.title.localeCompare(b.it.title));
  else arr.sort((a,b)=>a.it.title.localeCompare(b.it.title,"zh-Hant"));
  shown=arr;
  if(!db.items.length){box.innerHTML='<div class="empty">還沒有詞條。按右上「＋」開始，或用「AI 指南」把整理好的 JSON 貼進來。</div>';return;}
  if(!arr.length){box.innerHTML='<div class="empty">沒有符合「'+esc(query)+'」的詞條。</div>';return;}
  box.innerHTML=arr.map(x=>{
    const seen=[];(x.it.blocks||[]).forEach(bl=>{if(!seen.includes(bl.type))seen.push(bl.type);});
    return `<button class="entry ${x.it.id===cur?"on":""}" data-open="${x.it.id}" data-tab="${x.hitTab??-1}">
      <div class="t">${qs.length?hl(x.it.title,qs):esc(x.it.title)}</div>
      <div class="s">${seen.map(k=>KINDS[k].icon).join(" ")}${x.it.subtitle?"　"+esc(x.it.subtitle):""}</div>
      ${x.hit?`<div class="hit">${hl(x.hit,qs)}</div>`:""}</button>`;
  }).join("");
}

/* ============================ 詞條主畫面 ============================ */
function renderMain(){
  const host=document.getElementById("mainInner");
  const it=itemById(cur);
  if(!it){
    host.innerHTML=`<div style="padding:40px 20px;max-width:470px">
      <h2 style="font-size:17px;margin-bottom:7px">選一個詞條</h2>
      <p style="color:var(--ink-3);font-size:14px">每個詞條可放多個分頁：文字、機制／流程圖、表格、圖片畫記、關鍵字、量表計算機。流程圖能整張看，也能一題一題走。</p></div>`;
    return;
  }
  const blocks=it.blocks=it.blocks||[];
  if(curTab>=blocks.length)curTab=Math.max(0,blocks.length-1);
  const label=(b,i)=>b.title&&b.title.trim()?b.title.trim():KINDS[b.type].name+" "+(i+1);
  const tabs=blocks.map((b,i)=>{
    const on=!onePage&&i===curTab;
    return `<button class="tab ${on?"on":""}" data-tab="${i}" title="${esc(label(b,i))}">
      <span class="g">${KINDS[b.type].icon}</span><span class="${on?"nm":""}">${
      on&&b.title&&b.title.trim()?esc(b.title.trim()):(i+1)}</span></button>`;
  }).join("");
  const showMeta=metaOpen||!!((it.subtitle||"").trim())||(it.tags||[]).length;

  host.innerHTML=`
    <div class="bar">
      <button class="ib big back" data-golist aria-label="回索引">‹</button>
      <div class="ttl" contenteditable="plaintext-only" data-field="title">${esc(it.title)}</div>
      <button class="ib" data-meta title="說明與標籤">⋯</button>
    </div>
    <div class="meta" ${showMeta?"":"hidden"}>
      <span class="sub" contenteditable="plaintext-only" data-field="subtitle" data-ph="一行說明">${esc(it.subtitle||"")}</span>
      ${(it.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}
      <button class="btn bare" data-tags>標籤</button>
      <button class="btn bare" data-exportitem>匯出</button>
      <button class="btn bare danger" data-delitem>刪除詞條</button>
    </div>
    <div class="tabbar">${tabs}
      <button class="tabadd" data-addblock title="新增分頁">＋</button>
      ${blocks.length>1?`<button class="flip ${onePage?"on":""}" data-flip>${onePage?"分頁":"串成一頁"}</button>`:""}
    </div>
    <div id="stage"><div class="stagewrap" id="stagewrap"></div></div>`;

  const wrap=document.getElementById("stagewrap");
  if(!blocks.length){
    wrap.innerHTML='<div class="empty" style="padding:26px 0">這個詞條還沒有內容。按分頁列的「＋」加入第一塊。</div>';
  }else if(onePage){
    blocks.forEach((b,i)=>wrap.appendChild(blockEl(b,i,label(b,i),"one")));
  }else{
    wrap.appendChild(blockEl(blocks[curTab],curTab,label(blocks[curTab],curTab),"solo"));
  }
  wrap.querySelectorAll("[data-mountcanvas]").forEach(el=>{
    const b=blocks[+el.dataset.mountcanvas];mountCanvas(el,b,!!edit[b.id]);
  });
}

function blockEl(b,idx,label,layout){
  const d=document.createElement("section");
  d.className="block "+layout;
  d.dataset.bi=idx;d.dataset.bid=b.id;
  const editing=!!edit[b.id];
  let body="";
  if(editing){
    if(b.type==="text"){
      body=`<div class="wystools">
          <button class="btn" data-wys="h3">標題</button>
          <button class="btn" data-wys="bold"><b>粗體</b></button>
          <button class="btn bare" data-wys="plain">清除格式</button>
        </div>
        <div class="wys" contenteditable="true" data-wysbody>${mdToHtml(b.src)}</div>
        <div class="syntax">選取文字後按上面的按鈕。只有標題和粗體兩種格式。</div>`;
    }else if(b.type==="flow"){
      body=renderFlowEditor(b);
    }else if(b.type==="image"){
      body=imageEditor(b,idx);
    }else if(b.type==="keywords"){
      body=`<textarea class="src" data-src style="min-height:100px" placeholder="用逗號或換行分隔">${esc(b.src||"")}</textarea>
        <div class="syntax">只影響搜尋。中英文、縮寫、口語說法都放進來。</div>`;
    }else{
      const ph={table:"欄1,欄2\n值1,值2",
        calc:"check x: 項目 = 1\n= SUM\nlabel 分數\nband 0-1: 低風險"}[b.type]||"";
      const help={table:"CSV，第一列當表頭；含逗號的欄位用雙引號包住",
        calc:"number／check／select 定義欄位；= 公式（SUM 為總分）；label 結果名；dec 小數位；band 下限-上限: 判讀"}[b.type]||"";
      body=`<textarea class="src" data-src placeholder="${esc(ph)}">${esc(b.src||"")}</textarea>
        <div class="syntax">${esc(help)}</div>
        ${b.type==="table"?'<div class="row" style="margin-top:8px"><button class="btn" data-loadcsv>讀入 CSV 檔</button><button class="btn" data-toggleheader>'+(b.header===false?"第一列當資料":"第一列當表頭")+'</button></div>':""}`;
    }
  }else{
    if(b.type==="text")body='<div class="rt">'+renderText(b.src)+"</div>";
    else if(b.type==="table")body=renderTable(b.src,b.header);
    else if(b.type==="keywords")body=(String(b.src||"").split(/[,、\n]/).map(s=>s.trim()).filter(Boolean).length
      ?'<div class="kw">'+String(b.src).split(/[,、\n]/).map(s=>s.trim()).filter(Boolean)
        .map(s=>"<span>"+esc(s)+"</span>").join("")+"</div>"
      :'<p style="color:var(--ink-3)">（尚無關鍵字）</p>');
    else if(b.type==="calc")body=renderCalc(b);
    else if(b.type==="image")body=imageView(b,idx);
    else if(b.type==="flow"){
      const mode=(flowState[b.id]&&flowState[b.id].mode)||b.mode||"page";
      body=`<div class="flowbar">
          <button class="btn ${mode==="page"?"on":""}" data-fmode="page">整張圖</button>
          <button class="btn ${mode==="step"?"on":""}" data-fmode="step">逐步問答</button>
        </div>`+(mode==="step"?renderFlowStep(b):renderFlowSvg(b.src));
    }
  }
  const dsc=(b.type==="table"||b.type==="image"||b.type==="calc")&&(editing||(b.desc||"").trim())
    ? `<div class="bdesc" contenteditable="plaintext-only" data-field="desc" data-ph="說明（選填）">${esc(b.desc||"")}</div>`:"";
  const showTitle=layout==="one"||editing||(b.title||"").trim();
  d.innerHTML=`<div class="bhead">
      <span class="bmark"><i>${KINDS[b.type].icon}</i>${idx+1}</span>
      ${showTitle?`<span class="btitle" contenteditable="plaintext-only" data-field="title" data-ph="${esc(label)}">${esc(b.title||"")}</span>`:'<span style="flex:1"></span>'}
      <span class="bacts">
        <button class="btn ${editing?"on":"bare"}" data-edit>${editing?"完成":"編輯"}</button>
        <button class="btn bare" data-more title="更多">⋯</button>
      </span></div>
    ${tools[b.id]?`<div class="row" style="margin:-4px 0 12px">
      <button class="btn bare" data-move="-1">◀ 前移</button>
      <button class="btn bare" data-move="1">後移 ▶</button>
      <button class="btn bare danger" data-del>刪除分頁</button></div>`:""}
    <div class="bbody">${dsc}${body}</div>`;
  return d;
}
function imageView(b,idx){
  if(!b.src&&!(b.strokes||[]).length)
    return '<p style="color:var(--ink-3)">（尚無圖片，點「編輯」上傳或直接塗鴉）</p>';
  return `<div class="canvaswrap" data-mountcanvas="${idx}" style="${b.src?"":"aspect-ratio:4/3"}">
    ${b.src?`<img src="${esc(b.src)}" alt="${esc(b.title||"圖片")}">`:""}<canvas></canvas></div>`;
}
function imageEditor(b,idx){
  const cols=["#c8372c","#2f5470","#2c6a58","#a8760f","#171c1a","#ffffff"];
  return `<div class="drawtools">
      <button class="btn" data-loadimg>${b.src?"換圖":"上傳圖片"}</button>
      ${b.src?'<button class="btn" data-clearimg>移除圖片</button>':""}
      <button class="btn on" data-tool="pen">畫筆</button><button class="btn" data-tool="erase">擦筆畫</button>
      ${cols.map((c,i)=>`<button class="swatch ${i===0?"on":""}" data-color="${c}" style="background:${c}" aria-label="顏色"></button>`).join("")}
      <input type="range" data-width min="1" max="14" value="4" style="width:80px" title="筆寬">
      <button class="btn bare" data-undo>復原</button>
      <button class="btn bare" data-clearink>清除筆畫</button>
    </div>
    <div class="canvaswrap" data-mountcanvas="${idx}" style="${b.src?"":"aspect-ratio:4/3"}">
      ${b.src?`<img src="${esc(b.src)}" alt="">`:""}<canvas></canvas></div>`;
}

/* ============================ 開啟／新增 ============================ */
function rerender(){renderList();renderMain();}
function openItem(id,tab){
  cur=id;onePage=false;curTab=(tab!==undefined&&tab>=0)?tab:0;
  edit={};tools={};metaOpen=false;setView("item");rerender();
}
function newItem(){
  const it={id:uid(),title:"未命名詞條",subtitle:"",tags:[],blocks:[]};
  db.items.push(it);save();openItem(it.id);
  const h=document.querySelector(".ttl");
  if(h){h.focus();const s=document.getSelection();s&&s.selectAllChildren&&s.selectAllChildren(h);}
}
function addBlock(kind){
  const it=itemById(cur);if(!it)return;
  const blk={id:uid(),type:kind,title:"",src:""};
  if(kind==="flow"){blk.mode="page";blk.src="Q n1: 第一個問題？";}
  if(kind==="image")blk.strokes=[];
  if(kind==="calc")blk.src="check a: 項目一 = 1\ncheck b: 項目二 = 1\n= SUM\nlabel 分數\nband 0-1: 低\nband 2-9: 高";
  it.blocks.push(blk);edit[blk.id]=true;curTab=it.blocks.length-1;onePage=false;
  save();rerender();
}

/* ============================ 事件：統一委派 ============================ */
document.addEventListener("click",e=>{
  const t=e.target;
  const hit=sel=>t.closest(sel);

  if(hit("[data-close]")){const dl=t.closest("dialog");dl&&dl.close();return;}
  if(hit("#newItem")){newItem();$("#dlgPick").showModal();return;}
  if(hit("#importBtn")){$("#importMsg").textContent="";$("#dlgImport").showModal();return;}
  if(hit("#exportBtn")){exportAll();return;}
  if(hit("#guideBtn")){$("#dlgGuide").showModal();return;}
  if(hit("#pickJson")){$("#fileJson").click();return;}
  if(hit("#doImport")){doImport();return;}
  if(hit("#copySpec")){copySpec();return;}
  if(hit("#loadSample")){loadSample();return;}

  const open=hit("[data-open]");
  if(open){openItem(open.dataset.open,+open.dataset.tab);return;}

  const kind=hit("[data-kind]");
  if(kind){$("#dlgPick").close();addBlock(kind.dataset.kind);return;}

  const it=itemById(cur);if(!it)return;

  if(hit("[data-golist]")){setView("list");renderList();return;}
  if(hit("[data-meta]")){metaOpen=!metaOpen;renderMain();return;}
  if(hit("[data-flip]")){onePage=!onePage;renderMain();return;}
  if(hit("[data-addblock]")){$("#dlgPick").showModal();return;}
  const tb=hit(".tab");
  if(tb){onePage=false;curTab=+tb.dataset.tab;renderMain();return;}
  if(hit("[data-tags]")){
    const v=prompt("標籤（逗號分隔）",(it.tags||[]).join(", "));
    if(v!==null){it.tags=v.split(/[,、]/).map(s=>s.trim()).filter(Boolean);save();rerender();}
    return;}
  if(hit("[data-exportitem]")){
    download(it.title+".json",JSON.stringify({format:"clinical-kb",version:1,items:[strip(it)]},null,1));return;}
  if(hit("[data-delitem]")){
    if(confirm(`刪除「${it.title}」？無法復原。`)){
      db.items=db.items.filter(x=>x.id!==it.id);cur=null;save();setView("list");rerender();}
    return;}

  const sec=t.closest(".block");if(!sec)return;
  const bi=+sec.dataset.bi, blk=it.blocks[bi];if(!blk)return;

  if(hit("[data-edit]")){
    if(edit[blk.id]&&blk.type==="flow")delete flowCache[blk.id];
    edit[blk.id]=!edit[blk.id];renderMain();return;}
  if(hit("[data-more]")){tools[blk.id]=!tools[blk.id];renderMain();return;}
  if(hit("[data-del]")){
    if(confirm("刪除這個分頁？")){it.blocks.splice(bi,1);save();
      if(curTab>=it.blocks.length)curTab=Math.max(0,it.blocks.length-1);rerender();}
    return;}
  const mv=hit("[data-move]");
  if(mv){const to=bi+ +mv.dataset.move;
    if(to>=0&&to<it.blocks.length){it.blocks.splice(to,0,it.blocks.splice(bi,1)[0]);
      if(!onePage)curTab=to;save();renderMain();}
    return;}

  /* --- 流程圖：檢視 --- */
  const fm=hit("[data-fmode]");
  if(fm){flowState[blk.id]=flowState[blk.id]||{path:[],at:parseFlow(blk.src).start};
    flowState[blk.id].mode=fm.dataset.fmode;blk.mode=fm.dataset.fmode;save();renderMain();return;}
  const go=hit("[data-go]");
  if(go){const st=flowState[blk.id];st.path.push({nodeId:st.at,label:go.dataset.lab});
    st.at=go.dataset.go;renderMain();return;}
  if(hit("[data-restart]")){const st=flowState[blk.id];st.path=[];st.at=parseFlow(blk.src).start;renderMain();return;}
  if(hit("[data-back]")){const st=flowState[blk.id];const p=st.path.pop();if(p)st.at=p.nodeId;renderMain();return;}

  /* --- 流程圖：編輯 --- */
  const raw=hit("[data-raw]");
  if(raw){flowRaw[blk.id]=raw.dataset.raw==="1";delete flowCache[blk.id];renderMain();return;}
  const fadd=hit("[data-fadd]");
  if(fadd){const ns=fnodes(blk);
    ns.push({id:nextFid(ns),type:fadd.dataset.fadd,text:"",out:[],notes:[]});
    commitFlow(blk,true);return;}
  const card=t.closest(".fnodecard");
  if(card){
    const ns=fnodes(blk), ni=ns.findIndex(n=>n.id===card.dataset.nid), n=ns[ni];
    if(n){
      const ft=hit("[data-ftype]");
      if(ft){n.type=ft.dataset.ftype;commitFlow(blk,true);return;}
      if(hit("[data-fdel]")){
        ns.splice(ni,1);ns.forEach(x=>x.out=(x.out||[]).filter(e=>e.to!==n.id));
        commitFlow(blk,true);return;}
      if(hit("[data-fup]")&&ni>0){ns.splice(ni-1,0,ns.splice(ni,1)[0]);commitFlow(blk,true);return;}
      if(hit("[data-fdown]")&&ni<ns.length-1){ns.splice(ni+1,0,ns.splice(ni,1)[0]);commitFlow(blk,true);return;}
      if(hit("[data-oadd]")){n.out=n.out||[];n.out.push({label:"",to:""});commitFlow(blk,true);return;}
      const od=hit("[data-odel]");
      if(od){n.out.splice(+od.closest(".outrow").dataset.oi,1);commitFlow(blk,true);return;}
    }
  }

  /* --- 其他區塊 --- */
  if(hit("[data-calcreset]")){blk.state={};save();renderMain();return;}
  if(hit("[data-toggleheader]")){blk.header=blk.header===false?true:false;save();renderMain();return;}
  if(hit("[data-loadcsv]")){pendingCsv=blk;$("#fileCsv").click();return;}
  if(hit("[data-loadimg]")){pendingImg=blk;$("#fileImg").click();return;}
  if(hit("[data-clearimg]")){blk.src="";save();renderMain();return;}
  if(hit("[data-undo]")){(blk.strokes||[]).pop();save();renderMain();return;}
  if(hit("[data-clearink]")){blk.strokes=[];save();renderMain();return;}
  const sw=hit(".swatch");
  if(sw){sec.querySelectorAll(".swatch").forEach(x=>x.classList.remove("on"));sw.classList.add("on");return;}
  const tl=hit("[data-tool]");
  if(tl){sec.querySelectorAll("[data-tool]").forEach(x=>x.classList.remove("on"));tl.classList.add("on");return;}
});

/* 文字工具列：保住選取範圍 */
document.addEventListener("mousedown",e=>{if(e.target.closest("[data-wys]"))e.preventDefault();});
document.addEventListener("touchstart",e=>{if(e.target.closest("[data-wys]"))e.preventDefault();},{passive:false});
document.addEventListener("click",e=>{
  const w=e.target.closest("[data-wys]");if(!w)return;
  const sec=w.closest(".block");const body=sec.querySelector("[data-wysbody]");
  if(!body)return;
  body.focus();
  const cmd=w.dataset.wys;
  try{
    if(cmd==="bold")document.execCommand("bold");
    else if(cmd==="h3"){
      const blockName=document.queryCommandValue?document.queryCommandValue("formatBlock"):"";
      document.execCommand("formatBlock",false,/h3/i.test(blockName)?"div":"h3");
    }else{document.execCommand("formatBlock",false,"div");document.execCommand("removeFormat");}
  }catch(err){}
  const it=itemById(cur);if(!it)return;
  const blk=it.blocks[+sec.dataset.bi];blk.src=htmlToMd(body);save();
});

/* 輸入 */
document.addEventListener("input",e=>{
  const t=e.target;
  if(t.id==="q"){query=t.value;listSel=-1;renderList();return;}
  const it=itemById(cur);if(!it)return;
  const sec=t.closest(".block");if(!sec)return;
  const blk=it.blocks[+sec.dataset.bi];if(!blk)return;

  if(t.matches("[data-wysbody]")){blk.src=htmlToMd(t);save();return;}
  if(t.matches("[data-src]")){blk.src=t.value;
    if(blk.type==="flow"){delete flowCache[blk.id];flowState[blk.id]=null;}
    save();renderList();return;}
  if(t.matches("[data-ftext],[data-fnote],[data-flabel],[data-fto]")){
    const card=t.closest(".fnodecard");
    const ns=fnodes(blk), n=ns.find(x=>x.id===card.dataset.nid);if(!n)return;
    if(t.matches("[data-ftext]"))n.text=t.value;
    else if(t.matches("[data-fnote]"))n.notes=t.value.split(/[；;]/).map(s=>s.trim()).filter(Boolean);
    else{const row=t.closest(".outrow"), e2=n.out[+row.dataset.oi];
      if(t.matches("[data-flabel]"))e2.label=t.value; else e2.to=t.value;}
    commitFlow(blk,false);return;
  }
  const cid=t.dataset.cid;
  if(cid){
    blk.state=blk.state||{};blk.state[cid]=t.type==="checkbox"?t.checked:t.value;
    const box=t.closest(".calc").querySelector(".result");
    const {c,raw}=calcValues(blk);
    const band=c.bands.find(b=>raw>=b.min&&raw<=b.max);
    box.innerHTML=`<div class="val">${isNaN(raw)?"—":raw.toFixed(c.dec)}</div>
      <div class="note">${esc(c.label)}</div>`+(band?`<div class="band">${inlineMd(band.text)}</div>`:"");
    save();
  }
});
document.addEventListener("change",e=>{
  if(e.target.matches("[data-fto]"))e.target.dispatchEvent(new Event("input",{bubbles:true}));
});
document.addEventListener("blur",e=>{
  const t=e.target;if(!t.dataset||!t.dataset.field)return;
  const it=itemById(cur);if(!it)return;
  const v=t.textContent.trim();const sec=t.closest(".block");
  if(sec){const blk=it.blocks[+sec.dataset.bi];if(blk)blk[t.dataset.field]=v;}
  else{it[t.dataset.field]=v||(t.dataset.field==="title"?"未命名詞條":"");}
  save();renderList();
},true);

/* 鍵盤 */
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){
    e.preventDefault();setView("list");const q=$("#q");q.focus();q.select();return;}
  if(e.target===$("#q")){
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){
      e.preventDefault();
      listSel=Math.max(0,Math.min(shown.length-1,listSel+(e.key==="ArrowDown"?1:-1)));
      const els=[...document.querySelectorAll(".entry")];
      els.forEach((el,i)=>el.classList.toggle("on",i===listSel));
      els[listSel]&&els[listSel].scrollIntoView({block:"nearest"});return;}
    if(e.key==="Enter"&&shown.length){
      const pick=shown[Math.max(0,listSel)];openItem(pick.it.id,pick.hitTab);return;}
  }
  const step=document.querySelector(".step");
  if(step&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)
     &&!document.activeElement.isContentEditable){
    const n=+e.key;
    if(n>=1&&n<=9){const btns=step.querySelectorAll(".opt");if(btns[n-1]){btns[n-1].click();e.preventDefault();}}
  }
});

/* ============================ 指南／匯入匯出 ============================ */
function copySpec(){
  navigator.clipboard?navigator.clipboard.writeText($("#specBox").textContent)
    .then(()=>toast("規格已複製，貼給 AI 即可"),()=>toast("複製失敗，請手動選取"))
    :toast("複製失敗，請手動選取");
}
function loadSample(){
  const data=JSON.parse(document.getElementById("sampleSrc").textContent);
  const n=merge(data);$("#dlgGuide").close();
  cur=db.items[db.items.length-1].id;openItem(cur);toast(`已載入示範詞條（${n} 筆）`);
}
function exportAll(){
  if(!db.items.length){toast("目前沒有資料可以匯出");return;}
  const d=new Date().toISOString().slice(0,10);
  download(`clinical-kb-${d}.json`,
    JSON.stringify({format:"clinical-kb",version:1,items:db.items.map(strip)},null,1));
}
function doImport(){
  const msg=$("#importMsg");
  try{
    const data=JSON.parse($("#importText").value);
    const n=merge(data);
    if(!n){msg.innerHTML='<span style="color:var(--warn)">找不到任何有 title 的詞條，請對照規格檢查。</span>';return;}
    $("#dlgImport").close();$("#importText").value="";
    cur=db.items[db.items.length-1].id;openItem(cur);toast(`匯入 ${n} 筆詞條`);
  }catch(err){msg.innerHTML='<span style="color:var(--warn)">JSON 解析失敗：'+esc(err.message)+"</span>";}
}
let pendingCsv=null,pendingImg=null;
$("#fileJson").addEventListener("change",e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();r.onload=()=>{$("#importText").value=r.result;doImport();};
  r.readAsText(f);e.target.value="";});
$("#fileCsv").addEventListener("change",e=>{
  const f=e.target.files[0];if(!f||!pendingCsv)return;
  const r=new FileReader();r.onload=()=>{pendingCsv.src=r.result;pendingCsv=null;save();rerender();};
  r.readAsText(f,"utf-8");e.target.value="";});
$("#fileImg").addEventListener("change",e=>{
  const f=e.target.files[0];if(!f||!pendingImg)return;
  const r=new FileReader();
  r.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      const max=1500, sc=Math.min(1,max/Math.max(img.width,img.height));
      const c=document.createElement("canvas");
      c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      pendingImg.src=c.toDataURL("image/jpeg",0.85);pendingImg=null;save();renderMain();
    };
    img.onerror=()=>{pendingImg.src=r.result;pendingImg=null;save();renderMain();};
    img.src=r.result;
  };
  r.readAsDataURL(f);e.target.value="";});

/* 啟動 */
$("#specBox").textContent=document.getElementById("specSrc").textContent.trim();
setView("list");rerender();

