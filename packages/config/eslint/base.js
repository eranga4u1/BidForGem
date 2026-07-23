// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Shared flat ESLint config for the Gem monorepo.
 * App/package configs import this and append framework-specific rules.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const base = [
  {
    ignores: ["dist/**", "build/**", ".next/**", ".expo/**", "coverage/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // Enforce the "no floats for money / explicit types" discipline.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    // Config and script files are not part of the typed project graph.
    files: ["**/*.config.{js,mjs,cjs,ts}", "**/*.cjs", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  eslintConfigPrettier,
];

export default base;
