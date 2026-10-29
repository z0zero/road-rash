import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ".claude/**", "e2e/**", "out/**", ".next/**"],
    environment: "node",
    // Race tests simulate whole races, with their traffic, step by step: give them time on a busy machine.
    testTimeout: 30_000,
  },
});
