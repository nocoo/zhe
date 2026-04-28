import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

// Extract only rule configs from typescript-eslint strict, skip plugin
// registration (already provided by next/typescript)
const strictRuleConfigs = tseslint.configs.strict.filter(
  (config) => !config.plugins && config.rules,
);

const eslintConfig = [
  { ignores: [".next/", "coverage/", "drizzle/", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Apply typescript-eslint strict rules (non-type-aware)
  ...strictRuleConfigs,
  {
    rules: {
      // Upgrade from warn to error
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Disabled — new rules introduced by eslint-plugin-react-hooks 7.x
      // (shipped with eslint-config-next 16). Existing code violates these
      // in ~15 places; treat as a separate cleanup task rather than mixing
      // refactors into the framework upgrade.
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
          selector: "CallExpression[callee.object.name=/^(describe|it|test)$/][callee.property.name='skip']",
          message: "*.skip is not allowed — every test must run.",
        },
        {
          selector: "CallExpression[callee.object.name=/^(describe|it|test)$/][callee.property.name='only']",
          message: "*.only is not allowed — it silently skips other tests.",
        },
      ],
    },
  },
];

export default eslintConfig;
