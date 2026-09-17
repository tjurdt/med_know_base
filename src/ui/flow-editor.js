import { esc } from "../lib/util.js";
import { parseFlow, serializeFlow } from "../lib/flow-parse.js";
import { state, save } from "../store.js";
import { renderList } from "./list.js";
import { renderMain } from "./item.js";

const FTYPE = { Q: "問題", A: "處置", R: "結論", N: "註記" };

export function fnodes(blk) {
  if (!state.flowCache[blk.id]) state.flowCache[blk.id] = parseFlow(blk.src).nodes;
  return state.flowCache[blk.id];
}
export function commitFlow(blk, structural) {
  blk.src = serializeFlow(fnodes(blk));
  state.flowState[blk.id] = null;
  save();
  if (structural) renderMain();
  else renderList();
}
export function nextFid(nodes) {
  let i = 1;
  const has = (id) => nodes.some((n) => n.id === id);
  while (has("n" + i)) i++;
  return "n" + i;
}
export function renderFlowEditor(blk) {
  const nodes = fnodes(blk);
  if (state.flowRaw[blk.id]) {
    return `<div class="row" style="margin-bottom:8px">
        <button class="btn" data-raw="0">圖形編輯</button><button class="btn on" data-raw="1">原始碼</button></div>
      <textarea class="src" data-src>${esc(blk.src || "")}</textarea>
      <div class="syntax">Q 問題／A 處置／R 結論／N 註記；縮排兩格寫「選項 -&gt; 目標id」或「* 補充」</div>`;
  }
  const opts = (id) =>
    `<option value="">（未指定）</option>` +
    nodes
      .map((n) => `<option value="${esc(n.id)}" ${n.id === id ? "selected" : ""}>${esc((n.text || n.id).slice(0, 16))}</option>`)
      .join("");
  const cards = nodes
    .map(
      (n, i) => `
    <div class="fnodecard ${n.type.toLowerCase()}" data-nid="${esc(n.id)}">
      <div class="top">
        <span class="id">${i === 0 ? "入口 " : ""}${esc(n.id)}</span>
        <div class="seg">${["Q", "A", "R", "N"].map((t) => `<button data-ftype="${t}" class="${n.type === t ? "on" : ""}">${FTYPE[t]}</button>`).join("")}</div>
        <span style="flex:1"></span>
        <button class="ib" data-fup title="上移">↑</button>
        <button class="ib" data-fdown title="下移">↓</button>
        <button class="ib" data-fdel title="刪除節點">✕</button>
      </div>
      <input class="tx" data-ftext value="${esc(n.text || "")}" placeholder="節點文字">
      <input class="notein" data-fnote value="${esc((n.notes || []).join("；"))}" placeholder="補充小字（選填）">
      ${(n.out || [])
        .map(
          (e, j) => `<div class="outrow" data-oi="${j}">
          <input data-flabel value="${esc(e.label || "")}" placeholder="${n.type === "Q" ? "選項文字" : "（無條件）"}">
          <select data-fto>${opts(e.to)}</select>
          <button class="x" data-odel title="移除出口">✕</button>
        </div>`,
        )
        .join("")}
      <div class="foot"><button class="btn bare" data-oadd>＋ 出口</button></div>
    </div>`,
    )
    .join("");
  return `<div class="row" style="margin-bottom:8px">
      <button class="btn on" data-raw="0">圖形編輯</button><button class="btn" data-raw="1">原始碼</button></div>
    <div class="fe">${cards}
      <div class="row">${["Q", "A", "R", "N"].map((t) => `<button class="btn" data-fadd="${t}">＋ ${FTYPE[t]}</button>`).join("")}</div>
    </div>`;
}
