import { esc } from "./util.js";

/* ============================ 簡化 Markdown ============================ */
export function inlineMd(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
export function renderText(src) {
  const lines = String(src || "").split(/\r?\n/);
  let out = "",
    inUl = false;
  const closeUl = () => {
    if (inUl) {
      out += "</ul>";
      inUl = false;
    }
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) {
      closeUl();
      continue;
    }
    if (/^#\s+/.test(l)) {
      closeUl();
      out += "<h3>" + inlineMd(l.replace(/^#\s+/, "")) + "</h3>";
    } else {
      closeUl();
      out += "<p>" + inlineMd(l) + "</p>";
    }
  }
  closeUl();
  return out || '<p style="color:var(--ink-3)">（尚無內容）</p>';
}

/* ============================ 文字：MD <-> HTML ============================ */
export function mdToHtml(src) {
  const lines = String(src || "").split(/\r?\n/);
  if (!lines.length || (lines.length === 1 && !lines[0])) return "<div><br></div>";
  return lines
    .map((l) => {
      const t = l.trim();
      if (/^#\s+/.test(t)) return "<h3>" + inlineMd(t.replace(/^#\s+/, "")) + "</h3>";
      if (!t) return "<div><br></div>";
      return "<div>" + inlineMd(l) + "</div>";
    })
    .join("");
}
export function inlineToMd(node) {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      out += n.nodeValue.replace(/\u00a0/g, " ");
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === "BR") {
      out += "\n";
      return;
    }
    const inner = inlineToMd(n);
    if (!inner.trim()) {
      out += inner;
      return;
    }
    if (tag === "STRONG" || tag === "B") out += "**" + inner.trim() + "**";
    else out += inner;
  });
  return out;
}
export function htmlToMd(el) {
  const parts = [];
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.replace(/\u00a0/g, " ");
      if (t.trim()) parts.push(t);
      return;
    }
    if (n.nodeType !== 1) return;
    if (n.tagName === "BR") {
      parts.push("");
      return;
    }
    const md = inlineToMd(n);
    if (/^H[1-6]$/.test(n.tagName)) parts.push("# " + md.trim());
    else parts.push(md.replace(/\n+$/, ""));
  });
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
