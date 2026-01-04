import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/autoenv.ts"],
  format: ["esm"],
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "node18",
});
