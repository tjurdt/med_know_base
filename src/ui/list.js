import { esc } from "../lib/util.js";
import { KINDS } from "../lib/kinds.js";
import { score, hl } from "../lib/search.js";
import { state } from "../store.js";

/* ============================ 側欄列表 ============================ */
export function renderList() {
  const box = document.getElementById("list");
  const qs = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let arr = state.db.items.map((it) => ({ it, ...(qs.length ? score(it, qs) : { s: 1 }) })).filter((x) => x.s > 0);
  if (qs.length) arr.sort((a, b) => b.s - a.s || a.it.title.localeCompare(b.it.title));
  else arr.sort((a, b) => a.it.title.localeCompare(b.it.title, "zh-Hant"));
  state.shown = arr;
  if (!state.db.items.length) {
    box.innerHTML = '<div class="empty">還沒有詞條。按右上「＋」開始，或用「AI 指南」把整理好的 JSON 貼進來。</div>';
    return;
  }
  if (!arr.length) {
    box.innerHTML = '<div class="empty">沒有符合「' + esc(state.query) + '」的詞條。</div>';
    return;
  }
  box.innerHTML = arr
    .map((x) => {
      const seen = [];
      (x.it.blocks || []).forEach((bl) => {
        if (!seen.includes(bl.type)) seen.push(bl.type);
      });
      return `<button class="entry ${x.it.id === state.cur ? "on" : ""}" data-open="${x.it.id}" data-tab="${x.hitTab ?? -1}">
      <div class="t">${qs.length ? hl(x.it.title, qs) : esc(x.it.title)}</div>
      <div class="s">${seen.map((k) => KINDS[k].icon).join(" ")}</div>
      ${x.hit ? `<div class="hit">${hl(x.hit, qs)}</div>` : ""}</button>`;
    })
    .join("");
}
