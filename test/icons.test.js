import { describe, expect, it } from "vitest";
import { icons } from "../src/lib/icons.js";
import { KINDS } from "../src/lib/kinds.js";

describe("icons", () => {
  it("every icon is a well-formed inline svg using currentColor (no hardcoded color)", () => {
    for (const [name, svg] of Object.entries(icons)) {
      expect(svg, name).toContain('<svg class="kicon"');
      expect(svg, name).toContain('stroke="currentColor"');
      expect(svg, name).toContain("</svg>");
    }
  });
});

describe("KINDS", () => {
  it("every kind has a non-empty icon (catches a typo'd icons.<key> reference)", () => {
    for (const [type, k] of Object.entries(KINDS)) {
      expect(k.icon, type).toBeTruthy();
      expect(k.icon, type).toContain("<svg");
    }
  });
});
