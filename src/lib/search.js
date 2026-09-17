import { esc } from "./util.js";

/* ============================ 搜尋 ============================ */
export function blockText(b) {
  if (b.type === "table") return (b.title || "") + " " + (b.desc || "") + " " + String(b.src || "").replace(/[,"]/g, " ");
  if (b.type === "flow")
    return (
      (b.title || "") +
      " " +
      String(b.src || "")
        .replace(/^[QARN]\s+[\w-]+:/gm, " ")
        .replace(/->/g, " ")
    );
  if (b.type === "calc")
    return (
      (b.title || "") +
      " " +
      (b.desc || "") +
      " " +
      String(b.src || "").replace(/^(number|check|select|=|label|dec|band)/gm, " ")
    );
  return (b.title || "") + " " + (b.desc || "") + " " + String(b.src || "");
}
export function score(item, qs) {
  const title = (item.title + " " + (item.subtitle || "") + " " + (item.tags || []).join(" ")).toLowerCase();
  const kws = (item.blocks || [])
    .filter((b) => b.type === "keywords")
    .map((b) => b.src || "")
    .join(",")
    .toLowerCase();
  let s = 0,
    hit = null,
    hitTab = -1;
  for (const t of qs) {
    if (title.includes(t)) s += 10;
    else if (kws.includes(t)) s += 6;
    else {
      let found = false;
      (item.blocks || []).forEach((b, bi) => {
        if (found) return;
        const txt = blockText(b);
        const at = txt.toLowerCase().indexOf(t);
        if (at >= 0) {
          found = true;
          s += 2;
          if (!hit) {
            hit = txt.slice(Math.max(0, at - 24), at + 56).trim();
            hitTab = bi;
          }
        }
      });
      if (!found) return { s: 0 };
    }
  }
  return { s, hit, hitTab };
}
export function hl(txt, qs) {
  let out = esc(txt);
  qs.forEach((t) => {
    if (!t) return;
    out = out.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"), "<mark>$1</mark>");
  });
  return out;
}
