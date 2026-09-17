import { describe, expect, it } from "vitest";
import { calcValues, evalExpr, parseCalc } from "../src/lib/calc.js";

describe("parseCalc", () => {
  it("parses number/check/select fields plus expr/label/dec/band", () => {
    const src =
      "number cr: 肌酸酐 (mg/dL) = 1\ncheck dm: 糖尿病 = 1\nselect sex: 性別 | 男=0 | 女=1\n= SUM\nlabel 分數\ndec 1\nband 0-1: 低";
    const c = parseCalc(src);
    expect(c.fields).toEqual([
      { kind: "number", id: "cr", label: "肌酸酐", unit: "mg/dL", def: 1 },
      { kind: "check", id: "dm", label: "糖尿病", w: 1 },
      {
        kind: "select",
        id: "sex",
        label: "性別",
        opts: [
          { label: "男", value: 0 },
          { label: "女", value: 1 },
        ],
      },
    ]);
    expect(c.expr).toBe("SUM");
    expect(c.label).toBe("分數");
    expect(c.dec).toBe(1);
    expect(c.bands).toEqual([{ min: 0, max: 1, text: "低" }]);
  });

  it(
    "keeps a number field whose label itself contains '(' or '=' (Stage 3 fix: " +
      "the old regex made the whole field silently disappear instead of mis-parsing it)",
    () => {
      const c = parseCalc("number ratio: A(mg)/B(mg) 比值 = 1.5");
      expect(c.fields).toEqual([{ kind: "number", id: "ratio", label: "A(mg)/B(mg) 比值", unit: "", def: 1.5 }]);
    },
  );
  it("still parses unit and default when the label has no special characters", () => {
    const c = parseCalc("number wt: 體重 (kg) = 60");
    expect(c.fields[0]).toEqual({ kind: "number", id: "wt", label: "體重", unit: "kg", def: 60 });
  });
  it("handles a number field with only a label (no unit, no default)", () => {
    const c = parseCalc("number score: 分數");
    expect(c.fields[0]).toEqual({ kind: "number", id: "score", label: "分數", unit: "", def: "" });
  });
});

describe("evalExpr", () => {
  it("evaluates arithmetic with standard precedence", () => {
    expect(evalExpr("1+2*3", {})).toBe(7);
    expect(evalExpr("(1+2)*3", {})).toBe(9);
    expect(evalExpr("2^3^2", {})).toBe(2 ** (3 ** 2)); // right-assoc power
  });
  it("reads variables and treats missing ones as 0", () => {
    expect(evalExpr("a+b", { a: 5 })).toBe(5);
  });
  it("supports comparison/logical operators and if()", () => {
    expect(evalExpr("if(age>=65,1,0)", { age: 70 })).toBe(1);
    expect(evalExpr("if(age>=65,1,0)", { age: 40 })).toBe(0);
    expect(evalExpr("1 && 0 || 1", {})).toBe(1);
  });
  it("supports the documented math functions", () => {
    expect(evalExpr("round(3.6)", {})).toBe(4);
    expect(evalExpr("max(1,5,2)", {})).toBe(5);
    expect(evalExpr("pow(2,10)", {})).toBe(1024);
  });
  it("returns NaN for division by zero", () => {
    expect(evalExpr("1/0", {})).toBeNaN();
  });
});

describe("calcValues", () => {
  it("sums check/select/number fields into SUM by default", () => {
    const blk = { src: "check a: A = 1\ncheck b: B = 2\n= SUM", state: { a: true, b: false } };
    expect(calcValues(blk).raw).toBe(1);
  });
  it("uses a field's default when state has no entry yet, and initializes blk.state", () => {
    const blk = { src: "number wt: 體重 (kg) = 60\n= wt" };
    const { raw } = calcValues(blk);
    expect(raw).toBe(60);
    expect(blk.state).toEqual({});
  });
  it("reproduces the sample 矯正鈉需求量 formula", () => {
    const blk = {
      src: "number wt: 體重 (kg) = 60\nselect sex: 性別 | 男=0.6 | 女=0.5\nnumber target: 目標上升 (mmol/L) = 6\n= wt * sex * target",
      state: {},
    };
    expect(calcValues(blk).raw).toBe(216);
  });
});
