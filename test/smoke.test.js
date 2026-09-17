import { describe, expect, it } from "vitest";

describe("toolchain smoke test", () => {
  it("runs under vitest with a jsdom environment", () => {
    expect(typeof document).toBe("object");
    expect(1 + 1).toBe(2);
  });
});
