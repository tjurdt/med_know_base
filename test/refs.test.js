import { describe, expect, it } from "vitest";
import { parseRefs, serializeRefs } from "../src/lib/refs.js";

describe("parseRefs", () => {
  it("parses one url-only line per entry", () => {
    expect(parseRefs("https://a.com\nhttps://b.com")).toEqual([
      { url: "https://a.com", label: "" },
      { url: "https://b.com", label: "" },
    ]);
  });
  it("parses a url with a label after a pipe", () => {
    expect(parseRefs("https://a.com | UpToDate")).toEqual([{ url: "https://a.com", label: "UpToDate" }]);
  });
  it("trims whitespace around the url and label", () => {
    expect(parseRefs("  https://a.com   |   UpToDate  ")).toEqual([{ url: "https://a.com", label: "UpToDate" }]);
  });
  it("skips blank lines and lines with no url", () => {
    expect(parseRefs("\nhttps://a.com\n\n | 沒有網址\n")).toEqual([{ url: "https://a.com", label: "" }]);
  });
  it("returns an empty array for empty/undefined input", () => {
    expect(parseRefs("")).toEqual([]);
    expect(parseRefs(undefined)).toEqual([]);
  });
});

describe("serializeRefs", () => {
  it("round-trips through parseRefs", () => {
    const list = [
      { url: "https://a.com", label: "" },
      { url: "https://b.com", label: "UpToDate" },
    ];
    expect(parseRefs(serializeRefs(list))).toEqual(list);
  });
  it("omits the pipe when there is no label", () => {
    expect(serializeRefs([{ url: "https://a.com", label: "" }])).toBe("https://a.com");
  });
  it("drops entries with no url", () => {
    expect(serializeRefs([{ url: "", label: "沒有網址" }, { url: "https://a.com", label: "" }])).toBe("https://a.com");
  });
});
