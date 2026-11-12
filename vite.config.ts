import { cpSync } from "node:fs";
import { defineConfig } from "vitest/config";

const STATIC_PATHS = ["module.json", "lang", "templates", "styles", "LICENSE", "README.md"];

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    target: "es2022",
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "scripts/main.js",
    },
  },
  plugins: [
    {
      name: "copy-module-static",
      apply: "build",
      closeBundle() {
        for (const path of STATIC_PATHS) cpSync(path, `dist/${path}`, { recursive: true });
      },
    },
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
