import { uid } from "./util.js";
import { KINDS } from "./kinds.js";

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
      return x;
    }),
  };
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
  return o;
}

// db/save/renderList are passed in explicitly (rather than read off globals) so this
// module has no dependency on the app shell's state; see plan Stage 1.
export function merge(data, db, save, renderList) {
  let items = [];
  if (Array.isArray(data)) items = data;
  else if (Array.isArray(data.items)) items = data.items;
  else if (data.title) items = [data];
  let n = 0;
  items.forEach((raw) => {
    if (!raw || !raw.title) return;
    const blocks = (raw.blocks || []).map(normBlock);
    const exist = db.items.find((x) => (raw.id && x.id === raw.id) || x.title === raw.title);
    if (exist) {
      exist.subtitle = raw.subtitle || exist.subtitle;
      exist.tags = raw.tags || exist.tags;
      exist.blocks = blocks;
    } else db.items.push({ id: raw.id || uid(), title: raw.title, subtitle: raw.subtitle || "", tags: raw.tags || [], blocks });
    n++;
  });
  save();
  renderList();
  return n;
}
