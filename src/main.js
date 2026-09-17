"use strict";
import { uid, esc } from "./lib/util.js";
import { KINDS } from "./lib/kinds.js";
import { inlineMd, renderText, mdToHtml, htmlToMd } from "./lib/markdown.js";
import { renderTable } from "./lib/csv.js";
import { parseFlow, serializeFlow, nextFid } from "./lib/flow-parse.js";
import { renderFlowSvg } from "./lib/flow-svg.js";
import { calcValues } from "./lib/calc.js";
import { score, hl } from "./lib/search.js";
import { strip, merge } from "./lib/data-io.js";

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

const $=s=>document.querySelector(s);
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),2600);}

/* ============================ 狀態 ============================ */
const FTYPE={Q:"問題",A:"處置",R:"結論",N:"註記"};
let cur=null, curTab=0, onePage=false, query="", listSel=-1;
let edit={}, tools={}, metaOpen=false, flowState={}, flowCache={}, flowRaw={};
const itemById=id=>db.items.find(i=>i.id===id);
function setView(v){document.body.dataset.view=v;}
const viewIs=v=>document.body.dataset.view===v;

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

function download(name,text){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));
  a.download=name.replace(/[\\/:*?"<>|]/g,"_");a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
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
  const n=merge(data,db,save,renderList);$("#dlgGuide").close();
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
    const n=merge(data,db,save,renderList);
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

