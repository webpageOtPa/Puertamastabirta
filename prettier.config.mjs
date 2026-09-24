/** @type {import("prettier").Config} */
export default {
  plugins: ["prettier-plugin-astro"],
  printWidth: 100,
  singleQuote: false,
  trailingComma: "all",
  semi: true,
  overrides: [
    {
      files: ["*.astro"],
      options: { parser: "astro" },
    },
  ],
};
