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
  // NOT tested here: a true back-reference cycle (e.g. "start -> a -> start") sends
  // renderFlowSvg's rank BFS into an infinite loop with unbounded memory growth - the
  // `rank[id] >= d` guard never trips because a pure cycle's `d` keeps increasing on
  // every pass. Confirmed by hand-tracing the algorithm and by a worker crash when this
  // case was exercised here. This is a pre-existing bug (present in clinical-kb-4.html
  // too), not introduced by the Stage 1 extraction - reported to the user, not silently
  // fixed, since it's outside this round's originally-scoped tech debt list.
});
