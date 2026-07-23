import { base } from "@gem/config/eslint/base";

/**
 * Root ESLint flat config. Individual apps/packages extend `@gem/config/eslint/base`
 * with their own framework rules; this root config covers repo-level tooling files.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  ...base,
  {
    ignores: ["apps/**", "packages/**", "**/dist/**", "**/.next/**", "**/.expo/**"],
  },
];
