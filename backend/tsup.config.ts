import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/**/*.ts", "!src/**/*.d.ts"],
    outDir: "dist",
    format: ["esm"],
    target: "esnext",
    bundle: false,
    clean: true,
    sourcemap: true,

    onSuccess: "bun tsc-alias"
});
