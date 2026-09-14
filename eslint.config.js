import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

// 环境 no-undef 修复依据：
// - vitest.config.js `test.globals: true` → 测试文件可直接用 describe/it/expect/vi；
//   vitest SSR transform 还向测试源码注入 __dirname。
// - server/scripts 与根配置文件运行在 Node。
// 三个 files 组合互不重叠；base（无 files）只承担规则与浏览器全局。
const testFiles = [
  'src/__tests__/**/*.js',
  'src/**/*.{test,spec}.{js,mjs}',
  'shared/**/*.{test,spec}.{js,mjs}',
  'electron/**/*.{test,spec}.{js,mjs}'
]
const nodeFiles = [
  'server/**/*.js',
  'scripts/**/*.{js,mjs,cjs}',
  'electron/**/*.js',
  '*.config.{js,mjs,cjs}',
  'vitest.setup.js'
]

export default [
  {
    ignores: ['node_modules/**', 'dist/**', '.git/**', 'docs/**', 'prototype/**', 'deploy/**']
  },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        // vite.config.js define 注入的构建身份白名单（src/utils/buildInfo.js 读取）
        __BUILD_INFO__: 'readonly'
      }
    },
    rules: {
      'no-console': 'warn',
      'no-debugger': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/no-setup-props-reactivity-warning': 'off',
      'vue/require-default-prop': 'off',
      'vue/require-explicit-emits': 'off'
      // 说明：曾同时启用 vue/component-tags-order 与 vue/block-order（同一顺序约束的两条规则，
      // 各 86 项 style 报错）。为避免为样式搬动数十个 Vue 文件，两条均不再强制。
    }
  },
  {
    files: testFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // vitest 运行时（globals:true）提供的测试 API 与模块级注入
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        suite: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        __dirname: 'readonly'
      }
    }
  },
  {
    files: nodeFiles,
    languageOptions: {
      globals: { ...globals.node }
    }
  }
]
