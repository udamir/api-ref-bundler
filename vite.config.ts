import { defineConfig } from "vite-plus"

export default defineConfig({
  fmt: {
    semi: false,
    printWidth: 80,
    // match the previous Biome scope: only JS/TS sources are formatted
    ignorePatterns: ["**/*.{md,json,yaml,yml,html}", "temp/**", "bench/**"],
  },
  lint: {
    // the benchmark is a separate package with its own dependencies
    ignorePatterns: ["bench/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  pack: {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    minify: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
})
