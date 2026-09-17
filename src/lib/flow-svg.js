import { esc } from "./util.js";
import { parseFlow, wrap } from "./flow-parse.js";

/* 分層佈局 → SVG */
export function renderFlowSvg(src) {
  const { nodes, map, start } = parseFlow(src);
  if (!nodes.length) return '<p style="color:var(--ink-3)">（尚無流程，點「編輯」寫入節點）</p>';
  const rank = {};
  const order = [];
  const targeted = new Set();
  nodes.forEach((n) => n.out.forEach((e) => targeted.add(e.to)));
  const roots = nodes.filter((n) => !targeted.has(n.id)).map((n) => n.id);
  if (start && !roots.includes(start)) roots.unshift(start); // 第一個節點永遠算入口，迴路才不會被推到深層
  let queue = roots.map((id) => [id, 0]);
  while (queue.length) {
    const [id, d] = queue.shift();
    const n = map[id];
    if (!n) continue;
    if (rank[id] !== undefined && rank[id] >= d) continue;
    if (rank[id] === undefined) order.push(id);
    rank[id] = d;
    n.out.forEach((e) => {
      if (map[e.to]) queue.push([e.to, d + 1]);
    });
  }
  nodes.forEach((n) => {
    if (rank[n.id] === undefined) {
      rank[n.id] = 0;
      order.push(n.id);
    }
  });

  const CW = 8.2,
    LH = 17,
    PADX = 13,
    PADY = 11,
    GAPX = 26,
    GAPY = 52,
    MAXCH = 16;
  const box = {};
  nodes.forEach((n) => {
    const lines = wrap(n.text, MAXCH);
    const notes = n.notes.length ? wrap(n.notes.join("；"), MAXCH + 4) : [];
    const w =
      (Math.max(
        ...lines.concat(notes).map((l) => [...l].reduce((a, c) => a + (/[⺀-鿿＀-￯]/.test(c) ? 2 : 1), 0)),
      ) *
        CW) /
      2 *
      1.02;
    box[n.id] = {
      lines,
      notes,
      w: Math.max(96, Math.min(230, w + PADX * 2)),
      h: PADY * 2 + lines.length * LH + (notes.length ? notes.length * 14 + 4 : 0),
    };
  });
  const byRank = {};
  order.forEach((id) => {
    (byRank[rank[id]] = byRank[rank[id]] || []).push(id);
  });
  const ranks = Object.keys(byRank)
    .map(Number)
    .sort((a, b) => a - b);
  const rowW = {},
    rowH = {};
  ranks.forEach((r) => {
    rowW[r] = byRank[r].reduce((a, id) => a + box[id].w + GAPX, -GAPX);
    rowH[r] = Math.max(...byRank[r].map((id) => box[id].h));
  });
  const totalW = Math.max(...ranks.map((r) => rowW[r])) + 40;
  let y = 18;
  const pos = {};
  ranks.forEach((r) => {
    let x = (totalW - rowW[r]) / 2;
    byRank[r].forEach((id) => {
      pos[id] = { x, y, w: box[id].w, h: box[id].h };
      x += box[id].w + GAPX;
    });
    y += rowH[r] + GAPY;
  });
  const totalH = y - GAPY + 22;
  const col = {
    Q: ["var(--q-bg)", "var(--q)"],
    A: ["var(--a-bg)", "var(--a)"],
    R: ["var(--r-bg)", "var(--r)"],
    N: ["var(--n-bg)", "var(--n)"],
  };

  let edges = "";
  nodes.forEach((n) => {
    const p = pos[n.id];
    if (!p) return;
    n.out.forEach((e) => {
      const t = pos[e.to];
      if (!t) return;
      const x1 = p.x + p.w / 2,
        y1 = p.y + p.h,
        x2 = t.x + t.w / 2,
        y2 = t.y;
      const down = y2 > y1;
      const my = down ? (y1 + y2) / 2 : y1 + 26;
      const d = down
        ? `M${x1} ${y1} V${my} H${x2} V${y2}`
        : `M${x1} ${y1} V${my} H${x2 + t.w / 2 + 16} V${y2 + t.h / 2} H${t.x + t.w}`;
      edges += `<path class="fedge" d="${d}" marker-end="url(#ar)"/>`;
      if (e.label) {
        const lx = down ? (x1 + x2) / 2 : x2 + t.w / 2 + 20,
          ly = down ? my - 4 : my - 4;
        const wpx = [...e.label].reduce((a, c) => a + (/[⺀-鿿]/.test(c) ? 11 : 6), 0);
        edges +=
          `<rect x="${lx - wpx / 2 - 4}" y="${ly - 12}" width="${wpx + 8}" height="15" rx="3" fill="var(--paper)" stroke="var(--line)"/>` +
          `<text class="felabel" x="${lx}" y="${ly}" text-anchor="middle">${esc(e.label)}</text>`;
      }
    });
  });
  let boxes = "";
  nodes.forEach((n) => {
    const p = pos[n.id];
    if (!p) return;
    const b = box[n.id];
    const [c1, c2] = col[n.type] || col.N;
    boxes += `<g class="fnode"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${n.type === "R" ? 12 : 7}" fill="${c1}" stroke="${c2}"/>`;
    let ty = p.y + PADY + 13;
    b.lines.forEach((l) => {
      boxes += `<text x="${p.x + p.w / 2}" y="${ty}" text-anchor="middle" fill="var(--ink)" font-weight="${n.type === "Q" ? 600 : 500}">${esc(l)}</text>`;
      ty += LH;
    });
    ty += 2;
    b.notes.forEach((l) => {
      boxes += `<text x="${p.x + p.w / 2}" y="${ty}" text-anchor="middle" fill="var(--ink-3)" font-size="11">${esc(l)}</text>`;
      ty += 14;
    });
    boxes += "</g>";
  });
  return `<div class="flowscroll"><svg viewBox="0 0 ${Math.round(totalW)} ${Math.round(totalH)}" width="${Math.round(totalW)}" height="${Math.round(totalH)}" style="max-width:100%;height:auto">
    <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="var(--ink-3)"/></marker></defs>
    ${edges}${boxes}</svg></div>`;
}
