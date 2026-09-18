import { describe, expect, it, vi } from "vitest";
import { merge, normBlock, normCite, normSources, strip } from "../src/lib/data-io.js";

describe("strip", () => {
  it("keeps only non-empty optional fields", () => {
    expect(strip({ title: "t", blocks: [{ type: "text", title: "", desc: "", src: "" }] })).toEqual({
      title: "t",
      subtitle: "",
      tags: [],
      blocks: [{ type: "text" }],
    });
  });
  it("keeps strokes only when non-empty", () => {
    const stripped = strip({ title: "t", blocks: [{ type: "image", strokes: [{ c: "#000", w: 1, p: [[0, 0]] }] }] });
    expect(stripped.blocks[0].strokes).toHaveLength(1);
  });
  it("keeps a block's cite only when it has a url, and the item's sources only when non-empty", () => {
    const stripped = strip({
      title: "t",
      sources: [{ url: "https://example.com", label: "來源" }],
      blocks: [
        { type: "text", src: "x", cite: { url: "https://a.com", label: "A" } },
        { type: "text", src: "y", cite: { url: "" } },
      ],
    });
    expect(stripped.sources).toEqual([{ url: "https://example.com", label: "來源" }]);
    expect(stripped.blocks[0].cite).toEqual({ url: "https://a.com", label: "A" });
    expect(stripped.blocks[1].cite).toBeUndefined();
  });
  it("omits sources entirely when the item has none", () => {
    expect(strip({ title: "t", blocks: [] }).sources).toBeUndefined();
  });
});

describe("normCite", () => {
  it("accepts a bare url string", () => {
    expect(normCite("https://example.com")).toEqual({ url: "https://example.com", label: "" });
  });
  it("accepts {url,label}", () => {
    expect(normCite({ url: "https://example.com", label: "來源" })).toEqual({ url: "https://example.com", label: "來源" });
  });
  it("rejects empty/missing url instead of throwing", () => {
    expect(normCite("")).toBeUndefined();
    expect(normCite({ label: "沒有網址" })).toBeUndefined();
    expect(normCite(null)).toBeUndefined();
  });
});

describe("normSources", () => {
  it("filters out invalid entries and normalizes the rest", () => {
    expect(normSources(["https://a.com", { url: "" }, { url: "https://b.com", label: "B" }])).toEqual([
      { url: "https://a.com", label: "" },
      { url: "https://b.com", label: "B" },
    ]);
  });
  it("returns an empty array for non-array input instead of throwing", () => {
    expect(normSources(undefined)).toEqual([]);
    expect(normSources("not an array")).toEqual([]);
  });
});

describe("normBlock", () => {
  it("assigns an id and defaults an unknown type to text", () => {
    const b = normBlock({ type: "bogus", src: "x" });
    expect(b.type).toBe("text");
    expect(b.id).toBeTruthy();
  });
  it("joins an array src into a comma-separated string", () => {
    expect(normBlock({ type: "keywords", src: ["a", "b"] }).src).toBe("a, b");
  });
  it("defaults flow mode to page unless step is requested", () => {
    expect(normBlock({ type: "flow" }).mode).toBe("page");
    expect(normBlock({ type: "flow", mode: "step" }).mode).toBe("step");
  });
  it("is safe to use as a bare Array.map callback (no extra-arg surprises)", () => {
    // .map calls the callback with (item, index, array) - normBlock must ignore index/array.
    const blocks = [{ type: "text", src: "a" }, { type: "text", src: "b" }].map(normBlock);
    expect(blocks.map((b) => b.src)).toEqual(["a", "b"]);
  });
  it("carries a valid cite through, and drops an invalid one", () => {
    expect(normBlock({ type: "text", cite: { url: "https://a.com" } }).cite).toEqual({ url: "https://a.com", label: "" });
    expect(normBlock({ type: "text", cite: { label: "沒有網址" } }).cite).toBeUndefined();
  });
});

describe("merge", () => {
  const setup = () => ({ db: { items: [] }, save: vi.fn(), renderList: vi.fn() });

  it("adds new items and calls save/renderList", () => {
    const { db, save, renderList } = setup();
    const r = merge({ items: [{ title: "低血鈉", blocks: [] }] }, db, save, renderList);
    expect(r).toEqual({ total: 1, added: 1, updated: 0, keptAsNew: 0 });
    expect(db.items).toHaveLength(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(renderList).toHaveBeenCalledTimes(1);
  });
  it("ignores entries without a title", () => {
    const { db, save, renderList } = setup();
    const r = merge({ items: [{ blocks: [] }] }, db, save, renderList);
    expect(r.total).toBe(0);
    expect(db.items).toHaveLength(0);
  });
  it("accepts a bare array or a single item object, not just {items:[...]}", () => {
    const { db, save, renderList } = setup();
    expect(merge([{ title: "a", blocks: [] }], db, save, renderList).total).toBe(1);
    expect(merge({ title: "b", blocks: [] }, db, save, renderList).total).toBe(1);
    expect(db.items).toHaveLength(2);
  });
  it("updates an existing item in place when the imported entry carries its id", () => {
    const { db, save, renderList } = setup();
    merge({ items: [{ title: "低血鈉", blocks: [{ type: "text", src: "舊內容" }] }] }, db, save, renderList);
    const existingId = db.items[0].id;
    const r = merge(
      { items: [{ id: existingId, title: "低血鈉", blocks: [{ type: "text", src: "新內容" }] }] },
      db,
      save,
      renderList,
    );
    expect(r).toEqual({ total: 1, added: 0, updated: 1, keptAsNew: 0 });
    expect(db.items).toHaveLength(1);
    expect(db.items[0].blocks[0].src).toBe("新內容");
  });
  it("keeps a same-title-but-different-id import as a separate item instead of overwriting (Stage 3 fix)", () => {
    const { db, save, renderList } = setup();
    merge({ items: [{ title: "低血鈉", blocks: [{ type: "text", src: "舊內容" }] }] }, db, save, renderList);
    const r = merge({ items: [{ title: "低血鈉", blocks: [{ type: "text", src: "新內容" }] }] }, db, save, renderList);
    expect(r).toEqual({ total: 1, added: 0, updated: 0, keptAsNew: 1 });
    expect(db.items).toHaveLength(2);
    expect(db.items.map((i) => i.blocks[0].src)).toEqual(["舊內容", "新內容"]);
    expect(db.items[0].id).not.toBe(db.items[1].id);
  });
  it("normalizes sources on a newly-added item", () => {
    const { db, save, renderList } = setup();
    merge({ items: [{ title: "t", blocks: [], sources: ["https://a.com", { url: "" }] }] }, db, save, renderList);
    expect(db.items[0].sources).toEqual([{ url: "https://a.com", label: "" }]);
  });
  it("replaces sources on an update only when the imported entry provides them", () => {
    const { db, save, renderList } = setup();
    merge({ items: [{ title: "t", blocks: [], sources: ["https://a.com"] }] }, db, save, renderList);
    const id = db.items[0].id;
    merge({ items: [{ id, title: "t", blocks: [] }] }, db, save, renderList); // 沒帶 sources
    expect(db.items[0].sources).toEqual([{ url: "https://a.com", label: "" }]); // 維持原本的
    merge({ items: [{ id, title: "t", blocks: [], sources: [] }] }, db, save, renderList); // 明確清空
    expect(db.items[0].sources).toEqual([]);
  });
});
