import js from "@eslint/js";
import { defineConfig } from 'eslint/config';
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

export default defineConfig({
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
        import: importPlugin,
    },
    languageOptions: {
        parserOptions: {
            projectService: true,
            tsconfigRootDir: import.meta.dirname,
        },
    },
    rules: {
        "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
        "import/no-duplicates": ["error"],
        "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "separate-type-imports", disallowTypeAnnotations: true }],
        "@typescript-eslint/no-deprecated": "warn",
        "@typescript-eslint/no-empty-object-type": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
        "@typescript-eslint/no-unused-vars": "off",
    },
});
