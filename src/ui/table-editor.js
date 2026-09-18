import { esc } from "../lib/util.js";
import { parseCsv, serializeCsv } from "../lib/csv.js";
import { state, save } from "../store.js";
import { renderList } from "./list.js";
import { renderMain } from "./item.js";

// 懶惰解析＋快取（比照 flow-editor.js 的 fnodes）。順便把所有列補齊到同一個欄數，
// 讓後續新增/刪除列欄的邏輯不用另外處理不規則資料；只在互動時才寫回 blk.src，單純
// 打開格子編輯模式看一眼不會意外改動已存的原始文字。
export function tableRows(blk) {
  if (!state.tableCache[blk.id]) {
    const rows = parseCsv(blk.src);
    const w = Math.max(1, ...rows.map((r) => r.length));
    state.tableCache[blk.id] = rows.length
      ? rows.map((r) => {
          const c = r.slice();
          while (c.length < w) c.push("");
          return c;
        })
      : [[""]];
  }
  return state.tableCache[blk.id];
}
export function commitTable(blk, structural) {
  blk.src = serializeCsv(tableRows(blk));
  save();
  if (structural) renderMain();
  else renderList();
}

export function renderTableEditor(blk) {
  if (state.tableRaw[blk.id]) {
    return `<div class="row" style="margin-bottom:8px">
        <button class="btn" data-traw="0">格子編輯</button><button class="btn on" data-traw="1">原始碼</button></div>
      <textarea class="src" data-src placeholder="欄1,欄2\n值1,值2">${esc(blk.src || "")}</textarea>
      <div class="syntax">CSV，第一列當表頭；含逗號的欄位用雙引號包住</div>`;
  }
  const rows = tableRows(blk);
  const header = blk.header !== false;
  const colCount = rows[0].length;
  const ctrlRow =
    "<tr>" +
    Array.from({ length: colCount }, (_, c) => `<th><button class="ib bare" data-delcol="${c}" title="刪除這欄">✕</button></th>`).join(
      "",
    ) +
    "<th></th></tr>";
  const bodyRows = rows
    .map(
      (row, r) =>
        `<tr>${row
          .map(
            (cell, c) =>
              `<td><input data-cell data-row="${r}" data-col="${c}" value="${esc(cell)}" ${r === 0 && header ? 'style="font-weight:650"' : ""}></td>`,
          )
          .join("")}<td><button class="ib bare" data-delrow="${r}" title="刪除這列">✕</button></td></tr>`,
    )
    .join("");
  return `<div class="row" style="margin-bottom:8px">
      <button class="btn on" data-traw="0">格子編輯</button><button class="btn" data-traw="1">原始碼</button></div>
    <div class="tbl tblgrid"><table><thead>${ctrlRow}</thead><tbody>${bodyRows}</tbody></table></div>
    <div class="row" style="margin-top:8px">
      <button class="btn" data-addrow>＋ 新增列</button>
      <button class="btn" data-addcol>＋ 新增欄</button>
      <button class="btn" data-toggleheader>${header ? "第一列當資料" : "第一列當表頭"}</button>
    </div>`;
}
