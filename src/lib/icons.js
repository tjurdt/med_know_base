// 原創圖示：每種分頁類型用「淡色卡片＋主色卡片」兩層堆疊營造立體感，再用淺色線條
// 畫出可辨識的細節，取代 Stage 6b 沿用 Lucide 的純線條風格。顏色固定用 app 的
// accent/surf 色票（不用 currentColor），讓圖示在分頁列等不同狀態下都維持自己的
// 識別色，行為上比較接近原本的 emoji（顏色不隨文字狀態改變）。見 plan Stage 7d。
const card = (back, front) =>
  `<rect x="6" y="5" width="15" height="17" rx="3.5" fill="var(--accent-soft)"/><rect x="3" y="2" width="15" height="17" rx="3.5" fill="var(--accent)"/>${back || ""}${front || ""}`;
const wrap = (inner) => `<svg class="kicon" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

export const icons = {
  fileText: wrap(
    card(
      '',
      '<line x1="6.5" y1="7.2" x2="14.5" y2="7.2" stroke="var(--surf)" stroke-width="1.6" stroke-linecap="round"/><line x1="6.5" y1="10.6" x2="15" y2="10.6" stroke="var(--surf)" stroke-width="1.6" stroke-linecap="round" opacity=".75"/><line x1="6.5" y1="14" x2="11.5" y2="14" stroke="var(--surf)" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>',
    ),
  ),
  workflow: wrap(
    card(
      '',
      '<path d="M7 7 L10.5 14 M14 7 L10.5 14" stroke="var(--surf)" stroke-width="1.4" stroke-linecap="round" opacity=".85"/><circle cx="7" cy="7" r="1.7" fill="var(--surf)"/><circle cx="14" cy="7" r="1.7" fill="var(--surf)"/><circle cx="10.5" cy="14" r="1.7" fill="var(--surf)"/>',
    ),
  ),
  table: wrap(
    card(
      '',
      '<line x1="6" y1="7" x2="15" y2="7" stroke="var(--surf)" stroke-width="1.3" opacity=".85"/><line x1="6" y1="10.6" x2="15" y2="10.6" stroke="var(--surf)" stroke-width="1.3" opacity=".85"/><line x1="6" y1="14.2" x2="15" y2="14.2" stroke="var(--surf)" stroke-width="1.3" opacity=".85"/><line x1="9.3" y1="4" x2="9.3" y2="17" stroke="var(--surf)" stroke-width="1.3" opacity=".85"/>',
    ),
  ),
  image: wrap(
    card(
      '',
      '<rect x="5.5" y="6" width="9" height="7" rx="1.2" fill="var(--surf)" opacity=".9"/><circle cx="7.3" cy="8" r="1" fill="var(--accent)"/><path d="M5.5 12.3l2.3-2.3 1.5 1.5 2.2-2.6 2.5 3.4z" fill="var(--accent)" opacity=".9"/>',
    ),
  ),
  tag: wrap(
    '<rect x="6" y="5" width="15" height="17" rx="3.5" fill="var(--accent-soft)"/><path d="M4 3.5h9.5c.6 0 1.1.24 1.5.65l4 4.2c.8.85.8 2.2 0 3.05l-6.3 6.6a2.1 2.1 0 0 1-3.05 0L4 11.6z" fill="var(--accent)"/><circle cx="7.3" cy="7" r="1.3" fill="var(--surf)"/>',
  ),
  calculator: wrap(
    card(
      '',
      '<rect x="5" y="4" width="10" height="3.4" rx="1" fill="var(--surf)" opacity=".95"/><circle cx="6.2" cy="11" r="1.1" fill="var(--surf)" opacity=".9"/><circle cx="10" cy="11" r="1.1" fill="var(--surf)" opacity=".9"/><circle cx="13.8" cy="11" r="1.1" fill="var(--surf)" opacity=".9"/><circle cx="6.2" cy="14.6" r="1.1" fill="var(--surf)" opacity=".9"/><circle cx="10" cy="14.6" r="1.1" fill="var(--surf)" opacity=".9"/><circle cx="13.8" cy="14.6" r="1.1" fill="var(--surf)" opacity=".9"/>',
    ),
  ),
  refs: wrap(
    card(
      '',
      '<path d="M8 12a2.6 2.6 0 0 1 0-3.7l1-1a2.6 2.6 0 0 1 3.7 3.7" stroke="var(--surf)" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M13 8a2.6 2.6 0 0 1 0 3.7l-1 1a2.6 2.6 0 0 1-3.7-3.7" stroke="var(--surf)" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
    ),
  ),
  link: `<svg class="kicon" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
};
