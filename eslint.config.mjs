import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-expressions": "off"
    },
  },
  {
    files: ["src/components/**/*.tsx", "src/App.tsx", "tests/**/*.ts", "src/data/**/*.ts", "src/services/realDataProviders.ts", "src/services/persistence.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-useless-assignment": "off",
      "prefer-const": "off",
      "no-constant-condition": "off"
    }
  },
  {
    ignores: ["dist/", "node_modules/", "fix_*.py"],
  }
);
