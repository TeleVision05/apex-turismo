import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // engine-processor.js runs in the AudioWorkletGlobalScope (registerProcessor,
  // AudioWorkletProcessor, sampleRate are worklet globals, not browser/node ones)
  // and is shipped verbatim via a `?raw` import, so it is intentionally outside
  // the TS lint domain below.
  { ignores: ['dist', 'node_modules', 'tools', 'public', 'src/audio/worklet/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 75, skipBlankLines: true, skipComments: true }],
    },
  },
);
