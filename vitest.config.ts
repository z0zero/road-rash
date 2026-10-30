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
    // Race tests simulate races, with their traffic, step by step: give them time on a busy machine. Those that ride
    // whole races take far longer, and say so with a time limit of their own (`WHOLE_RACES` in the test helpers).
    testTimeout: 30_000,
  },
});
