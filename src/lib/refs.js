// 「參考連結」分頁（type:"refs"）的內容：純文字，一行一筆，格式
// <url>[ | <label>]，比照 csv.js/calc.js 的 parse/serialize 對稱模式，也方便
// AI 匯入直接寫文字。見 plan Stage 7c。
export function parseRefs(src) {
  return String(src || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("|");
      const url = (i === -1 ? line : line.slice(0, i)).trim();
      const label = i === -1 ? "" : line.slice(i + 1).trim();
      return { url, label };
    })
    .filter((r) => r.url);
}
export function serializeRefs(list) {
  return list
    .filter((r) => r.url)
    .map((r) => (r.label ? `${r.url} | ${r.label}` : r.url))
    .join("\n");
}
