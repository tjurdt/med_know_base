import { save } from "../store.js";

/* ============================ 圖片／塗鴉 ============================ */
export function drawStrokes(cv, strokes) {
  const ctx = cv.getContext("2d");
  const { width: W, height: H } = cv;
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = ctx.lineCap = "round";
  (strokes || []).forEach((s) => {
    ctx.strokeStyle = s.c;
    ctx.lineWidth = (s.w * Math.min(W, H)) / 600;
    ctx.beginPath();
    s.p.forEach((pt, i) => {
      const x = pt[0] * W,
        y = pt[1] * H;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    if (s.p.length === 1) ctx.arc(s.p[0][0] * W, s.p[0][1] * H, ctx.lineWidth / 2, 0, 7);
    ctx.stroke();
  });
}
export function mountCanvas(wrap, blk, editable) {
  const cv = wrap.querySelector("canvas");
  const img = wrap.querySelector("img");
  const size = () => {
    const r = wrap.getBoundingClientRect();
    cv.width = Math.max(300, Math.round(r.width));
    cv.height = Math.max(160, Math.round(r.height));
    drawStrokes(cv, blk.strokes);
  };
  if (img && !img.complete) img.onload = size;
  else size();
  new ResizeObserver(size).observe(wrap);
  if (!editable) return;
  let drawing = null;
  const scope = () => wrap.closest(".block");
  const tool = () => scope().querySelector("[data-tool].primary")?.dataset.tool || "pen";
  const color = () => scope().querySelector(".swatch.on")?.dataset.color || "#c8372c";
  const width = () => +(scope().querySelector("[data-width]")?.value || 4);
  const pt = (e) => {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    if (tool() === "erase") {
      const [x, y] = pt(e);
      const idx = (blk.strokes || []).findIndex((s) => s.p.some((p) => Math.hypot(p[0] - x, p[1] - y) < 0.025));
      if (idx >= 0) {
        blk.strokes.splice(idx, 1);
        drawStrokes(cv, blk.strokes);
        save();
      }
      return;
    }
    blk.strokes = blk.strokes || [];
    drawing = { c: color(), w: width(), p: [pt(e)] };
    blk.strokes.push(drawing);
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    drawing.p.push(pt(e));
    drawStrokes(cv, blk.strokes);
  });
  const stop = () => {
    if (drawing) {
      drawing = null;
      save();
    }
  };
  cv.addEventListener("pointerup", stop);
  cv.addEventListener("pointercancel", stop);
}
