import { uid, esc } from "./lib/util.js";
import { strip, merge } from "./lib/data-io.js";
import { state, save, setView } from "./store.js";
import { $, toast } from "./ui/toast.js";
import { renderList } from "./ui/list.js";
import { renderMain } from "./ui/item.js";

export function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name.replace(/[\\/:*?"<>|]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ============================ 開啟／新增 ============================ */
export function rerender() {
  renderList();
  renderMain();
}
export function openItem(id, tab) {
  state.cur = id;
  state.onePage = false;
  state.curTab = tab !== undefined && tab >= 0 ? tab : 0;
  state.edit = {};
  state.tools = {};
  state.metaOpen = false;
  setView("item");
  rerender();
}
export function newItem() {
  const it = { id: uid(), title: "未命名詞條", subtitle: "", tags: [], blocks: [] };
  state.db.items.push(it);
  save();
  openItem(it.id);
  const h = document.querySelector(".ttl");
  if (h) {
    h.focus();
    const s = document.getSelection();
    s && s.selectAllChildren && s.selectAllChildren(h);
  }
}
export function addBlock(kind) {
  const it = state.db.items.find((i) => i.id === state.cur);
  if (!it) return;
  const blk = { id: uid(), type: kind, title: "", src: "" };
  if (kind === "flow") {
    blk.mode = "page";
    blk.src = "Q n1: 第一個問題？";
  }
  if (kind === "image") blk.strokes = [];
  if (kind === "calc") blk.src = "check a: 項目一 = 1\ncheck b: 項目二 = 1\n= SUM\nlabel 分數\nband 0-1: 低\nband 2-9: 高";
  it.blocks.push(blk);
  state.edit[blk.id] = true;
  state.curTab = it.blocks.length - 1;
  state.onePage = false;
  save();
  rerender();
}

/* ============================ 指南／匯入匯出 ============================ */
export function copySpec() {
  navigator.clipboard
    ? navigator.clipboard.writeText($("#specBox").textContent).then(
        () => toast("規格已複製，貼給 AI 即可"),
        () => toast("複製失敗，請手動選取"),
      )
    : toast("複製失敗，請手動選取");
}
export function mergeToast(r) {
  if (!r.total) return null;
  const parts = [];
  if (r.added) parts.push(`新增 ${r.added} 筆`);
  if (r.updated) parts.push(`更新 ${r.updated} 筆`);
  if (r.keptAsNew) parts.push(`同名保留為新詞條 ${r.keptAsNew} 筆`);
  return parts.join("，");
}
export function loadSample() {
  const data = JSON.parse(document.getElementById("sampleSrc").textContent);
  const r = merge(data, state.db, save, renderList);
  $("#dlgGuide").close();
  state.cur = state.db.items[state.db.items.length - 1].id;
  openItem(state.cur);
  toast(mergeToast(r) || "沒有可載入的示範詞條");
}
export function exportAll() {
  if (!state.db.items.length) {
    toast("目前沒有資料可以匯出");
    return;
  }
  const d = new Date().toISOString().slice(0, 10);
  download(`clinical-kb-${d}.json`, JSON.stringify({ format: "clinical-kb", version: 1, items: state.db.items.map(strip) }, null, 1));
}
export function doImport() {
  const msg = $("#importMsg");
  try {
    const data = JSON.parse($("#importText").value);
    const r = merge(data, state.db, save, renderList);
    if (!r.total) {
      msg.innerHTML = '<span style="color:var(--warn)">找不到任何有 title 的詞條，請對照規格檢查。</span>';
      return;
    }
    $("#dlgImport").close();
    $("#importText").value = "";
    state.cur = state.db.items[state.db.items.length - 1].id;
    openItem(state.cur);
    toast(mergeToast(r));
  } catch (err) {
    msg.innerHTML = '<span style="color:var(--warn)">JSON 解析失敗：' + esc(err.message) + "</span>";
  }
}
