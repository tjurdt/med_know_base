import { load as loadStorage, STORAGE_KEY } from "./lib/storage.js";
import { toast } from "./ui/toast.js";

// 單一可變狀態容器：其他模組 import { state } 之後可以直接讀寫 state.xxx。
// ESM 只禁止重新賦值 import 進來的綁定本身（例如 `import {cur} from ...; cur = 1`
// 不合法），並不禁止修改 import 進來的物件屬性，所以這裡不需要為每個欄位另外寫
// getter/setter——直接共用同一個物件參考即可，也就不會有「忘記呼叫 setter、
// 各模組各自持有不同副本」這種風險。見 plan Stage 4。
export const state = {
  memOnly: false,
  db: { format: "clinical-kb", version: 1, items: [] },
  cur: null,
  curTab: 0,
  onePage: false,
  query: "",
  listSel: -1,
  edit: {},
  tools: {},
  metaOpen: false,
  flowState: {},
  flowCache: {},
  flowRaw: {},
  tableCache: {},
  tableRaw: {},
  calcCache: {},
  calcRaw: {},
  shown: [],
  pendingCsv: null,
  pendingImg: null,
};

// 由啟動流程呼叫一次；回傳值交給呼叫端決定要不要顯示 banner/toast（這裡不碰 DOM）。
export function initStore() {
  const loaded = loadStorage(localStorage);
  state.memOnly = loaded.memOnly;
  state.db = loaded.db;
  return { memOnly: loaded.memOnly, quarantined: loaded.quarantined };
}

export function save() {
  if (state.memOnly) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
  } catch {
    state.memOnly = true;
    const banner = document.getElementById("storageBanner");
    if (banner) banner.hidden = false;
    toast("本機儲存已滿或被封鎖，請用「匯出」保留資料");
  }
}

export const itemById = (id) => state.db.items.find((i) => i.id === id);
export function setView(v) {
  document.body.dataset.view = v;
}
export const viewIs = (v) => document.body.dataset.view === v;
