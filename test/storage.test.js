import { describe, expect, it, vi } from "vitest";
import { load, STORAGE_KEY } from "../src/lib/storage.js";

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
    _store: store,
  };
}

describe("load", () => {
  it("returns an empty db when there is nothing stored yet", () => {
    const r = load(fakeStorage());
    expect(r).toEqual({ db: { format: "clinical-kb", version: 1, items: [] }, memOnly: false, quarantined: false });
  });

  it("returns the stored db unchanged when it looks valid", () => {
    const stored = { format: "clinical-kb", version: 1, items: [{ id: "a", title: "x", blocks: [] }] };
    const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
    const r = load(storage);
    expect(r).toEqual({ db: stored, memOnly: false, quarantined: false });
  });

  it("falls back to memOnly (not a crash) when the storage accessor itself throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    const r = load(storage);
    expect(r.memOnly).toBe(true);
    expect(r.db.items).toEqual([]);
  });

  it("falls back to an empty db and quarantines the raw value on invalid JSON, instead of throwing", () => {
    const storage = fakeStorage({ [STORAGE_KEY]: "{not json" });
    const r = load(storage);
    expect(r.quarantined).toBe(true);
    expect(r.db.items).toEqual([]);
    const quarantineKey = Object.keys(storage._store).find((k) => k.startsWith(`${STORAGE_KEY}.quarantine.`));
    expect(storage._store[quarantineKey]).toBe("{not json");
  });

  it("falls back to an empty db and quarantines the raw value when items isn't an array", () => {
    const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify({ format: "clinical-kb", version: 1 }) });
    const r = load(storage);
    expect(r.quarantined).toBe(true);
    expect(r.db.items).toEqual([]);
  });

  it("still loads data with an unexpected format/version, only warning about it", () => {
    const stored = { format: "something-else", version: 99, items: [] };
    const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = load(storage);
    expect(r.quarantined).toBe(false);
    expect(r.db).toEqual(stored);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("never throws when the storage accessor's setItem also throws during quarantine", () => {
    const storage = {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(() => load(storage)).not.toThrow();
  });
});
