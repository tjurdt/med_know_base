import { esc } from "./lib/util.js";
import { strip } from "./lib/data-io.js";
import { parseFlow } from "./lib/flow-parse.js";
import { calcValues } from "./lib/calc.js";
import { inlineMd, htmlToMd } from "./lib/markdown.js";
import { state, save, setView, itemById } from "./store.js";
import { $ } from "./ui/toast.js";
import { renderList } from "./ui/list.js";
import { renderMain } from "./ui/item.js";
import { fnodes, commitFlow, nextFid, flowPreviewHtml } from "./ui/flow-editor.js";
import { tableRows, commitTable } from "./ui/table-editor.js";
import { rerender, openItem, newItem, addBlock, copySpec, exportAll, doImport, download, loadSample } from "./actions.js";

export function initEvents() {
  /* ============================ 事件：統一委派 ============================ */
  document.addEventListener("click", (e) => {
    const t = e.target;
    const hit = (sel) => t.closest(sel);

    if (hit("[data-close]")) {
      const dl = t.closest("dialog");
      dl && dl.close();
      return;
    }
    if (hit("#newItem")) {
      newItem();
      $("#dlgPick").showModal();
      return;
    }
    if (hit("#importBtn")) {
      $("#importMsg").textContent = "";
      $("#dlgImport").showModal();
      return;
    }
    if (hit("#exportBtn")) {
      exportAll();
      return;
    }
    if (hit("#guideBtn")) {
      $("#dlgGuide").showModal();
      return;
    }
    if (hit("#pickJson")) {
      $("#fileJson").click();
      return;
    }
    if (hit("#doImport")) {
      doImport();
      return;
    }
    if (hit("#copySpec")) {
      copySpec();
      return;
    }
    if (hit("#loadSample")) {
      loadSample();
      return;
    }

    const open = hit("[data-open]");
    if (open) {
      openItem(open.dataset.open, +open.dataset.tab);
      return;
    }

    const kind = hit("[data-kind]");
    if (kind) {
      $("#dlgPick").close();
      addBlock(kind.dataset.kind);
      return;
    }

    const it = itemById(state.cur);
    if (!it) return;

    if (hit("[data-golist]")) {
      setView("list");
      renderList();
      return;
    }
    if (hit("[data-meta]")) {
      state.metaOpen = !state.metaOpen;
      renderMain();
      return;
    }
    if (hit("[data-flip]")) {
      state.onePage = !state.onePage;
      renderMain();
      return;
    }
    if (hit("[data-addblock]")) {
      $("#dlgPick").showModal();
      return;
    }
    const tb = hit(".tab");
    if (tb) {
      state.onePage = false;
      state.curTab = +tb.dataset.tab;
      renderMain();
      return;
    }
    if (hit("[data-tags]")) {
      const v = prompt("標籤（逗號分隔）", (it.tags || []).join(", "));
      if (v !== null) {
        it.tags = v
          .split(/[,、]/)
          .map((s) => s.trim())
          .filter(Boolean);
        save();
        rerender();
      }
      return;
    }
    if (hit("[data-exportitem]")) {
      download(it.title + ".json", JSON.stringify({ format: "clinical-kb", version: 1, items: [strip(it)] }, null, 1));
      return;
    }
    if (hit("[data-delitem]")) {
      if (confirm(`刪除「${it.title}」？無法復原。`)) {
        state.db.items = state.db.items.filter((x) => x.id !== it.id);
        state.cur = null;
        save();
        setView("list");
        rerender();
      }
      return;
    }

    const sec = t.closest(".block");
    if (!sec) return;
    const bi = +sec.dataset.bi,
      blk = it.blocks[bi];
    if (!blk) return;

    if (hit("[data-edit]")) {
      if (state.edit[blk.id] && blk.type === "flow") delete state.flowCache[blk.id];
      state.edit[blk.id] = !state.edit[blk.id];
      renderMain();
      return;
    }
    if (hit("[data-more]")) {
      state.tools[blk.id] = !state.tools[blk.id];
      renderMain();
      return;
    }
    if (hit("[data-del]")) {
      if (confirm("刪除這個分頁？")) {
        it.blocks.splice(bi, 1);
        save();
        if (state.curTab >= it.blocks.length) state.curTab = Math.max(0, it.blocks.length - 1);
        rerender();
      }
      return;
    }
    const mv = hit("[data-move]");
    if (mv) {
      const to = bi + +mv.dataset.move;
      if (to >= 0 && to < it.blocks.length) {
        it.blocks.splice(to, 0, it.blocks.splice(bi, 1)[0]);
        if (!state.onePage) state.curTab = to;
        save();
        renderMain();
      }
      return;
    }

    /* --- 流程圖：檢視 --- */
    const fm = hit("[data-fmode]");
    if (fm) {
      state.flowState[blk.id] = state.flowState[blk.id] || { path: [], at: parseFlow(blk.src).start };
      state.flowState[blk.id].mode = fm.dataset.fmode;
      blk.mode = fm.dataset.fmode;
      save();
      renderMain();
      return;
    }
    const go = hit("[data-go]");
    if (go) {
      const st = state.flowState[blk.id];
      st.path.push({ nodeId: st.at, label: go.dataset.lab });
      st.at = go.dataset.go;
      renderMain();
      return;
    }
    if (hit("[data-restart]")) {
      const st = state.flowState[blk.id];
      st.path = [];
      st.at = parseFlow(blk.src).start;
      renderMain();
      return;
    }
    if (hit("[data-back]")) {
      const st = state.flowState[blk.id];
      const p = st.path.pop();
      if (p) st.at = p.nodeId;
      renderMain();
      return;
    }

    /* --- 流程圖：編輯 --- */
    const raw = hit("[data-raw]");
    if (raw) {
      state.flowRaw[blk.id] = raw.dataset.raw === "1";
      delete state.flowCache[blk.id];
      renderMain();
      return;
    }
    const fadd = hit("[data-fadd]");
    if (fadd) {
      const ns = fnodes(blk);
      ns.push({ id: nextFid(ns), type: fadd.dataset.fadd, text: "", out: [], notes: [] });
      commitFlow(blk, true);
      return;
    }
    const card = t.closest(".fnodecard");
    if (card) {
      const ns = fnodes(blk),
        ni = ns.findIndex((n) => n.id === card.dataset.nid),
        n = ns[ni];
      if (n) {
        const ft = hit("[data-ftype]");
        if (ft) {
          n.type = ft.dataset.ftype;
          commitFlow(blk, true);
          return;
        }
        if (hit("[data-fdel]")) {
          ns.splice(ni, 1);
          ns.forEach((x) => (x.out = (x.out || []).filter((e) => e.to !== n.id)));
          commitFlow(blk, true);
          return;
        }
        if (hit("[data-fup]") && ni > 0) {
          ns.splice(ni - 1, 0, ns.splice(ni, 1)[0]);
          commitFlow(blk, true);
          return;
        }
        if (hit("[data-fdown]") && ni < ns.length - 1) {
          ns.splice(ni + 1, 0, ns.splice(ni, 1)[0]);
          commitFlow(blk, true);
          return;
        }
        if (hit("[data-oadd]")) {
          n.out = n.out || [];
          n.out.push({ label: "", to: "" });
          commitFlow(blk, true);
          return;
        }
        const od = hit("[data-odel]");
        if (od) {
          n.out.splice(+od.closest(".outrow").dataset.oi, 1);
          commitFlow(blk, true);
          return;
        }
      }
    }

    /* --- 其他區塊 --- */
    if (hit("[data-calcreset]")) {
      blk.state = {};
      save();
      renderMain();
      return;
    }
    if (hit("[data-toggleheader]")) {
      blk.header = blk.header === false ? true : false;
      save();
      renderMain();
      return;
    }

    /* --- 表格：格子編輯 --- */
    const traw = hit("[data-traw]");
    if (traw) {
      state.tableRaw[blk.id] = traw.dataset.traw === "1";
      delete state.tableCache[blk.id];
      renderMain();
      return;
    }
    if (hit("[data-addrow]")) {
      const rows = tableRows(blk);
      rows.push(new Array(rows[0].length).fill(""));
      commitTable(blk, true);
      return;
    }
    const delrow = hit("[data-delrow]");
    if (delrow) {
      const rows = tableRows(blk);
      if (rows.length > 1) rows.splice(+delrow.dataset.delrow, 1);
      commitTable(blk, true);
      return;
    }
    if (hit("[data-addcol]")) {
      tableRows(blk).forEach((r) => r.push(""));
      commitTable(blk, true);
      return;
    }
    const delcol = hit("[data-delcol]");
    if (delcol) {
      const rows = tableRows(blk);
      if (rows[0].length > 1) rows.forEach((r) => r.splice(+delcol.dataset.delcol, 1));
      commitTable(blk, true);
      return;
    }
    if (hit("[data-loadcsv]")) {
      state.pendingCsv = blk;
      $("#fileCsv").click();
      return;
    }
    if (hit("[data-loadimg]")) {
      state.pendingImg = blk;
      $("#fileImg").click();
      return;
    }
    if (hit("[data-clearimg]")) {
      blk.src = "";
      save();
      renderMain();
      return;
    }
    if (hit("[data-undo]")) {
      (blk.strokes || []).pop();
      save();
      renderMain();
      return;
    }
    if (hit("[data-clearink]")) {
      blk.strokes = [];
      save();
      renderMain();
      return;
    }
    const sw = hit(".swatch");
    if (sw) {
      sec.querySelectorAll(".swatch").forEach((x) => x.classList.remove("on"));
      sw.classList.add("on");
      return;
    }
    const tl = hit("[data-tool]");
    if (tl) {
      sec.querySelectorAll("[data-tool]").forEach((x) => x.classList.remove("on"));
      tl.classList.add("on");
      return;
    }
  });

  /* 文字工具列：保住選取範圍 */
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest("[data-wys]")) e.preventDefault();
  });
  document.addEventListener(
    "touchstart",
    (e) => {
      if (e.target.closest("[data-wys]")) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener("click", (e) => {
    const w = e.target.closest("[data-wys]");
    if (!w) return;
    const sec = w.closest(".block");
    const body = sec.querySelector("[data-wysbody]");
    if (!body) return;
    body.focus();
    const cmd = w.dataset.wys;
    try {
      if (cmd === "bold") document.execCommand("bold");
      else if (cmd === "h3") {
        const blockName = document.queryCommandValue ? document.queryCommandValue("formatBlock") : "";
        document.execCommand("formatBlock", false, /h3/i.test(blockName) ? "div" : "h3");
      } else {
        document.execCommand("formatBlock", false, "div");
        document.execCommand("removeFormat");
      }
    } catch {
      // execCommand 在部分瀏覽器/情境下可能拋錯，格式化本來就是「盡量而為」，
      // 失敗就維持原本內容，不用中斷後續的存檔。
    }
    const it = itemById(state.cur);
    if (!it) return;
    const blk = it.blocks[+sec.dataset.bi];
    blk.src = htmlToMd(body);
    save();
  });

  /* 輸入 */
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "q") {
      state.query = t.value;
      state.listSel = -1;
      renderList();
      return;
    }
    const it = itemById(state.cur);
    if (!it) return;
    const sec = t.closest(".block");
    if (!sec) return;
    const blk = it.blocks[+sec.dataset.bi];
    if (!blk) return;

    if (t.matches("[data-wysbody]")) {
      blk.src = htmlToMd(t);
      save();
      return;
    }
    if (t.matches("[data-src]")) {
      blk.src = t.value;
      if (blk.type === "flow") {
        delete state.flowCache[blk.id];
        state.flowState[blk.id] = null;
      }
      save();
      renderList();
      return;
    }
    if (t.matches("[data-cell]")) {
      tableRows(blk)[+t.dataset.row][+t.dataset.col] = t.value;
      commitTable(blk, false);
      return;
    }
    if (t.matches("[data-ftext],[data-fnote],[data-flabel],[data-fto]")) {
      const card = t.closest(".fnodecard");
      const ns = fnodes(blk),
        n = ns.find((x) => x.id === card.dataset.nid);
      if (!n) return;
      if (t.matches("[data-ftext]")) n.text = t.value;
      else if (t.matches("[data-fnote]"))
        n.notes = t.value
          .split(/[；;]/)
          .map((s) => s.trim())
          .filter(Boolean);
      else {
        const row = t.closest(".outrow"),
          e2 = n.out[+row.dataset.oi];
        if (t.matches("[data-flabel]")) e2.label = t.value;
        else e2.to = t.value;
      }
      commitFlow(blk, false);
      // commitFlow(blk,false) 刻意不整個重繪節點卡片列表（見上面的註解），預覽容器
      // 跟著同一個限制走，這裡直接局部更新它，不用等結構性操作才刷新。
      const preview = document.querySelector(`[data-flowpreview="${blk.id}"]`);
      if (preview) preview.innerHTML = flowPreviewHtml(blk);
      return;
    }
    const cid = t.dataset.cid;
    if (cid) {
      blk.state = blk.state || {};
      blk.state[cid] = t.type === "checkbox" ? t.checked : t.value;
      const box = t.closest(".calc").querySelector(".result");
      const { c, raw } = calcValues(blk);
      const band = c.bands.find((b) => raw >= b.min && raw <= b.max);
      box.innerHTML =
        `<div class="val">${isNaN(raw) ? "—" : raw.toFixed(c.dec)}</div>
      <div class="note">${esc(c.label)}</div>` + (band ? `<div class="band">${inlineMd(band.text)}</div>` : "");
      save();
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-fto]")) e.target.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener(
    "blur",
    (e) => {
      const t = e.target;
      if (!t.dataset || !t.dataset.field) return;
      const it = itemById(state.cur);
      if (!it) return;
      const v = t.textContent.trim();
      const sec = t.closest(".block");
      if (sec) {
        const blk = it.blocks[+sec.dataset.bi];
        if (blk) blk[t.dataset.field] = v;
      } else {
        it[t.dataset.field] = v || (t.dataset.field === "title" ? "未命名詞條" : "");
      }
      save();
      renderList();
    },
    true,
  );

  /* 鍵盤 */
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setView("list");
      const q = $("#q");
      q.focus();
      q.select();
      return;
    }
    if (e.target === $("#q")) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        state.listSel = Math.max(0, Math.min(state.shown.length - 1, state.listSel + (e.key === "ArrowDown" ? 1 : -1)));
        const els = [...document.querySelectorAll(".entry")];
        els.forEach((el, i) => el.classList.toggle("on", i === state.listSel));
        els[state.listSel] && els[state.listSel].scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.key === "Enter" && state.shown.length) {
        const pick = state.shown[Math.max(0, state.listSel)];
        openItem(pick.it.id, pick.hitTab);
        return;
      }
    }
    const step = document.querySelector(".step");
    if (step && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
      const n = +e.key;
      if (n >= 1 && n <= 9) {
        const btns = step.querySelectorAll(".opt");
        if (btns[n - 1]) {
          btns[n - 1].click();
          e.preventDefault();
        }
      }
    }
  });

  /* 檔案輸入 */
  $("#fileJson").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      $("#importText").value = r.result;
      doImport();
    };
    r.readAsText(f);
    e.target.value = "";
  });
  $("#fileCsv").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f || !state.pendingCsv) return;
    const r = new FileReader();
    r.onload = () => {
      state.pendingCsv.src = r.result;
      delete state.tableCache[state.pendingCsv.id]; // 換掉整份 src，快取要失效重新解析
      state.pendingCsv = null;
      save();
      rerender();
    };
    r.readAsText(f, "utf-8");
    e.target.value = "";
  });
  $("#fileImg").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f || !state.pendingImg) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1500,
          sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * sc);
        c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        state.pendingImg.src = c.toDataURL("image/jpeg", 0.85);
        state.pendingImg = null;
        save();
        renderMain();
      };
      img.onerror = () => {
        state.pendingImg.src = r.result;
        state.pendingImg = null;
        save();
        renderMain();
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
    e.target.value = "";
  });
}
