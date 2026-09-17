import { describe, expect, it } from "vitest";
import { renderFlowEditor, flowPreviewHtml } from "../src/ui/flow-editor.js";

// flowCache 用 blk.id 當快取鍵，每個測試給不同的 id 避免互相污染。
let n = 0;
const blk = (src) => ({ id: `test-flow-${n++}`, src });

describe("renderFlowEditor", () => {
  it("shows a warning when an out edge points to a nonexistent node id (typo'd in raw mode)", () => {
    const html = renderFlowEditor(blk("Q n1: 問題\n  選項 -> nosuchnode"));
    expect(html).toContain("找不到目標節點「nosuchnode」");
  });
  it("does not warn for a valid target", () => {
    const html = renderFlowEditor(blk("Q n1: 問題\n  選項 -> n2\nA n2: 處置"));
    expect(html).not.toContain("找不到目標節點");
  });
  it("shows the target's fuller text plus its id in the picker, not just a 16-char slice", () => {
    const html = renderFlowEditor(blk("Q n1: 問題\n  選項 -> n2\nA n2: 這是一段超過十六個字的節點文字內容用來確認顯示長度"));
    expect(html).toContain("這是一段超過十六個字的節點文字內容用來");
    expect(html).toContain("（n2）");
  });
  it("includes a live preview container with the rendered SVG in graphic mode", () => {
    const html = renderFlowEditor(blk("Q n1: 問題\n  選項 -> n2\nA n2: 處置"));
    expect(html).toContain("data-flowpreview=");
    expect(html).toContain("<svg");
  });
  it("does not render the preview in raw-text mode (the raw textarea shows the source directly instead)", () => {
    const b = blk("Q n1: 問題");
    // 模擬使用者切到原始碼模式：flowRaw 由 events.js 的 data-raw 分支設定，這裡直接
    // 動態 import store 來設定，避免測試依賴事件委派。
    return import("../src/store.js").then(({ state }) => {
      state.flowRaw[b.id] = true;
      const html = renderFlowEditor(b);
      expect(html).not.toContain("data-flowpreview=");
      expect(html).toContain("textarea");
    });
  });
});

describe("flowPreviewHtml", () => {
  it("matches renderFlowSvg's output for the same source", () => {
    const b = blk("Q n1: 問題\n  選項 -> n2\nA n2: 處置");
    expect(flowPreviewHtml(b)).toContain("<svg");
  });
});
