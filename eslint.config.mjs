import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated deploy/build artifacts and local scripts:
    ".open-next/**",
    "wrangler.jsonc.tmp-*",
    // Claude Code agent worktrees:
    ".claude/**",
    // One-off local Node scripts at the repo root (CommonJS):
    "*.js",
    // Capacitor native projects (contain generated bridge JS):
    "ios/**",
    "android/**",
  ]),
]);

export default eslintConfig;
