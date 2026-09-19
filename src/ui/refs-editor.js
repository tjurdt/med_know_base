import { esc } from "../lib/util.js";
import { parseRefs, serializeRefs } from "../lib/refs.js";
import { icons } from "../lib/icons.js";
import { KINDS } from "../lib/kinds.js";
import { state, save } from "../store.js";
import { renderList } from "./list.js";
import { renderMain } from "./item.js";

// 懶惰解析＋快取＋重新序列化回 blk.src，比照 table-editor.js/calc-editor.js 的
// 既有模式。見 plan Stage 7c。
export function refsList(blk) {
  if (!state.refsCache[blk.id]) {
    const list = parseRefs(blk.src);
    state.refsCache[blk.id] = list.length ? list : [{ url: "", label: "" }];
  }
  return state.refsCache[blk.id];
}
export function commitRefs(blk, structural) {
  blk.src = serializeRefs(refsList(blk));
  save();
  if (structural) renderMain();
  else renderList();
}

// 遍歷這個詞條所有「非 refs」分頁，攤平出各自的 cites，附上來自哪個分頁——參考
// 連結分頁彙總顯示用，不是這個分頁自己的資料。
function otherBlocksRefs(it) {
  const rows = [];
  (it.blocks || []).forEach((b, i) => {
    if (b.type === "refs") return;
    (b.cites || []).forEach((c) => {
      const blockLabel = b.title && b.title.trim() ? b.title.trim() : KINDS[b.type].name + " " + (i + 1);
      rows.push({ bi: i, blockLabel, url: c.url, label: c.label });
    });
  });
  return rows;
}

export function renderRefsEditor(blk, it) {
  const editing = !!state.edit[blk.id];
  const own = refsList(blk);
  const others = otherBlocksRefs(it || { blocks: [] });

  const ownBody = editing
    ? own
        .map(
          (r, i) => `<div class="outrow" data-ri="${i}">
        <input class="citeinput" data-refurl value="${esc(r.url)}" placeholder="網址" style="flex:2">
        <input class="citeinput" data-reflabel value="${esc(r.label)}" placeholder="說明（選填）" style="flex:1">
        <button class="x" data-refdel title="移除">✕</button>
      </div>`,
        )
        .join("") + `<div class="row" style="margin-top:8px"><button class="btn bare" data-refadd>＋ 新增連結</button></div>`
    : own.filter((r) => r.url).length
      ? `<div class="reflist">${own
          .filter((r) => r.url)
          .map((r) => `<a class="refitem" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${icons.link}${esc(r.label || r.url)}</a>`)
          .join("")}</div>`
      : '<p style="color:var(--ink-3)">（尚無這個詞條自己的連結）</p>';

  const otherBody = others.length
    ? `<div class="reflist">${others
        .map(
          (r) =>
            `<div class="refrow"><a class="refitem" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${icons.link}${esc(r.label || r.url)}</a><button class="btn bare" data-reftab="${r.bi}">來自「${esc(r.blockLabel)}」</button></div>`,
        )
        .join("")}</div>`
    : '<p style="color:var(--ink-3)">（其他分頁還沒有加來源連結）</p>';

  return `<div class="refhead">這個詞條自己的連結</div>${ownBody}
    <div class="refhead">其他分頁的來源</div>${otherBody}`;
}
