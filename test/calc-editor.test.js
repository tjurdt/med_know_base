import { beforeEach, describe, expect, it } from "vitest";
import { renderCalcEditor, calcFields, commitCalcFields, nextFieldId } from "../src/ui/calc-editor.js";
import { state } from "../src/store.js";

let n = 0;
const blk = (src) => ({ id: `test-calc-${n++}`, type: "calc", src });

beforeEach(() => {
  document.body.innerHTML = '<div id="list"></div><div id="mainInner"></div><div id="storageBanner" hidden></div>';
});

describe("nextFieldId", () => {
  it("picks the first unused f<N> id", () => {
    expect(nextFieldId([{ id: "f1" }, { id: "f2" }])).toBe("f3");
  });
  it("does not collide with a user-chosen id that happens to look the same", () => {
    expect(nextFieldId([{ id: "wt" }, { id: "f1" }])).toBe("f2");
  });
});

describe("renderCalcEditor", () => {
  it("highlights 圖形編輯, not 原始碼, in graphic mode", () => {
    const html = renderCalcEditor(blk("check a: A = 1\n= SUM"));
    expect(html).toMatch(/<button class="btn on" data-craw="0">圖形編輯<\/button><button class="btn" data-craw="1">/);
  });
  it("highlights 原始碼, not 圖形編輯, once switched to raw mode", () => {
    const b = blk("check a: A = 1\n= SUM");
    state.calcRaw[b.id] = true;
    const html = renderCalcEditor(b);
    expect(html).toMatch(/<button class="btn" data-craw="0">圖形編輯<\/button><button class="btn on" data-craw="1">/);
    expect(html).toContain("<textarea");
  });
  it("renders a card per field with the right kind highlighted", () => {
    const html = renderCalcEditor(
      blk("number wt: 體重 (kg) = 60\ncheck dm: 糖尿病 = 1\nselect sex: 性別 | 男=0 | 女=1\n= SUM"),
    );
    expect((html.match(/class="fnodecard/g) || []).length).toBe(4); // 3 個欄位卡片 + 1 個「計算與判讀」卡片
    expect(html).toContain('value="wt"');
    expect(html).toContain('value="體重"');
    expect(html).toContain('data-cfunit value="kg"');
    expect(html).toContain('data-cfdef value="60"');
    expect(html).toContain('data-cfweight value="1"');
    expect(html).toContain("data-cfoptlabel");
  });
  it("shows the formula, result label, dec, and bands in the summary card", () => {
    const html = renderCalcEditor(blk("check a: A = 1\n= SUM\nlabel 分數\ndec 1\nband 0-1: 低風險"));
    expect(html).toMatch(/data-cexpr value="SUM"/);
    expect(html).toMatch(/data-clabel value="分數"/);
    expect(html).toMatch(/data-cdec value="1"/);
    expect(html).toContain("低風險");
  });
});

describe("commitCalcFields", () => {
  it("serializes the (possibly edited) cached structure back into blk.src", () => {
    const b = blk("check a: A = 1\n= SUM\nlabel 結果");
    calcFields(b).fields[0].label = "改過的標籤";
    commitCalcFields(b, false);
    expect(b.src).toContain("改過的標籤");
  });
  it("round-trips through the editor for a newly-added select field", () => {
    const b = blk("= SUM");
    const c = calcFields(b);
    c.fields.push({ kind: "select", id: nextFieldId(c.fields), label: "性別", opts: [{ label: "男", value: 0 }] });
    commitCalcFields(b, true);
    expect(b.src).toContain("select f1: 性別 | 男=0");
  });
});
