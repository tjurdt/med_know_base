import { uid } from "./util.js";
import { KINDS } from "./kinds.js";
import { serializeRefs } from "./refs.js";

// 來源連結可能以字串、{url}、{url,label} 等形式出現（尤其是 AI 匯入的 JSON 不一定
// 照規格寫），一律正規化成 {url,label}（label 選填）或直接丟棄無效值——比照
// playbook 的「驗證寧可寬鬆」原則，一個來源連結格式不對不該讓整筆匯入失敗。
export function normCite(c) {
  if (!c) return undefined;
  if (typeof c === "string") return c.trim() ? { url: c.trim(), label: "" } : undefined;
  if (typeof c === "object" && c.url) return { url: String(c.url).trim(), label: c.label ? String(c.label).trim() : "" };
  return undefined;
}
export function normCites(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normCite).filter(Boolean);
}

export function strip(it) {
  return {
    title: it.title,
    subtitle: it.subtitle || "",
    tags: it.tags || [],
    blocks: (it.blocks || []).map((b) => {
      const x = { type: b.type };
      if (b.title) x.title = b.title;
      if (b.desc) x.desc = b.desc;
      if (b.src) x.src = b.src;
      if (b.mode) x.mode = b.mode;
      if (b.header === false) x.header = false;
      if ((b.strokes || []).length) x.strokes = b.strokes;
      const cites = normCites(b.cites);
      if (cites.length) x.cites = cites;
      return x;
    }),
  };
}

// 匯入的 block.cite（Stage 6e 的單數欄位）不再讀取：格式對不上新的 cites 陣列，
// 寧可寬鬆地當作沒有來源處理，不因為欄位名稱改變就讓整筆匯入失敗。既有本機資料裡
// 已經用舊 UI 填過的 cite/sources 走的是 migrateLegacy，不是這條路徑。見 plan Stage 7c。
export function normBlock(b) {
  const o = { id: uid(), type: (b.type || "text").toLowerCase(), title: b.title || "", desc: b.desc || "", src: b.src || b.content || b.body || "" };
  if (!KINDS[o.type]) o.type = "text";
  if (Array.isArray(b.src)) o.src = b.src.join(", ");
  if (o.type === "flow") o.mode = b.mode === "step" ? "step" : "page";
  if (o.type === "table" && b.header === false) o.header = false;
  if (o.type === "image") {
    o.strokes = Array.isArray(b.strokes) ? b.strokes : [];
  }
  const cites = normCites(b.cites);
  if (cites.length) o.cites = cites;
  return o;
}

// 一個詞條最多一頁「參考連結」：匯入時若 blocks 裡有多筆 type:"refs"，只保留
// 第一筆，其餘忽略——寧可寬鬆但仍要維持這個介面上的不變量。
function limitRefs(blocks) {
  let seen = false;
  return blocks.filter((b) => {
    if (b.type !== "refs") return true;
    if (seen) return false;
    seen = true;
    return true;
  });
}

// db/save/renderList are passed in explicitly (rather than read off globals) so this
// module has no dependency on the app shell's state; see plan Stage 1.
//
// Same-id matches are a deliberate update (the user re-imports their own exported file,
// which carries the original id) and overwrite in place. Same-title-but-different-id
// matches used to overwrite too, which silently destroyed the existing item's content
// on any accidental name collision (e.g. importing someone else's sample data, or
// re-generating AI output that happens to reuse a title). Those are now kept as a
// separate new item instead, so a collision never loses data - see plan Stage 3.
export function merge(data, db, save, renderList) {
  let items = [];
  if (Array.isArray(data)) items = data;
  else if (Array.isArray(data.items)) items = data.items;
  else if (data.title) items = [data];
  let added = 0,
    updated = 0,
    keptAsNew = 0;
  items.forEach((raw) => {
    if (!raw || !raw.title) return;
    const blocks = limitRefs((raw.blocks || []).map(normBlock));
    const existById = raw.id ? db.items.find((x) => x.id === raw.id) : undefined;
    if (existById) {
      existById.subtitle = raw.subtitle || existById.subtitle;
      existById.tags = raw.tags || existById.tags;
      existById.blocks = blocks;
      updated++;
      return;
    }
    const titleTaken = db.items.some((x) => x.title === raw.title);
    db.items.push({
      id: raw.id || uid(),
      title: raw.title,
      subtitle: raw.subtitle || "",
      tags: raw.tags || [],
      blocks,
    });
    if (titleTaken) keptAsNew++;
    else added++;
  });
  save();
  renderList();
  return { total: added + updated + keptAsNew, added, updated, keptAsNew };
}

// 只在載入既有本機資料時執行一次的欄位搬移，跟上面「匯入外部 JSON 寧可寬鬆略過舊
// 格式」刻意不同——這裡處理的是使用者自己在這個 app 較舊版本的 UI 裡已經填好、
// 現在還看得到的資料（Stage 6e 的 block.cite 單數欄位、item.sources 陣列），版本
// 升級不該讓已經存在的內容憑空消失。見 plan Stage 7c。
export function migrateLegacy(db) {
  (db.items || []).forEach((it) => {
    it.blocks = it.blocks || [];
    it.blocks.forEach((b) => {
      if (b.cite && b.cite.url && !(Array.isArray(b.cites) && b.cites.length)) {
        const c = normCite(b.cite);
        if (c) b.cites = [c];
      }
    });
    if (Array.isArray(it.sources) && it.sources.length && !it.blocks.some((b) => b.type === "refs")) {
      const list = normCites(it.sources);
      if (list.length) {
        it.blocks.push({ id: uid(), type: "refs", title: "", src: serializeRefs(list) });
      }
    }
  });
  return db;
}
