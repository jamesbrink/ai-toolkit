import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "prisma/**",
      "next-env.d.ts",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules (type-aware is too slow for large codebases)
  ...tseslint.configs.recommended,

  // React recommended (flat config)
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],

  // React Hooks
  reactHooksPlugin.configs["recommended-latest"],

  // Next.js recommended
  nextPlugin.flatConfig.recommended,

  // Prettier — must be last to override formatting rules
  eslintConfigPrettier,

  // Project-wide settings and rule overrides
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // Downgrade to warn — intentional ANSI escape stripping regex exists
      "no-control-regex": "warn",

      // Downgrade to warn — async executors exist in the cron worker
      "no-async-promise-executor": "warn",

      // Downgrade to warn — a few empty catch blocks exist intentionally
      "no-empty": "warn",
    },
  },

  // TypeScript file overrides — relax rules for this codebase
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Allow `any` — this codebase uses it extensively and migrating is a
      // separate effort.
      "@typescript-eslint/no-explicit-any": "off",

      // Unused vars: warn instead of error, allow underscore-prefixed vars
      // and rest siblings.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // Allow require() in Node-side code and dynamic imports
      "@typescript-eslint/no-require-imports": "off",

      // Allow empty interfaces/object types (common in Next.js page props)
      "@typescript-eslint/no-empty-object-type": "off",

      // Allow @ts-ignore — migrating to @ts-expect-error is a separate task
      "@typescript-eslint/ban-ts-comment": "off",

      // Downgrade — one expression statement exists that is not easily refactored
      "@typescript-eslint/no-unused-expressions": "warn",

      // TypeScript handles prop validation — prop-types is redundant
      "react/prop-types": "off",

      // Downgrade — quotes and apostrophes in JSX text are common and harmless
      "react/no-unescaped-entities": "warn",

      // Downgrade — false positive for onLoad on <video> elements
      "react/no-unknown-property": "warn",
    },
  },

  // Cron worker files — server-side Node.js, no React rules needed
  {
    files: ["cron/**/*.ts"],
    rules: {
      "react/no-unescaped-entities": "off",
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
);
