import { beforeEach, describe, expect, it } from "vitest";
import { renderTableEditor, tableRows, commitTable } from "../src/ui/table-editor.js";
import { state } from "../src/store.js";

let n = 0;
const blk = (src, extra) => ({ id: `test-table-${n++}`, type: "table", src, ...extra });

beforeEach(() => {
  // commitTable 會呼叫 save()/renderMain()/renderList()，這幾個都預期對應的 DOM
  // 容器存在。
  document.body.innerHTML = '<div id="list"></div><div id="mainInner"></div><div id="storageBanner" hidden></div>';
});

describe("tableRows", () => {
  it("pads every row to the widest row's column count", () => {
    const b = blk("a,b,c\nx,y");
    expect(tableRows(b)).toEqual([
      ["a", "b", "c"],
      ["x", "y", ""],
    ]);
  });
  it("gives a single empty cell for an empty table instead of an empty array", () => {
    expect(tableRows(blk(""))).toEqual([[""]]);
  });
  it("is cached - mutating the returned array persists across calls until src changes underneath it", () => {
    const b = blk("a,b");
    tableRows(b)[0][0] = "changed";
    expect(tableRows(b)[0][0]).toBe("changed");
  });
});

describe("commitTable", () => {
  it("serializes the (possibly edited) cached rows back into blk.src", () => {
    const b = blk("a,b");
    tableRows(b)[0][1] = "edited";
    commitTable(b, false);
    expect(b.src).toBe("a,edited");
  });
});

describe("renderTableEditor", () => {
  it("highlights the 格子編輯 toggle, not 原始碼, while in grid mode", () => {
    const html = renderTableEditor(blk("a,b"));
    expect(html).toMatch(/<button class="btn on" data-traw="0">格子編輯<\/button><button class="btn" data-traw="1">/);
  });
  it("highlights 原始碼, not 格子編輯, once switched to raw mode", () => {
    const b = blk("a,b");
    state.tableRaw[b.id] = true;
    const html = renderTableEditor(b);
    expect(html).toMatch(/<button class="btn" data-traw="0">格子編輯<\/button><button class="btn on" data-traw="1">/);
    expect(html).toContain("<textarea");
  });
  it("bolds the first row's cells when it's treated as a header", () => {
    const html = renderTableEditor(blk("藥物,劑量\nA,10mg"));
    expect(html).toMatch(/data-row="0" data-col="0" value="藥物" style="font-weight:650"/);
    expect(html).not.toMatch(/data-row="1"[^>]*style="font-weight:650"/);
  });
  it("does not bold any row when header is false", () => {
    const html = renderTableEditor(blk("A,10mg", { header: false }));
    expect(html).not.toContain("font-weight:650");
  });
  it("gives every column a delete button and offers add-row/add-column controls", () => {
    const html = renderTableEditor(blk("a,b,c"));
    expect((html.match(/data-delcol="\d"/g) || []).length).toBe(3);
    expect(html).toContain("data-addrow");
    expect(html).toContain("data-addcol");
  });
});
