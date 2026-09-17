/* ============================ 計算機 ============================ */
export function parseCalc(src) {
  const c = { fields: [], expr: "SUM", label: "結果", dec: 0, bands: [] };
  String(src || "")
    .split(/\r?\n/)
    .forEach((raw) => {
      const l = raw.trim();
      if (!l) return;
      let m;
      if ((m = l.match(/^number\s+([A-Za-z_][\w]*)\s*:\s*([^(=]*)(?:\(([^)]*)\))?\s*(?:=\s*(-?[\d.]+))?$/))) {
        c.fields.push({
          kind: "number",
          id: m[1],
          label: m[2].trim(),
          unit: (m[3] || "").trim(),
          def: m[4] !== undefined ? +m[4] : "",
        });
        return;
      }
      if ((m = l.match(/^check\s+([A-Za-z_][\w]*)\s*:\s*(.*?)\s*(?:=\s*(-?[\d.]+))?$/))) {
        c.fields.push({ kind: "check", id: m[1], label: m[2].trim(), w: m[3] !== undefined ? +m[3] : 1 });
        return;
      }
      if ((m = l.match(/^select\s+([A-Za-z_][\w]*)\s*:\s*([^|]*)\|(.*)$/))) {
        const opts = m[3]
          .split("|")
          .map((o) => {
            const p = o.split("=");
            return { label: p[0].trim(), value: +(p[1] || 0) };
          })
          .filter((o) => o.label);
        c.fields.push({ kind: "select", id: m[1], label: m[2].trim(), opts });
        return;
      }
      if ((m = l.match(/^=\s*(.+)$/))) {
        c.expr = m[1].trim();
        return;
      }
      if ((m = l.match(/^label\s+(.+)$/))) {
        c.label = m[1].trim();
        return;
      }
      if ((m = l.match(/^dec\s+(\d+)$/))) {
        c.dec = +m[1];
        return;
      }
      if ((m = l.match(/^band\s+(-?[\d.]+)\s*-\s*(-?[\d.]+)\s*:\s*(.+)$/))) {
        c.bands.push({ min: +m[1], max: +m[2], text: m[3].trim() });
        return;
      }
    });
  return c;
}

/* 安全運算式：遞迴下降，不用 eval */
export function evalExpr(src, vars) {
  let i = 0;
  const s = String(src);
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  const eat = (t) => {
    ws();
    if (s.startsWith(t, i)) {
      i += t.length;
      return true;
    }
    return false;
  };
  const F = {
    min: Math.min,
    max: Math.max,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    abs: Math.abs,
    sqrt: Math.sqrt,
    ln: Math.log,
    log: Math.log10,
    exp: Math.exp,
    pow: Math.pow,
  };
  function atom() {
    ws();
    if (eat("(")) {
      const v = or();
      eat(")");
      return v;
    }
    if (eat("-")) return -atom();
    if (eat("+")) return atom();
    let m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      return parseFloat(m[0]);
    }
    m = /^[A-Za-z_][\w]*/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      const name = m[0];
      if (eat("(")) {
        const args = [];
        if (!eat(")")) {
          do {
            args.push(or());
          } while (eat(","));
          eat(")");
        }
        if (name === "if") return args[0] ? args[1] : args[2];
        if (F[name]) return F[name].apply(null, args);
        return 0;
      }
      const v = vars[name];
      return typeof v === "number" && isFinite(v) ? v : 0;
    }
    i++;
    return 0;
  }
  function pow() {
    let a = atom();
    ws();
    if (eat("^")) return Math.pow(a, pow());
    return a;
  }
  function mul() {
    let a = pow();
    for (;;) {
      ws();
      if (eat("*")) a *= pow();
      else if (eat("/")) {
        const b = pow();
        a = b === 0 ? NaN : a / b;
      } else if (eat("%")) a %= pow();
      else return a;
    }
  }
  function add() {
    let a = mul();
    for (;;) {
      ws();
      if (eat("+")) a += mul();
      else if (eat("-")) a -= mul();
      else return a;
    }
  }
  function cmp() {
    let a = add();
    for (;;) {
      ws();
      if (eat(">=")) a = a >= add() ? 1 : 0;
      else if (eat("<=")) a = a <= add() ? 1 : 0;
      else if (eat("==")) a = a === add() ? 1 : 0;
      else if (eat("!=")) a = a !== add() ? 1 : 0;
      else if (eat(">")) a = a > add() ? 1 : 0;
      else if (eat("<")) a = a < add() ? 1 : 0;
      else return a;
    }
  }
  function and() {
    let a = cmp();
    for (;;) {
      ws();
      if (eat("&&")) a = a && cmp() ? 1 : 0;
      else return a;
    }
  }
  function or() {
    let a = and();
    for (;;) {
      ws();
      if (eat("||")) a = a || and() ? 1 : 0;
      else return a;
    }
  }
  const out = or();
  return isFinite(out) ? out : NaN;
}

export function calcValues(blk) {
  const c = parseCalc(blk.src);
  const st = (blk.state = blk.state || {});
  const vars = {};
  let sum = 0;
  c.fields.forEach((f) => {
    let v;
    if (f.kind === "check") v = st[f.id] ? f.w : 0;
    else if (f.kind === "select") v = st[f.id] !== undefined ? +st[f.id] : f.opts[0] ? f.opts[0].value : 0;
    else v = st[f.id] !== undefined && st[f.id] !== "" ? +st[f.id] : f.def === "" ? 0 : f.def;
    vars[f.id] = v;
    sum += v;
  });
  vars.SUM = sum;
  const raw = evalExpr(c.expr, vars);
  return { c, raw };
}
