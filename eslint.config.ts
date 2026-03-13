import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";
import importX from "eslint-plugin-import-x";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // ── 全局忽略 ──
  {
    ignores: ["dist/", "node_modules/", ".svp/", ".svp-blueprint-cache/"],
  },

  // ── 基础规则 ──
  eslint.configs.recommended,

  // ── TypeScript 严格模式（需要类型信息） ──
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ── unicorn：更严格的 JS/TS 规范 ──
  unicorn.configs["flat/recommended"],

  // ── import 排序和校验 ──
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    settings: {
      "import-x/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
    },
  },

  // ── 项目规则 ──
  {
    rules: {
      // TypeScript 严格化
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/prefer-readonly-parameter-types": "off", // 对第三方类型太严格，靠约定
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/method-signature-style": ["error", "property"],
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "function", format: ["camelCase"] },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        { selector: "parameter", format: ["camelCase"], leadingUnderscore: "allow" },
      ],

      // stylistic 的 non-nullable-type-assertion-style 要求用 !，和 strict 的 no-non-null-assertion 冲突
      "@typescript-eslint/no-non-null-assertion": "off",

      // unicorn 微调
      "unicorn/prevent-abbreviations": "off", // 允许 req, res 等常用缩写
      "unicorn/no-null": "off", // 我们的 API 需要 null
      "unicorn/filename-case": ["error", { case: "kebabCase" }],

      // import 规范
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "type",
          ],
          "newlines-between": "never",
          alphabetize: { order: "asc" },
        },
      ],
      "import-x/no-duplicates": "error",
      "import-x/no-cycle": "error",
      "import-x/no-self-import": "error",

      // 通用
      "no-console": "error",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // ── 测试文件放宽 ──
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-floating-promises": "off",
    },
  },

  // ── CLI 包放宽（命令行工具的输出方式就是 console） ──
  {
    files: ["packages/cli/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // ── Prettier 兜底（关闭所有格式规则） ──
  prettier,
);
