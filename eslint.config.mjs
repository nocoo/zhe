import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Extract only rule configs from typescript-eslint strict, skip plugin
// registration (already provided by next/typescript via FlatCompat)
const strictRuleConfigs = tseslint.configs.strict.filter(
  (config) => !config.plugins && config.rules,
);

const eslintConfig = [
  { ignores: [".next/", "coverage/", "drizzle/", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Apply typescript-eslint strict rules (non-type-aware)
  ...strictRuleConfigs,
  {
    rules: {
      // Upgrade from warn to error
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
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
