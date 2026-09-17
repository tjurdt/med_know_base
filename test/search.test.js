import { describe, expect, it } from "vitest";
import { blockText, hl, score } from "../src/lib/search.js";

describe("blockText", () => {
  it("strips flow syntax down to plain words", () => {
    const t = blockText({ type: "flow", src: "Q start: 有症狀？\n  有 -> a" });
    expect(t).not.toContain("->");
    expect(t).toContain("有症狀？");
  });
  it("strips calc keywords", () => {
    const t = blockText({ type: "calc", src: "number wt: 體重 = 60\n= wt" });
    expect(t).not.toMatch(/^number/m);
  });
});

describe("score", () => {
  const item = {
    title: "低血鈉 Hyponatremia",
    subtitle: "成人診斷",
    tags: ["電解質"],
    blocks: [
      { type: "keywords", src: "SIADH, 3% saline" },
      { type: "text", src: "先排除 pseudohyponatremia" },
    ],
  };
  it("scores a title match highest", () => {
    expect(score(item, ["低血鈉"]).s).toBe(10);
  });
  it("scores a keywords match next", () => {
    expect(score(item, ["siadh"]).s).toBe(6);
  });
  it("scores a block-body match lowest and reports the hit tab", () => {
    const r = score(item, ["pseudohyponatremia"]);
    expect(r.s).toBe(2);
    expect(r.hitTab).toBe(1);
  });
  it("requires every query term to hit something (AND semantics)", () => {
    expect(score(item, ["低血鈉", "nonexistentterm"]).s).toBe(0);
  });
});

describe("hl", () => {
  it("wraps every match in <mark>, escaping the rest", () => {
    expect(hl("a<b> test", ["test"])).toBe("a&lt;b&gt; <mark>test</mark>");
  });
  it("escapes regex special characters in the query", () => {
    expect(hl("3+2=5", ["+2"])).toBe("3<mark>+2</mark>=5");
  });
});
