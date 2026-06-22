import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "@eslint-react/eslint-plugin";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importX from "eslint-plugin-import-x";
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
      // cli/ and worker/ are independent sub-projects with their own
      // package.json + linter (Biome for cli, separate eslint for worker).
      "cli/",
      "worker/",
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
  // React (JSX runtime warnings, key checks, deprecated APIs, RSC) via
  // @eslint-react/eslint-plugin — modern replacement for eslint-plugin-react
  // that natively supports ESLint 10 and React 19.
  reactPlugin.configs["recommended-typescript"],
  // Accessibility lint — eslint-plugin-jsx-a11y still works on ESLint 10
  // despite a stale `eslint: ^9` peer (no deprecated context APIs in its source).
  jsxA11y.flatConfigs.recommended,
  // import-x is the actively-maintained fork of eslint-plugin-import; the
  // original is still blocked on ESLint 10 support (import-js/eslint-plugin-import#3230).
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
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

      // ---- @eslint-react ruleset suppressions ----

      // Duplicates of eslint-plugin-react-hooks rules we already run.
      // eslint-plugin-react-hooks is the authoritative source — silence the
      // duplicate to avoid double-reporting.
      "@eslint-react/hooks-extra/no-direct-set-state-in-use-effect": "off",
      "@eslint-react/set-state-in-effect": "off",
      "@eslint-react/web-api/no-leaked-event-listener": "off",
      "@eslint-react/web-api/no-leaked-interval": "off",
      "@eslint-react/web-api/no-leaked-timeout": "off",

      // React 19 migration hints — we still ship a shadcn/ui surface built on
      // forwardRef + Context.Provider. Refactoring those is a separate effort
      // tracked outside the eslint upgrade.
      "@eslint-react/no-forward-ref": "off",
      "@eslint-react/no-use-context": "off",
      "@eslint-react/no-context-provider": "off",

      // Performance micro-optimization hints, not blockers.
      "@eslint-react/use-state": "off",
      "@eslint-react/no-array-index-key": "off",

      // SSR initial-data caches and module-level singletons intentionally
      // touch Date.now() / mutate state during render. Caught here would be
      // signal in greenfield code, noise in ours.
      "@eslint-react/purity": "off",

      // Test helpers spread props that may include `children`.
      "@eslint-react/jsx-no-children-prop": "off",

      // ---- import-x suppressions ----

      // typescript-eslint and several flat-config plugins document their API
      // as default + named on the same export; the warning is a false positive
      // for that pattern and is noisy in the eslint.config itself.
      "import-x/no-named-as-default-member": "off",
      "import-x/no-named-as-default": "off",
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
