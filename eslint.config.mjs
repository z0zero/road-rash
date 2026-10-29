import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import globals from "globals";

// The Race module is a pure, deterministic simulation (ADR 0004). These rules
// keep React, Three.js, Next.js, browser APIs and nondeterministic clocks or
// randomness out of it. See CODING_STANDARDS.md.
const RACE_FILES = ["src/race/**/*.ts"];
const RACE_PURITY =
  "The Race module is pure TypeScript (ADR 0004): no React, Three.js, Next.js or browser APIs.";
const RACE_DETERMINISM =
  "The Race module must be deterministic (ADR 0004): use the race's seeded random generator and its fixed 1/60 s step instead.";

const browserOnlyGlobals = Object.keys(globals.browser).filter(
  (name) => !(name in globals.es2024) && name !== "console",
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    files: RACE_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "react-dom", "three", "next", "postprocessing"].map((name) => ({
            name,
            message: RACE_PURITY,
          })),
          patterns: [
            {
              group: ["react/*", "react-dom/*", "three/*", "@react-three/*", "next/*", "postprocessing/*"],
              message: RACE_PURITY,
            },
          ],
        },
      ],
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/race",
              from: "./src",
              except: ["./race"],
              message: "The Race module imports nothing from the rest of the game; the game imports it.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...browserOnlyGlobals.map((name) => ({ name, message: RACE_PURITY })),
        { name: "globalThis", message: RACE_PURITY },
        { name: "Date", message: RACE_DETERMINISM },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: RACE_DETERMINISM },
        { object: "Date", property: "now", message: RACE_DETERMINISM },
        { object: "performance", property: "now", message: RACE_DETERMINISM },
      ],
    },
  },
]);

export default eslintConfig;
