import globals from 'globals';
import js from '@eslint/js';

export default [
  // ── 解析対象外ファイル ──────────────────────────────────────────────
  {
    ignores: [
      'models/**',       // browserifyバンドル済みファイル（自動生成）
      'node_modules/**', // 依存パッケージ
    ],
  },

  // ── ESLint 推奨ルールをベースとして適用 ─────────────────────────────
  js.configs.recommended,

  // ── 拡張機能本体ファイル（ブラウザ + Chrome拡張機能 環境） ──────────
  {
    files: ['content.js', 'background.js', 'popup.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs', // テスト用 module.exports エクスポートに対応
      globals: {
        ...globals.browser,  // document / window / MutationObserver 等
        chrome: 'readonly',  // Chrome拡張機能 API
      },
    },
    rules: {
      'no-console': 'off',                                 // デバッグログを許可
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prefer-const': 'warn',
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
    },
  },

  // ── offscreen.js（ブラウザ + Chrome拡張機能 + TensorFlow.js 環境） ──
  // tf は offscreen.html の <script> タグ経由で読み込まれるグローバル変数
  {
    files: ['offscreen.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        tf: 'readonly',      // TensorFlow.js（tf-wasm-bundle.js で定義）
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prefer-const': 'warn',
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
    },
  },

  // ── エントリーポイント（browserify バンドル用・Node.js 環境） ────────
  {
    files: ['entry.js', 'entry_wasm.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },

  // ── Jest設定ファイル（Node.js 環境） ─────────────────────────────────
  {
    files: ['jest.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',  // module.exports を使用
      globals: {
        ...globals.node,
      },
    },
  },

  // ── テストファイル（Jest / Node.js + jsdom 環境） ────────────────────
  // Jest は jsdom 環境で動作するため document / window 等も使用可能
  // chrome / tf はテスト内でモック定義されるグローバル変数
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,  // document / window（jsdom経由）
        ...globals.jest,     // describe / it / expect / beforeEach 等
        chrome: 'readonly',  // テスト内でモック定義
        tf: 'readonly',      // テスト内でモック定義
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
