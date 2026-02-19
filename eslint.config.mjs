import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["node_modules/", "client/"] },
  js.configs.recommended,
  {
    files: ["server/**/*.js"],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2022,
      sourceType: "commonjs",
    },
  },
  prettier,
];
