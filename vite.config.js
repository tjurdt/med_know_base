import { defineConfig } from "vite";

// Project is published at https://tjurdt.github.io/med_know_base/ (a GitHub Pages
// project site, not a user/org root site), so built asset URLs need that subpath
// prefix. The dev server keeps root "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/med_know_base/" : "/",
  build: {
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.js"],
  },
}));
