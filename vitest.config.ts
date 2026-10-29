import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ".claude/**", "e2e/**", "out/**", ".next/**"],
    environment: "node",
  },
});
