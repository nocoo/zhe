import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  { ignores: [".next/", "coverage/", "drizzle/", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
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
