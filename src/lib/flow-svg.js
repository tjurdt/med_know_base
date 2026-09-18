import { esc } from "./util.js";
import { parseFlow, serializeFlow, wrap } from "./flow-parse.js";

// 找出「回饋邊」：對節點做 DFS，用三色標記（未訪問／在目前路徑上／已完成）；
// 一條邊如果指向「目前還在 DFS 路徑上的祖先節點」（含指向自己），就是回饋邊。
// 把這些邊從排版計算中排除後，剩下的圖保證是 DAG（圖論標準結論），最長路徑分層
// BFS 就一定會在有限步內終止，不再需要「偵測到就整個降級成文字」——回饋邊本身
// 會在畫圖階段改走專屬車道畫成繞回去的線，見 renderFlowSvg 後段。見 plan Stage 6c
// （取代 Stage 3 當時「先求不卡死」的降級處理）。
function findBackEdges(nodes, map, start) {
  const backEdges = new Set();
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = {};
  nodes.forEach((n) => (color[n.id] = WHITE));
  function dfs(id) {
    color[id] = GRAY;
    const n = map[id];
    if (n) {
      n.out.forEach((e) => {
        if (!map[e.to]) return;
        if (color[e.to] === GRAY) backEdges.add(e);
        else if (color[e.to] === WHITE) dfs(e.to);
      });
    }
    color[id] = BLACK;
  }
  const roots = start ? [start, ...nodes.map((n) => n.id).filter((id) => id !== start)] : nodes.map((n) => n.id);
  roots.forEach((id) => {
    if (color[id] === WHITE) dfs(id);
  });
  return backEdges;
}

/* 分層佈局 → SVG */
export function renderFlowSvg(src) {
  const { nodes, map, start } = parseFlow(src);
  if (!nodes.length) return '<p style="color:var(--ink-3)">（尚無流程，點「編輯」寫入節點）</p>';
  const backEdges = findBackEdges(nodes, map, start);
  const rank = {};
  const order = [];
  const targeted = new Set();
  nodes.forEach((n) => n.out.forEach((e) => !backEdges.has(e) && targeted.add(e.to)));
  const roots = nodes.filter((n) => !targeted.has(n.id)).map((n) => n.id);
  if (start && !roots.includes(start)) roots.unshift(start); // 第一個節點永遠算入口
  let queue = roots.map((id) => [id, 0]);
  // 安全上限：排除回饋邊後的圖保證無環，正常不會觸發；保留當防禦性的最後一道防線
  // （例如未來改動不小心破壞了「排除回饋邊後必為 DAG」這個前提），觸發時退回文字
  // 列表，不會真的無限迴圈把分頁凍住。見 plan Stage 3 / Stage 6c。
  const MAX_STEPS = (nodes.length + 1) * (nodes.length + 1) * 4 + 100;
  let steps = 0;
  let loopDetected = false;
  while (queue.length) {
    if (++steps > MAX_STEPS) {
      loopDetected = true;
      break;
    }
    const [id, d] = queue.shift();
    const n = map[id];
    if (!n) continue;
    if (rank[id] !== undefined && rank[id] >= d) continue;
    if (rank[id] === undefined) order.push(id);
    rank[id] = d;
    n.out.forEach((e) => {
      if (backEdges.has(e)) return;
      if (map[e.to]) queue.push([e.to, d + 1]);
    });
  }
  if (loopDetected) {
    return (
      '<p style="color:var(--warn)">這張流程圖的排版計算超出預期範圍，改用文字列出：</p>' +
      `<pre style="white-space:pre-wrap;font-family:var(--mono);font-size:12px;line-height:1.62">${esc(serializeFlow(nodes))}</pre>`
    );
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

  // 跨層級的邊（例如 n1 直接連到 n3，跳過中間的 n2）如果照一般畫法直接從來源畫一條直線
  // 到目標，單欄排版時會筆直穿過中間節點的方塊，又因為方塊是最後才畫、疊在邊的上面，
  // 這條邊（連同標籤）會被完全蓋住、看起來像消失了。這裡幫這類邊改走圖表最右側的專屬
  // 「車道」：先在來源列與下一列之間的空白帶（每個列之間本來就有 GAPY 的空白，橫向
  // 走再遠都不會撞到任何節點）橫移過去，沿車道下降到目標列正上方的空白帶，再橫移進
  // 目標。車道本身在 totalW 之外，不會跟任何節點方塊重疊。見 plan Stage 5a。
  // 回饋邊（迴圈的一部分，指回較早或同一層的節點）用另一組專屬車道處理，方向反過來
  // （車道往上走），從目標的上方或側邊進入，而不是頂端——見下面畫邊那段的說明。
  // 兩組車道都在圖表右側、彼此不重疊，只是各自佔一段 X 區間。見 plan Stage 6c。
  const LANE_GAP = 20,
    LANE_STEP = 26;
  const laneOf = new Map();
  const backLaneOf = new Map();
  let laneCount = 0;
  let backLaneCount = 0;
  nodes.forEach((n) => {
    const p = pos[n.id];
    if (!p) return;
    n.out.forEach((e) => {
      const t = pos[e.to];
      if (!t) return;
      if (backEdges.has(e)) backLaneOf.set(e, backLaneCount++);
      else if (rank[e.to] - rank[n.id] > 1) laneOf.set(e, laneCount++);
    });
  });
  const laneBaseX = totalW + LANE_GAP;
  const backLaneBaseX = laneBaseX + laneCount * LANE_STEP + (laneCount && backLaneCount ? LANE_GAP : 0);
  const totalWithLanes =
    laneCount || backLaneCount ? Math.max(laneBaseX + laneCount * LANE_STEP, backLaneBaseX + backLaneCount * LANE_STEP) + 10 : totalW;

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
      if (backEdges.has(e)) {
        // 跟正向跳層邊一樣先在來源列下方的空白帶橫移進車道，車道方向朝上（目標
        // rank 較小或相同）。目標在較早的列時，車道一路上升到目標列「上方」的
        // 空白帶，從頂端探入；目標跟來源同一層（含自我循環）沒有列間空白可用，
        // 改成比照現有「非向下」邊已經有的畫法，從目標右側切入。
        const laneX = backLaneBaseX + backLaneOf.get(e) * LANE_STEP;
        const midY1 = p.y + rowH[rank[n.id]] + 14;
        let d, lx, ly;
        if (rank[e.to] < rank[n.id]) {
          const midY2 = t.y - 14;
          d = `M${x1} ${y1} V${midY1} H${laneX} V${midY2} H${x2} V${y2}`;
          lx = laneX;
          ly = (midY1 + midY2) / 2;
        } else {
          const enterY = t.y + t.h / 2;
          d = `M${x1} ${y1} V${midY1} H${laneX} V${enterY} H${t.x + t.w}`;
          lx = laneX;
          ly = (midY1 + enterY) / 2;
        }
        edges += `<path class="fedge" d="${d}" marker-end="url(#ar)"/>`;
        if (e.label) {
          const wpx = [...e.label].reduce((a, c) => a + (/[⺀-鿿]/.test(c) ? 11 : 6), 0);
          edges +=
            `<rect x="${lx - wpx / 2 - 4}" y="${ly - 12}" width="${wpx + 8}" height="15" rx="3" fill="var(--paper)" stroke="var(--line)"/>` +
            `<text class="felabel" x="${lx}" y="${ly}" text-anchor="middle">${esc(e.label)}</text>`;
        }
        return;
      }
      if (laneOf.has(e)) {
        const laneX = laneBaseX + laneOf.get(e) * LANE_STEP;
        const midY1 = p.y + rowH[rank[n.id]] + 14; // 用整列的高度，避免同列裡有更高的方塊時仍被切到
        const midY2 = y2 - 14;
        edges += `<path class="fedge" d="M${x1} ${y1} V${midY1} H${laneX} V${midY2} H${x2} V${y2}" marker-end="url(#ar)"/>`;
        if (e.label) {
          const ly = (midY1 + midY2) / 2;
          const wpx = [...e.label].reduce((a, c) => a + (/[⺀-鿿]/.test(c) ? 11 : 6), 0);
          edges +=
            `<rect x="${laneX - wpx / 2 - 4}" y="${ly - 12}" width="${wpx + 8}" height="15" rx="3" fill="var(--paper)" stroke="var(--line)"/>` +
            `<text class="felabel" x="${laneX}" y="${ly}" text-anchor="middle">${esc(e.label)}</text>`;
        }
        return;
      }
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
  return `<div class="flowscroll"><svg viewBox="0 0 ${Math.round(totalWithLanes)} ${Math.round(totalH)}" width="${Math.round(totalWithLanes)}" height="${Math.round(totalH)}" style="max-width:100%;height:auto">
    <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="var(--ink-3)"/></marker></defs>
    ${edges}${boxes}</svg></div>`;
}
