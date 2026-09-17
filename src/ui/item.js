import { esc } from "../lib/util.js";
import { KINDS } from "../lib/kinds.js";
import { inlineMd, renderText, mdToHtml } from "../lib/markdown.js";
import { renderTable } from "../lib/csv.js";
import { parseFlow } from "../lib/flow-parse.js";
import { renderFlowSvg } from "../lib/flow-svg.js";
import { calcValues } from "../lib/calc.js";
import { itemById, state } from "../store.js";
import { renderFlowEditor } from "./flow-editor.js";
import { mountCanvas } from "./canvas.js";

/* 逐步模式 */
function renderFlowStep(blk) {
  const f = parseFlow(blk.src);
  if (!f.nodes.length) return '<p style="color:var(--ink-3)">（尚無流程）</p>';
  const st = (state.flowState[blk.id] = state.flowState[blk.id] || { path: [], at: f.start });
  if (!f.map[st.at]) st.at = f.start;
  const n = f.map[st.at];
  const TY = { Q: ["q", "問題"], A: ["a", "處置"], R: ["r", "結論"], N: ["n", "註記"] }[n.type] || ["n", "節點"];
  let trail = "";
  if (st.path.length) {
    trail =
      '<div class="trail">' +
      st.path
        .map((p, i) => {
          const pn = f.map[p.nodeId];
          return `<div class="trailrow"><span>${i + 1}.</span><span>${esc(pn ? pn.text : p.nodeId)}</span>${p.label ? `<b>→ ${esc(p.label)}</b>` : ""}</div>`;
        })
        .join("") +
      "</div>";
  }
  let opts;
  if (n.out.length) {
    opts =
      '<div class="opts">' +
      n.out
        .map(
          (e, i) =>
            `<button class="opt" data-go="${esc(e.to)}" data-lab="${esc(e.label)}"><span class="k">${i + 1}</span><span>${esc(e.label || "繼續")}</span><span class="ar">›</span></button>`,
        )
        .join("") +
      "</div>";
  } else {
    opts = '<div class="opts"><button class="opt" data-restart="1"><span>回到開頭</span></button></div>';
  }
  const notes = n.notes.length
    ? '<div class="stepdetail"><ul>' + n.notes.map((x) => "<li>" + inlineMd(x) + "</li>").join("") + "</ul></div>"
    : "";
  return `<div class="step" data-step="${blk.id}">${trail}
    <div class="stepcard ${TY[0]}"><div class="steplab">${TY[1]}</div>
      <div class="stepq">${inlineMd(n.text)}</div>${notes}${opts}</div>
    <div class="stepnav">
      <button class="btn" data-back="1" ${st.path.length ? "" : "disabled"}>上一步</button>
      <button class="btn" data-restart="1">重新開始</button>
    </div></div>`;
}

function renderCalc(blk) {
  const { c, raw } = calcValues(blk);
  const st = (blk.state = blk.state || {});
  if (!c.fields.length) return '<p style="color:var(--ink-3)">（尚無欄位，點「編輯」定義量表）</p>';
  let rows = "";
  c.fields.forEach((f) => {
    if (f.kind === "check") {
      rows += `<div class="chkrow"><input type="checkbox" id="c_${blk.id}_${f.id}" data-cid="${f.id}" ${st[f.id] ? "checked" : ""}>
        <label for="c_${blk.id}_${f.id}">${esc(f.label)}</label><span class="w">+${f.w}</span></div>`;
    } else if (f.kind === "select") {
      rows +=
        `<label for="s_${blk.id}_${f.id}">${esc(f.label)}</label><select id="s_${blk.id}_${f.id}" data-cid="${f.id}">` +
        f.opts.map((o) => `<option value="${o.value}" ${+st[f.id] === o.value ? "selected" : ""}>${esc(o.label)}</option>`).join("") +
        "</select>";
    } else {
      rows += `<label for="n_${blk.id}_${f.id}">${esc(f.label)}${f.unit ? ` <span class="u">${esc(f.unit)}</span>` : ""}</label>
        <input type="number" step="any" id="n_${blk.id}_${f.id}" data-cid="${f.id}" value="${st[f.id] !== undefined ? esc(st[f.id]) : f.def === "" ? "" : f.def}">`;
    }
  });
  const val = isNaN(raw) ? "—" : raw.toFixed(c.dec);
  const band = c.bands.find((b) => raw >= b.min && raw <= b.max);
  return `<div class="calc" data-calc="${blk.id}"><div class="calcgrid">${rows}</div>
    <div class="result"><div class="val">${esc(val)}</div>
      <div class="note">${esc(c.label)}</div>
      ${band ? `<div class="band">${inlineMd(band.text)}</div>` : ""}</div>
    <div style="margin-top:9px"><button class="btn" data-calcreset="1">清除輸入</button></div></div>`;
}

/* ============================ 詞條主畫面 ============================ */
export function renderMain() {
  const host = document.getElementById("mainInner");
  const it = itemById(state.cur);
  if (!it) {
    host.innerHTML = `<div style="padding:40px 20px;max-width:470px">
      <h2 style="font-size:17px;margin-bottom:7px">選一個詞條</h2>
      <p style="color:var(--ink-3);font-size:14px">每個詞條可放多個分頁：文字、機制／流程圖、表格、圖片畫記、關鍵字、量表計算機。流程圖能整張看，也能一題一題走。</p></div>`;
    return;
  }
  const blocks = (it.blocks = it.blocks || []);
  if (state.curTab >= blocks.length) state.curTab = Math.max(0, blocks.length - 1);
  const label = (b, i) => (b.title && b.title.trim() ? b.title.trim() : KINDS[b.type].name + " " + (i + 1));
  const tabs = blocks
    .map((b, i) => {
      const on = !state.onePage && i === state.curTab;
      return `<button class="tab ${on ? "on" : ""}" data-tab="${i}" title="${esc(label(b, i))}">
      <span class="g">${KINDS[b.type].icon}</span><span class="${on ? "nm" : ""}">${
        on && b.title && b.title.trim() ? esc(b.title.trim()) : i + 1
      }</span></button>`;
    })
    .join("");
  const showMeta = state.metaOpen || !!(it.subtitle || "").trim() || (it.tags || []).length;

  host.innerHTML = `
    <div class="bar">
      <button class="ib big back" data-golist aria-label="回索引">‹</button>
      <div class="ttl" contenteditable="plaintext-only" data-field="title">${esc(it.title)}</div>
      <button class="ib" data-meta title="說明與標籤">⋯</button>
    </div>
    <div class="meta" ${showMeta ? "" : "hidden"}>
      <span class="sub" contenteditable="plaintext-only" data-field="subtitle" data-ph="一行說明">${esc(it.subtitle || "")}</span>
      ${(it.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
      <button class="btn bare" data-tags>標籤</button>
      <button class="btn bare" data-exportitem>匯出</button>
      <button class="btn bare danger" data-delitem>刪除詞條</button>
    </div>
    <div class="tabbar">${tabs}
      <button class="tabadd" data-addblock title="新增分頁">＋</button>
      ${blocks.length > 1 ? `<button class="flip ${state.onePage ? "on" : ""}" data-flip>${state.onePage ? "分頁" : "串成一頁"}</button>` : ""}
    </div>
    <div id="stage"><div class="stagewrap" id="stagewrap"></div></div>`;

  const wrap = document.getElementById("stagewrap");
  if (!blocks.length) {
    wrap.innerHTML = '<div class="empty" style="padding:26px 0">這個詞條還沒有內容。按分頁列的「＋」加入第一塊。</div>';
  } else if (state.onePage) {
    blocks.forEach((b, i) => wrap.appendChild(blockEl(b, i, label(b, i), "one")));
  } else {
    wrap.appendChild(blockEl(blocks[state.curTab], state.curTab, label(blocks[state.curTab], state.curTab), "solo"));
  }
  wrap.querySelectorAll("[data-mountcanvas]").forEach((el) => {
    const b = blocks[+el.dataset.mountcanvas];
    mountCanvas(el, b, !!state.edit[b.id]);
  });
}

function blockEl(b, idx, label, layout) {
  const d = document.createElement("section");
  d.className = "block " + layout;
  d.dataset.bi = idx;
  d.dataset.bid = b.id;
  const editing = !!state.edit[b.id];
  let body = "";
  if (editing) {
    if (b.type === "text") {
      body = `<div class="wystools">
          <button class="btn" data-wys="h3">標題</button>
          <button class="btn" data-wys="bold"><b>粗體</b></button>
          <button class="btn bare" data-wys="plain">清除格式</button>
        </div>
        <div class="wys" contenteditable="true" data-wysbody>${mdToHtml(b.src)}</div>
        <div class="syntax">選取文字後按上面的按鈕。只有標題和粗體兩種格式。</div>`;
    } else if (b.type === "flow") {
      body = renderFlowEditor(b);
    } else if (b.type === "image") {
      body = imageEditor(b, idx);
    } else if (b.type === "keywords") {
      body = `<textarea class="src" data-src style="min-height:100px" placeholder="用逗號或換行分隔">${esc(b.src || "")}</textarea>
        <div class="syntax">只影響搜尋。中英文、縮寫、口語說法都放進來。</div>`;
    } else {
      const ph = { table: "欄1,欄2\n值1,值2", calc: "check x: 項目 = 1\n= SUM\nlabel 分數\nband 0-1: 低風險" }[b.type] || "";
      const help =
        {
          table: "CSV，第一列當表頭；含逗號的欄位用雙引號包住",
          calc: "number／check／select 定義欄位；= 公式（SUM 為總分）；label 結果名；dec 小數位；band 下限-上限: 判讀",
        }[b.type] || "";
      body = `<textarea class="src" data-src placeholder="${esc(ph)}">${esc(b.src || "")}</textarea>
        <div class="syntax">${esc(help)}</div>
        ${b.type === "table" ? '<div class="row" style="margin-top:8px"><button class="btn" data-loadcsv>讀入 CSV 檔</button><button class="btn" data-toggleheader>' + (b.header === false ? "第一列當資料" : "第一列當表頭") + "</button></div>" : ""}`;
    }
  } else {
    if (b.type === "text") body = '<div class="rt">' + renderText(b.src) + "</div>";
    else if (b.type === "table") body = renderTable(b.src, b.header);
    else if (b.type === "keywords")
      body = String(b.src || "")
        .split(/[,、\n]/)
        .map((s) => s.trim())
        .filter(Boolean).length
        ? '<div class="kw">' +
          String(b.src)
            .split(/[,、\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => "<span>" + esc(s) + "</span>")
            .join("") +
          "</div>"
        : '<p style="color:var(--ink-3)">（尚無關鍵字）</p>';
    else if (b.type === "calc") body = renderCalc(b);
    else if (b.type === "image") body = imageView(b, idx);
    else if (b.type === "flow") {
      const mode = (state.flowState[b.id] && state.flowState[b.id].mode) || b.mode || "page";
      body =
        `<div class="flowbar">
          <button class="btn ${mode === "page" ? "on" : ""}" data-fmode="page">整張圖</button>
          <button class="btn ${mode === "step" ? "on" : ""}" data-fmode="step">逐步問答</button>
        </div>` + (mode === "step" ? renderFlowStep(b) : renderFlowSvg(b.src));
    }
  }
  const dsc =
    (b.type === "table" || b.type === "image" || b.type === "calc") && (editing || (b.desc || "").trim())
      ? `<div class="bdesc" contenteditable="plaintext-only" data-field="desc" data-ph="說明（選填）">${esc(b.desc || "")}</div>`
      : "";
  const showTitle = layout === "one" || editing || (b.title || "").trim();
  d.innerHTML = `<div class="bhead">
      <span class="bmark"><i>${KINDS[b.type].icon}</i>${idx + 1}</span>
      ${showTitle ? `<span class="btitle" contenteditable="plaintext-only" data-field="title" data-ph="${esc(label)}">${esc(b.title || "")}</span>` : '<span style="flex:1"></span>'}
      <span class="bacts">
        <button class="btn ${editing ? "on" : "bare"}" data-edit>${editing ? "完成" : "編輯"}</button>
        <button class="btn bare" data-more title="更多">⋯</button>
      </span></div>
    ${
      state.tools[b.id]
        ? `<div class="row" style="margin:-4px 0 12px">
      <button class="btn bare" data-move="-1">◀ 前移</button>
      <button class="btn bare" data-move="1">後移 ▶</button>
      <button class="btn bare danger" data-del>刪除分頁</button></div>`
        : ""
    }
    <div class="bbody">${dsc}${body}</div>`;
  return d;
}
function imageView(b, idx) {
  if (!b.src && !(b.strokes || []).length) return '<p style="color:var(--ink-3)">（尚無圖片，點「編輯」上傳或直接塗鴉）</p>';
  return `<div class="canvaswrap" data-mountcanvas="${idx}" style="${b.src ? "" : "aspect-ratio:4/3"}">
    ${b.src ? `<img src="${esc(b.src)}" alt="${esc(b.title || "圖片")}">` : ""}<canvas></canvas></div>`;
}
function imageEditor(b, idx) {
  const cols = ["#c8372c", "#2f5470", "#2c6a58", "#a8760f", "#171c1a", "#ffffff"];
  return `<div class="drawtools">
      <button class="btn" data-loadimg>${b.src ? "換圖" : "上傳圖片"}</button>
      ${b.src ? '<button class="btn" data-clearimg>移除圖片</button>' : ""}
      <button class="btn on" data-tool="pen">畫筆</button><button class="btn" data-tool="erase">擦筆畫</button>
      ${cols.map((c, i) => `<button class="swatch ${i === 0 ? "on" : ""}" data-color="${c}" style="background:${c}" aria-label="顏色"></button>`).join("")}
      <input type="range" data-width min="1" max="14" value="4" style="width:80px" title="筆寬">
      <button class="btn bare" data-undo>復原</button>
      <button class="btn bare" data-clearink>清除筆畫</button>
    </div>
    <div class="canvaswrap" data-mountcanvas="${idx}" style="${b.src ? "" : "aspect-ratio:4/3"}">
      ${b.src ? `<img src="${esc(b.src)}" alt="">` : ""}<canvas></canvas></div>`;
}
