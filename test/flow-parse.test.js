import { describe, expect, it } from "vitest";
import { nextFid, parseFlow, serializeFlow, wrap } from "../src/lib/flow-parse.js";

describe("parseFlow", () => {
  it("parses node lines, outs, and notes", () => {
    const src = "Q start: 有神經學症狀？\n  有 -> a\n  沒有 -> b\n  * 補充\nA a: 處置";
    const f = parseFlow(src);
    expect(f.start).toBe("start");
    expect(f.nodes).toHaveLength(2);
    expect(f.nodes[0]).toMatchObject({
      id: "start",
      type: "Q",
      text: "有神經學症狀？",
      out: [
        { label: "有", to: "a" },
        { label: "沒有", to: "b" },
      ],
      notes: ["補充"],
    });
    expect(f.map.a.type).toBe("A");
  });
  it("supports unconditional out edges (no label)", () => {
    const f = parseFlow("A a: 處置\n  -> b\nR b: 結論");
    expect(f.nodes[0].out).toEqual([{ label: "", to: "b" }]);
  });
  it("returns an empty result for blank input", () => {
    expect(parseFlow("")).toEqual({ nodes: [], map: {}, start: null });
  });
});

describe("wrap", () => {
  it("counts CJK characters as double-width when wrapping", () => {
    const lines = wrap("一二三四五六七八", 4);
    expect(lines.join("")).toBe("一二三四五六七八");
    expect(lines.length).toBeGreaterThan(1);
  });
  it("returns a single empty-string line for empty input", () => {
    expect(wrap("", 10)).toEqual([""]);
  });
});

describe("serializeFlow / parseFlow round trip", () => {
  it("re-parses to an equivalent node list", () => {
    const src = "Q start: 有神經學症狀？\n  有 -> a\n  * 補充\nA a: 處置";
    const nodes = parseFlow(src).nodes;
    const roundTripped = parseFlow(serializeFlow(nodes)).nodes;
    expect(roundTripped).toEqual(nodes);
  });
});

describe("nextFid", () => {
  it("picks the first unused n<N> id", () => {
    expect(nextFid([{ id: "n1" }, { id: "n2" }])).toBe("n3");
  });
  it("fills a gap left by a deleted node", () => {
    expect(nextFid([{ id: "n1" }, { id: "n3" }])).toBe("n2");
  });
});
