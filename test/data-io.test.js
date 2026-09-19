import { describe, expect, it, vi } from "vitest";
import { merge, migrateLegacy, normBlock, normCite, normCites, strip } from "../src/lib/data-io.js";

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
  it("keeps a block's cites only when non-empty (array, not the old singular cite)", () => {
    const stripped = strip({
      title: "t",
      blocks: [
        { type: "text", src: "x", cites: [{ url: "https://a.com", label: "A" }] },
        { type: "text", src: "y", cites: [] },
      ],
    });
    expect(stripped.blocks[0].cites).toEqual([{ url: "https://a.com", label: "A" }]);
    expect(stripped.blocks[1].cites).toBeUndefined();
  });
  it("no longer emits an item-level sources field (replaced by the refs block type)", () => {
    expect(strip({ title: "t", sources: [{ url: "https://example.com" }], blocks: [] }).sources).toBeUndefined();
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

describe("normCites", () => {
  it("filters out invalid entries and normalizes the rest", () => {
    expect(normCites(["https://a.com", { url: "" }, { url: "https://b.com", label: "B" }])).toEqual([
      { url: "https://a.com", label: "" },
      { url: "https://b.com", label: "B" },
    ]);
  });
  it("returns an empty array for non-array input instead of throwing", () => {
    expect(normCites(undefined)).toEqual([]);
    expect(normCites("not an array")).toEqual([]);
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
  it("carries a valid cites array through, and drops invalid entries", () => {
    expect(normBlock({ type: "text", cites: ["https://a.com", { label: "沒有網址" }] }).cites).toEqual([
      { url: "https://a.com", label: "" },
    ]);
  });
  it("accepts a refs block's src (plain text) like any other type", () => {
    expect(normBlock({ type: "refs", src: "https://a.com | A" }).type).toBe("refs");
  });
  it("ignores the old Stage 6e singular cite field instead of crashing (importing an old-format file)", () => {
    const b = normBlock({ type: "text", cite: { url: "https://a.com" } });
    expect(b.cites).toBeUndefined();
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
  it("carries a block's cites array through on import", () => {
    const { db, save, renderList } = setup();
    merge({ items: [{ title: "t", blocks: [{ type: "text", src: "x", cites: ["https://a.com"] }] }] }, db, save, renderList);
    expect(db.items[0].blocks[0].cites).toEqual([{ url: "https://a.com", label: "" }]);
  });
  it("keeps at most one refs block per item, dropping extras instead of failing the import", () => {
    const { db, save, renderList } = setup();
    merge(
      {
        items: [
          {
            title: "t",
            blocks: [
              { type: "refs", src: "https://a.com" },
              { type: "text", src: "x" },
              { type: "refs", src: "https://b.com" },
            ],
          },
        ],
      },
      db,
      save,
      renderList,
    );
    const refsBlocks = db.items[0].blocks.filter((b) => b.type === "refs");
    expect(refsBlocks).toHaveLength(1);
    expect(refsBlocks[0].src).toBe("https://a.com");
  });
  it("silently ignores an old-format item.sources / block.cite import instead of crashing", () => {
    const { db, save, renderList } = setup();
    const r = merge(
      { items: [{ title: "t", sources: ["https://a.com"], blocks: [{ type: "text", cite: { url: "https://b.com" } }] }] },
      db,
      save,
      renderList,
    );
    expect(r.total).toBe(1);
    expect(db.items[0].sources).toBeUndefined();
    expect(db.items[0].blocks[0].cites).toBeUndefined();
  });
});

describe("migrateLegacy", () => {
  it("promotes an old singular block.cite into a cites array, keeping the original field", () => {
    const db = { items: [{ id: "1", title: "t", blocks: [{ id: "b1", type: "text", cite: { url: "https://a.com", label: "A" } }] }] };
    migrateLegacy(db);
    expect(db.items[0].blocks[0].cites).toEqual([{ url: "https://a.com", label: "A" }]);
    expect(db.items[0].blocks[0].cite).toEqual({ url: "https://a.com", label: "A" });
  });
  it("does not overwrite a cites array that already exists", () => {
    const db = {
      items: [
        { id: "1", title: "t", blocks: [{ id: "b1", type: "text", cite: { url: "https://old.com" }, cites: [{ url: "https://new.com", label: "" }] }] },
      ],
    };
    migrateLegacy(db);
    expect(db.items[0].blocks[0].cites).toEqual([{ url: "https://new.com", label: "" }]);
  });
  it("turns an old item.sources array into an auto-created refs block when there isn't one yet", () => {
    const db = { items: [{ id: "1", title: "t", sources: [{ url: "https://a.com", label: "A" }], blocks: [{ id: "b1", type: "text" }] }] };
    migrateLegacy(db);
    const refsBlocks = db.items[0].blocks.filter((b) => b.type === "refs");
    expect(refsBlocks).toHaveLength(1);
    expect(refsBlocks[0].src).toBe("https://a.com | A");
  });
  it("does not create a second refs block if one already exists", () => {
    const db = {
      items: [
        {
          id: "1",
          title: "t",
          sources: [{ url: "https://a.com" }],
          blocks: [{ id: "b1", type: "refs", src: "https://existing.com" }],
        },
      ],
    };
    migrateLegacy(db);
    const refsBlocks = db.items[0].blocks.filter((b) => b.type === "refs");
    expect(refsBlocks).toHaveLength(1);
    expect(refsBlocks[0].src).toBe("https://existing.com");
  });
  it("is a no-op on data with no legacy fields", () => {
    const db = { items: [{ id: "1", title: "t", blocks: [{ id: "b1", type: "text", src: "x" }] }] };
    migrateLegacy(db);
    expect(db.items[0].blocks).toEqual([{ id: "b1", type: "text", src: "x" }]);
  });
});
