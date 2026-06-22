import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// typescript-eslint v8 strict (non type-aware). Drop the entries that only
// register the plugin — we register it ourselves below so the same plugin
// instance handles every file.
const strictRuleConfigs = tseslint.configs.strict.filter(
  (config) => !config.plugins && config.rules,
);

const eslintConfig = [
  {
    ignores: [
      ".next/",
      "coverage/",
      "drizzle/",
      "next-env.d.ts",
      "playwright-report/",
      "test-results/",
      ".test-storage/",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: "module" },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  ...strictRuleConfigs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Disabled — new rules introduced by eslint-plugin-react-hooks 7.x.
      // Existing code violates these in ~15 places; treat as a separate
      // cleanup task rather than mixing refactors into infra upgrades.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name=/^(describe|it|test)$/][callee.property.name='skip']",
          message: "*.skip is not allowed — every test must run.",
        },
        {
          selector:
            "CallExpression[callee.object.name=/^(describe|it|test)$/][callee.property.name='only']",
          message: "*.only is not allowed — it silently skips other tests.",
        },
      ],
    },
  },
];

export default eslintConfig;
