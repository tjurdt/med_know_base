import { esc } from "../lib/util.js";
import { parseCalc, serializeCalc } from "../lib/calc.js";
import { state, save } from "../store.js";
import { renderList } from "./list.js";
import { renderMain } from "./item.js";

const KIND_LABEL = { number: "數字", check: "勾選", select: "選單" };

export function calcFields(blk) {
  if (!state.calcCache[blk.id]) state.calcCache[blk.id] = parseCalc(blk.src);
  return state.calcCache[blk.id];
}
export function commitCalcFields(blk, structural) {
  blk.src = serializeCalc(calcFields(blk));
  save();
  if (structural) renderMain();
  else renderList();
}
export function nextFieldId(fields) {
  let i = 1;
  const has = (id) => fields.some((f) => f.id === id);
  while (has("f" + i)) i++;
  return "f" + i;
}

function fieldCard(f, i) {
  const extra =
    f.kind === "number"
      ? `<div class="row">
        <input data-cfunit value="${esc(f.unit || "")}" placeholder="單位（選填）" style="flex:1">
        <input type="number" step="any" data-cfdef value="${f.def === "" ? "" : esc(f.def)}" placeholder="預設值" style="flex:1">
      </div>`
      : f.kind === "check"
        ? `<input type="number" step="any" data-cfweight value="${esc(f.w ?? 1)}" placeholder="配分" style="max-width:110px">`
        : `${(f.opts || [])
            .map(
              (o, j) => `<div class="outrow" data-oi="${j}">
          <input data-cfoptlabel value="${esc(o.label || "")}" placeholder="選項文字">
          <input type="number" step="any" data-cfoptvalue value="${esc(o.value ?? 0)}" placeholder="數值" style="max-width:90px">
          <button class="x" data-cfoptdel title="移除選項">✕</button>
        </div>`,
            )
            .join("")}
        <div class="foot"><button class="btn bare" data-cfoptadd>＋ 選項</button></div>`;
  return `<div class="fnodecard ${f.kind === "select" ? "q" : f.kind === "check" ? "a" : "r"}" data-fid="${esc(f.id)}" data-fi="${i}">
    <div class="top">
      <input class="tx" data-cfid value="${esc(f.id)}" placeholder="代號" style="max-width:96px">
      <div class="seg">${["number", "check", "select"]
        .map((k) => `<button data-cftype="${k}" class="${f.kind === k ? "on" : ""}">${KIND_LABEL[k]}</button>`)
        .join("")}</div>
      <span style="flex:1"></span>
      <button class="ib" data-cfdel title="刪除欄位">✕</button>
    </div>
    <input class="tx" data-cflabel value="${esc(f.label || "")}" placeholder="標籤">
    ${extra}
  </div>`;
}

export function renderCalcEditor(blk) {
  if (state.calcRaw[blk.id]) {
    return `<div class="row" style="margin-bottom:8px">
        <button class="btn" data-craw="0">圖形編輯</button><button class="btn on" data-craw="1">原始碼</button></div>
      <textarea class="src" data-src placeholder="check x: 項目 = 1\n= SUM\nlabel 分數\nband 0-1: 低風險">${esc(blk.src || "")}</textarea>
      <div class="syntax">number／check／select 定義欄位；= 公式（SUM 為總分）；label 結果名；dec 小數位；band 下限-上限: 判讀</div>`;
  }
  const c = calcFields(blk);
  const cards = c.fields.map((f, i) => fieldCard(f, i)).join("");
  const bandRows = c.bands
    .map(
      (b, j) => `<div class="outrow" data-bi="${j}">
        <input type="number" step="any" data-cbandmin value="${esc(b.min)}" style="max-width:76px">
        <span>–</span>
        <input type="number" step="any" data-cbandmax value="${esc(b.max)}" style="max-width:76px">
        <input data-cbandtext value="${esc(b.text || "")}" placeholder="判讀文字">
        <button class="x" data-cbanddel title="移除區間">✕</button>
      </div>`,
    )
    .join("");
  return `<div class="row" style="margin-bottom:8px">
      <button class="btn on" data-craw="0">圖形編輯</button><button class="btn" data-craw="1">原始碼</button></div>
    <div class="fe">${cards}
      <div class="row">
        <button class="btn" data-cfadd="number">＋ 數字欄位</button>
        <button class="btn" data-cfadd="check">＋ 勾選欄位</button>
        <button class="btn" data-cfadd="select">＋ 選單欄位</button>
      </div>
    </div>
    <div class="fnodecard" style="margin-top:10px">
      <div class="top"><span class="id">計算與判讀</span></div>
      <input class="tx" data-cexpr value="${esc(c.expr || "SUM")}" placeholder="公式，例如 SUM 或 wt*sex*target">
      <div class="syntax">可用 + - * / ^ ()、min max round floor ceil abs sqrt ln log exp pow、if(條件,真,假)、比較與邏輯運算子；SUM 代表所有欄位相加</div>
      <div class="row" style="margin-top:8px">
        <input data-clabel value="${esc(c.label || "結果")}" placeholder="結果名稱" style="flex:1">
        <input type="number" data-cdec value="${esc(c.dec || 0)}" placeholder="小數位" style="max-width:90px">
      </div>
      ${bandRows}
      <div class="foot"><button class="btn bare" data-cbandadd>＋ 判讀區間</button></div>
    </div>`;
}
