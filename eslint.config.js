import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    // Pre-existing monolith, verbatim from clinical-kb-4.html (see plan Stage 0/1 at
    // ~/.claude/plans/snug-wishing-riddle.md). Its `if (m = re.match(...))` assignment-
    // in-condition style and similar patterns are intentional in the original code, not
    // bugs to fix here — this file gets split and cleaned up in later stages, not now.
    files: ["src/main.js"],
    rules: {
      "no-cond-assign": "off",
      "no-useless-escape": "off",
      "no-useless-assignment": "off",
      "no-empty": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
