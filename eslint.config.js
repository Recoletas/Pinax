import js from '@eslint/js'
import vue from 'eslint-plugin-vue'

export default [
  {
    files: ['**/*.vue', '**/*.js', '**/*.mjs'],
    ignores: ['node_modules/**', 'dist/**', '.git/**']
  },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    rules: {
      'no-console': 'warn',
      'no-debugger': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/no-setup-props-reactivity-warning': 'off',
      'vue/require-default-prop': 'off',
      'vue/require-explicit-emits': 'off',
      'vue/component-tags-order': ['error', {
        order: ['script', 'template', 'style']
      }],
      'vue/block-order': ['error', {
        order: ['script', 'template', 'style']
      }]
    }
  }
]