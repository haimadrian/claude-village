// Flat ESLint config (ESLint 9+). Mirrors the previous .eslintrc.cjs behaviour:
//   - @typescript-eslint parser + recommended rules
//   - eslint-plugin-react recommended + react/react-in-jsx-scope off
//   - eslint-plugin-react-hooks recommended
//   - settings.react.version = "detect"
// react-hooks 4.x and @typescript-eslint 8.x recommended are legacy-style
// configs, so we use FlatCompat to translate them without changing semantics.

import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

export default [
  {
    ignores: [
      "out/**",
      "release/**",
      "dist/**",
      "node_modules/**",
      "reports/**",
      "playwright-report/**",
      "coverage/**",
      "_pages/**",
      ".worktrees/**",
    ],
  },
  js.configs.recommended,
  ...compat.extends("plugin:@typescript-eslint/recommended"),
  ...compat.extends("plugin:react-hooks/recommended"),
  reactPlugin.configs.flat.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react: reactPlugin,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
    },
  },
];
