import type { Config } from "prettier";

const config: Config = {
    /* General Settings */
    printWidth: 200,
    semi: true,
    endOfLine: "lf",
    trailingComma: "es5",
    arrowParens: "always",

    /* Quotes */
    singleQuote: false,

    /* Tabs & Indentation */
    tabWidth: 2,
    useTabs: false,

    /* Brackets & Spaces */
    bracketSpacing: true,
    bracketSameLine: true,

    /* Ranges & Pragmas */
    rangeStart: 0,
    rangeEnd: Infinity,

    /* Plugins: Sort Imports */
    plugins: ["@trivago/prettier-plugin-sort-imports"],
    importOrder: ["<BUILTIN_MODULES>", "<THIRD_PARTY_MODULES>", "^@/(.*)$", "^[./]"],
    importOrderSeparation: true,
    importOrderSortSpecifiers: true,
};

export default config;
