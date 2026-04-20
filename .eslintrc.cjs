module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  settings: { react: { version: "detect" } },
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  rules: { "react/react-in-jsx-scope": "off" }
};
