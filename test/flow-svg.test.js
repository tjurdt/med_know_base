import { describe, expect, it } from "vitest";
import { renderFlowSvg } from "../src/lib/flow-svg.js";

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
});
