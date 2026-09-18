import { uid } from "./util.js";
import { KINDS } from "./kinds.js";

// 來源連結可能以字串、{url}、{url,label} 等形式出現（尤其是 AI 匯入的 JSON 不一定
// 照規格寫），一律正規化成 {url,label}（label 選填）或直接丟棄無效值——比照
// playbook 的「驗證寧可寬鬆」原則，一個來源連結格式不對不該讓整筆匯入失敗。
export function normCite(c) {
  if (!c) return undefined;
  if (typeof c === "string") return c.trim() ? { url: c.trim(), label: "" } : undefined;
  if (typeof c === "object" && c.url) return { url: String(c.url).trim(), label: c.label ? String(c.label).trim() : "" };
  return undefined;
}
export function normSources(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normCite).filter(Boolean);
}

export function strip(it) {
  const o = {
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
      if (b.cite && b.cite.url) x.cite = b.cite;
      return x;
    }),
  };
  const sources = normSources(it.sources);
  if (sources.length) o.sources = sources;
  return o;
}

export function normBlock(b) {
  const o = { id: uid(), type: (b.type || "text").toLowerCase(), title: b.title || "", desc: b.desc || "", src: b.src || b.content || b.body || "" };
  if (!KINDS[o.type]) o.type = "text";
  if (Array.isArray(b.src)) o.src = b.src.join(", ");
  if (o.type === "flow") o.mode = b.mode === "step" ? "step" : "page";
  if (o.type === "table" && b.header === false) o.header = false;
  if (o.type === "image") {
    o.strokes = Array.isArray(b.strokes) ? b.strokes : [];
  }
  const cite = normCite(b.cite);
  if (cite) o.cite = cite;
  return o;
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
    const blocks = (raw.blocks || []).map(normBlock);
    const existById = raw.id ? db.items.find((x) => x.id === raw.id) : undefined;
    if (existById) {
      existById.subtitle = raw.subtitle || existById.subtitle;
      existById.tags = raw.tags || existById.tags;
      existById.blocks = blocks;
      if (raw.sources) existById.sources = normSources(raw.sources);
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
      sources: normSources(raw.sources),
    });
    if (titleTaken) keptAsNew++;
    else added++;
  });
  save();
  renderList();
  return { total: added + updated + keptAsNew, added, updated, keptAsNew };
}
