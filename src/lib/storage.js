export const STORAGE_KEY = "clinical-kb.v1";

function emptyDb() {
  return { format: "clinical-kb", version: 1, items: [] };
}

// Loose validation on purpose (see plan Stage 3 / the playbook's "驗證要寧可寬鬆"
// principle): only reject shapes that would break every downstream db.items.find/map
// call. A JSON-parse failure or an unrecognized shape falls back to an empty db instead
// of throwing (which used to crash the whole app on startup), and the original raw
// value is quarantined under its own key instead of being discarded, in case it's
// worth recovering by hand later. An unexpected `format`/`version` only warns - it
// does not stop the data from loading.
export function load(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { db: emptyDb(), memOnly: true, quarantined: false };
  }
  if (!raw) return { db: emptyDb(), memOnly: false, quarantined: false };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    quarantine(storage, raw);
    return { db: emptyDb(), memOnly: false, quarantined: true };
  }
  if (!data || !Array.isArray(data.items)) {
    quarantine(storage, raw);
    return { db: emptyDb(), memOnly: false, quarantined: true };
  }
  if (data.format !== "clinical-kb") {
    console.warn(`clinical-kb: 未知的資料格式「${data.format}」，仍嘗試載入`);
  }
  if (data.version !== 1) {
    console.warn(`clinical-kb: 未知的資料版本 ${data.version}，仍嘗試載入`);
  }
  return { db: data, memOnly: false, quarantined: false };
}

function quarantine(storage, raw) {
  try {
    storage.setItem(`${STORAGE_KEY}.quarantine.${Date.now()}`, raw);
  } catch {
    // Storage itself is the problem (full/blocked) - nothing more we can do here;
    // the caller already falls back to an empty db so the app still starts.
  }
}
