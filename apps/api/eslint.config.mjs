import { base } from "@gem/config/eslint/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...base,
  {
    // NestJS controllers/gateways return many shapes and lean on framework
    // decorators; relax a couple of rules that fight that style.
    files: ["src/http/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  {
    // e2e tests drive supertest + socket.io-client, whose event/response
    // payloads are `any` by design. Relax the unsafe-* family here only.
    files: ["src/http/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },
];
