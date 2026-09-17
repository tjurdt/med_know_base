import { describe, expect, it } from "vitest";
import { htmlToMd, inlineMd, mdToHtml, renderText } from "../src/lib/markdown.js";
import { JSDOM } from "jsdom";

describe("inlineMd", () => {
  it("escapes HTML and applies bold markup", () => {
    expect(inlineMd("a **b** <c>")).toBe("a <strong>b</strong> &lt;c&gt;");
  });
});

describe("renderText", () => {
  it("turns # lines into h3 and others into p, skipping blank lines", () => {
    const html = renderText("# 標題\n內容一\n\n內容二");
    expect(html).toBe("<h3>標題</h3><p>內容一</p><p>內容二</p>");
  });
  it("shows a placeholder for empty input", () => {
    expect(renderText("")).toContain("尚無內容");
  });
});

describe("mdToHtml / htmlToMd round trip", () => {
  it("round-trips a heading and a bold paragraph", () => {
    const src = "# 標題\n一般 **粗體** 文字";
    const html = mdToHtml(src);
    const dom = new JSDOM(`<div>${html}</div>`);
    const back = htmlToMd(dom.window.document.querySelector("div"));
    expect(back).toBe(src);
  });
  it("represents a single empty line as an empty contenteditable div", () => {
    expect(mdToHtml("")).toBe("<div><br></div>");
  });
});
