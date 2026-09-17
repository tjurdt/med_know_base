/* ============================ 流程圖：解析 ============================ */
export function parseFlow(src) {
  const nodes = [];
  const map = {};
  const lines = String(src || "").split(/\r?\n/);
  let last = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const indented = /^\s/.test(raw);
    const l = raw.trim();
    const m = l.match(/^([QARNqarn])\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (m && !indented) {
      const n = { id: m[2], type: m[1].toUpperCase(), text: m[3].trim(), out: [], notes: [] };
      nodes.push(n);
      map[n.id] = n;
      last = n;
      continue;
    }
    if (!last) continue;
    if (/^\*\s*/.test(l)) {
      last.notes.push(l.replace(/^\*\s*/, ""));
      continue;
    }
    const e = l.match(/^(.*?)->\s*([A-Za-z0-9_-]+)\s*$/);
    if (e) {
      last.out.push({ label: e[1].trim(), to: e[2] });
      continue;
    }
    if (m) {
      const n = { id: m[2], type: m[1].toUpperCase(), text: m[3].trim(), out: [], notes: [] };
      nodes.push(n);
      map[n.id] = n;
      last = n;
    }
  }
  return { nodes, map, start: nodes[0] ? nodes[0].id : null };
}

/* 文字折行（中英混排估寬） */
export function wrap(text, maxCh) {
  const words = String(text).split(/(\s+)/);
  const lines = [];
  let line = "";
  const width = (s) => [...s].reduce((a, c) => a + (/[⺀-鿿＀-￯]/.test(c) ? 2 : 1), 0);
  for (const w of words) {
    if (width(line + w) > maxCh * 2 && line.trim()) {
      lines.push(line.trim());
      line = w.trim() ? w : "";
    } else line += w;
    while (width(line) > maxCh * 2 + 4) {
      let cut = "",
        i = 0;
      const chars = [...line];
      while (i < chars.length && width(cut + chars[i]) <= maxCh * 2) {
        cut += chars[i++];
      }
      lines.push(cut);
      line = chars.slice(i).join("");
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.length ? lines : [""];
}

/* ============================ 流程圖：序列化 ============================ */
export function serializeFlow(nodes) {
  return nodes
    .map((n) => {
      let s = n.type + " " + n.id + ": " + (n.text || "");
      (n.notes || []).forEach((x) => {
        if (x.trim()) s += "\n  * " + x.trim();
      });
      (n.out || []).forEach((e) => {
        if (e.to) s += "\n  " + (e.label ? e.label + " " : "") + "-> " + e.to;
      });
      return s;
    })
    .join("\n");
}
export function nextFid(nodes) {
  let i = 1;
  const has = (id) => nodes.some((n) => n.id === id);
  while (has("n" + i)) i++;
  return "n" + i;
}
