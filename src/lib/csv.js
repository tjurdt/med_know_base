import { inlineMd } from "./markdown.js";

/* ============================ CSV ============================ */
export function parseCsv(txt) {
  const rows = [];
  let row = [],
    f = "",
    q = false;
  const s = String(txt || "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") {
      row.push(f);
      f = "";
    } else if (c === "\n") {
      row.push(f);
      f = "";
      rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== "" || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
// parseCsv 的反函式：欄位含逗號、雙引號或換行才加雙引號包住，內部雙引號雙寫。
export function serializeCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(","),
    )
    .join("\n");
}
export function renderTable(src, header) {
  const rows = parseCsv(src);
  if (!rows.length) return '<p style="color:var(--ink-3)">（尚無資料，貼上 CSV 或讀入檔案）</p>';
  const w = Math.max(...rows.map((r) => r.length));
  const pad = (r) => {
    const c = r.slice();
    while (c.length < w) c.push("");
    return c;
  };
  let h = "";
  if (header !== false) {
    h =
      "<thead><tr>" +
      pad(rows[0])
        .map((c) => "<th>" + inlineMd(c.trim()) + "</th>")
        .join("") +
      "</tr></thead>";
    rows.shift();
  }
  const b =
    "<tbody>" +
    rows
      .map(
        (r) =>
          "<tr>" +
          pad(r)
            .map((c) => "<td>" + inlineMd(c.trim()) + "</td>")
            .join("") +
          "</tr>",
      )
      .join("") +
    "</tbody>";
  return '<div class="tbl"><table>' + h + b + "</table></div>";
}
