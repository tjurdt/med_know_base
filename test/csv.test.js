import { describe, expect, it } from "vitest";
import { parseCsv, renderTable } from "../src/lib/csv.js";

describe("parseCsv", () => {
  it("splits rows/columns and drops blank rows", () => {
    expect(parseCsv("a,b\n\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("honors quoted fields containing commas and escaped quotes", () => {
    expect(parseCsv('x,"a, b","say ""hi"""')).toEqual([["x", "a, b", 'say "hi"']]);
  });
  it("treats tabs as a column separator too", () => {
    expect(parseCsv("a\tb\tc")).toEqual([["a", "b", "c"]]);
  });
});

describe("renderTable", () => {
  it("renders the first row as a header by default", () => {
    const html = renderTable("藥物,劑量\nA,10mg");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>藥物</th>");
    expect(html).toContain("<td>A</td>");
  });
  it("treats the first row as data when header is false", () => {
    const html = renderTable("A,10mg", false);
    expect(html).not.toContain("<thead>");
    expect(html).toContain("<td>A</td>");
  });
  it("pads short rows so every row has the same column count", () => {
    const html = renderTable("a,b,c\nx,y");
    const cells = [...html.matchAll(/<td>(.*?)<\/td>/g)].map((m) => m[1]);
    expect(cells).toEqual(["x", "y", ""]);
  });
  it("shows a placeholder when there is no data", () => {
    expect(renderTable("")).toContain("尚無資料");
  });
});
