import { describe, expect, it } from "vitest";
import { esc, uid } from "../src/lib/util.js";

describe("esc", () => {
  it("escapes HTML special characters", () => {
    expect(esc(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });
  it("treats null/undefined as empty string", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
  it("stringifies non-string input", () => {
    expect(esc(42)).toBe("42");
  });
});

describe("uid", () => {
  it("generates non-empty, distinct ids", () => {
    const a = uid();
    const b = uid();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
