"use strict";
import { initStore, setView, applySideCollapsed } from "./store.js";
import { $, toast } from "./ui/toast.js";
import { initEvents } from "./events.js";
import { rerender } from "./actions.js";

const { memOnly, quarantined } = initStore();
if (memOnly) document.getElementById("storageBanner").hidden = false;
if (quarantined) toast("本機資料格式看起來不對，已保留原始內容並改用空白知識庫");

initEvents();

/* 啟動 */
$("#specBox").textContent = document.getElementById("specSrc").textContent.trim();
setView("list");
applySideCollapsed();
rerender();
