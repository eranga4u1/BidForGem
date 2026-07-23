import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Lightweight flat config for the Next.js app. Deliberately NOT type-checked:
 * the typed rules used elsewhere are noisy against React/JSX, and `tsc --noEmit`
 * already provides full type safety for this package.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  { ignores: [".next/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  eslintConfigPrettier,
];
