import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli/cli.ts"],
  format: ["esm"],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "node18",
  minify: false,
});
