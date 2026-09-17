import { describe, expect, it } from "vitest";
import { renderFlowSvg } from "../src/lib/flow-svg.js";

/* ---- 測試小工具：把 SVG 輸出解析回幾何資料，檢查邊是否穿過不相干的節點方塊 ---- */
function parseNodeBoxes(svg) {
  const re = /<g class="fnode"><rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g;
  const boxes = [];
  let m;
  while ((m = re.exec(svg))) {
    boxes.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] });
  }
  return boxes;
}
function parseEdgeSegments(svg) {
  const re = /<path class="fedge" d="([^"]+)"/g;
  const edges = [];
  let m;
  while ((m = re.exec(svg))) {
    const tokenRe = /M(-?[\d.]+) (-?[\d.]+)|V(-?[\d.]+)|H(-?[\d.]+)/g;
    let cur = null;
    const points = [];
    let t;
    while ((t = tokenRe.exec(m[1]))) {
      if (t[1] !== undefined) cur = { x: +t[1], y: +t[2] };
      else if (t[3] !== undefined) cur = { x: cur.x, y: +t[3] };
      else cur = { x: +t[4], y: cur.y };
      points.push({ ...cur });
    }
    const segments = [];
    for (let i = 1; i < points.length; i++) segments.push([points[i - 1], points[i]]);
    edges.push(segments);
  }
  return edges;
}
// 軸對齊線段是否穿過矩形「內部」（單純貼邊不算，允許起點/終點落在來源、目標方塊邊上）。
function segmentEntersBox(p1, p2, box) {
  const minY = Math.min(p1.y, p2.y),
    maxY = Math.max(p1.y, p2.y);
  const minX = Math.min(p1.x, p2.x),
    maxX = Math.max(p1.x, p2.x);
  if (p1.x === p2.x) {
    return p1.x > box.x && p1.x < box.x + box.w && minY < box.y + box.h && maxY > box.y;
  }
  return p1.y > box.y && p1.y < box.y + box.h && minX < box.x + box.w && maxX > box.x;
}

describe("renderFlowSvg", () => {
  it("shows a placeholder when there are no nodes", () => {
    expect(renderFlowSvg("")).toContain("尚無流程");
  });
  it("renders an svg with one box per node and edges for each out", () => {
    const svg = renderFlowSvg("Q start: 有症狀？\n  有 -> a\n  沒有 -> b\nA a: 處置\nR b: 結論");
    expect(svg).toContain("<svg");
    expect((svg.match(/<g class="fnode">/g) || []).length).toBe(3);
    expect((svg.match(/<path class="fedge"/g) || []).length).toBe(2);
  });
  it(
    "degrades to a text listing instead of hanging on a true feedback cycle " +
      "(Stage 3 fix - see git history for how this used to hang the whole worker)",
    () => {
      const svg = renderFlowSvg("A start: 開始\n  -> a\nA a: 下一步\n  -> start");
      expect(svg).toContain("回饋迴路");
      expect(svg).toContain("<pre");
      expect(svg).toContain("A start: 開始");
      expect(svg).not.toContain("<svg");
    },
  );

  describe("跨層級的邊不會被中間的節點方塊蓋住（Stage 5a 修復）", () => {
    it("routes a skip edge (n1 -> n3, skipping n2) around n2's box instead of through it", () => {
      const svg = renderFlowSvg(
        "Q n1: 第一個問題？\n  njdkf -> n2\n  bdgr -> n3\n  * fvevefv\nQ n2: dvfvbfb\n  dbfg dgbvsda -> n3\n  * dfvfb\nQ n3: dvfbr\n  * ebwrrrtwbrb",
      );
      const boxes = parseNodeBoxes(svg);
      const edges = parseEdgeSegments(svg);
      expect(boxes).toHaveLength(3);
      expect(edges).toHaveLength(3);
      const [n1, n2, n3] = boxes;
      const skipEdge = edges[1]; // n1 -> n3 (label "bdgr")
      for (const [p1, p2] of skipEdge) {
        expect(segmentEntersBox(p1, p2, n2)).toBe(false);
        expect(segmentEntersBox(p1, p2, n1)).toBe(false);
        expect(segmentEntersBox(p1, p2, n3)).toBe(false);
      }
      // 其餘兩條相鄰層級的邊維持原本畫法，不受影響。
      expect(svg).toContain("njdkf");
      expect(svg).toContain("dbfg dgbvsda");
      expect(svg).toContain("bdgr");
    });

    it("still avoids the taller of two side-by-side intervening nodes with differing heights", () => {
      const svg = renderFlowSvg(
        "Q n1: 起點\n  a -> n2\n  b -> n3\n  skip -> n4\nQ n2: 短\n  x -> n4\nQ n3: 這個節點文字比較長會換行看看高度\n  * 額外補充讓它更高一點\nR n4: 終點",
      );
      const boxes = parseNodeBoxes(svg);
      const edges = parseEdgeSegments(svg);
      const [n1, n2, n3, n4] = boxes;
      expect(n3.h).toBeGreaterThan(n2.h); // 確認這個合成案例真的做出了高度不一的情況
      const skipEdgeIndex = edges.length - 1; // n1 的第三個出口（skip -> n4）最後被走訪到
      const skipEdge = edges[skipEdgeIndex];
      for (const [p1, p2] of skipEdge) {
        for (const box of [n1, n2, n3, n4]) {
          if (box === n1 || box === n4) continue; // 起點/終點本來就會碰到
          expect(segmentEntersBox(p1, p2, box)).toBe(false);
        }
      }
    });
  });
});
