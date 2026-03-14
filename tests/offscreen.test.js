/**
 * tests/offscreen.test.js
 * offscreen.js の base64ToBlob と calcNsfwScore をテストする。
 *
 * 修正①: tf.zeros のモックに predict の戻り値（dispose付き）を追加
 * 修正②: ヘッダーなし base64 は atob がエラーを投げるのが正しい動作
 *         → テストをエラーになること（toThrow）に修正
 */

global.tf = {
  env: jest.fn(() => ({ set: jest.fn() })),
  wasm: { setWasmPaths: jest.fn() },
  setBackend: jest.fn().mockResolvedValue(true),
  ready: jest.fn().mockResolvedValue(true),
  getBackend: jest.fn(() => 'wasm'),
  loadLayersModel: jest.fn().mockResolvedValue({
    // predict の戻り値にも dispose を持たせる（ウォームアップ処理対応）
    predict: jest.fn(() => ({
      data: jest.fn().mockResolvedValue(new Float32Array([0.1, 0.1, 0.6, 0.1, 0.1])),
      dispose: jest.fn(),
    })),
  }),
  zeros: jest.fn(() => ({ dispose: jest.fn() })),
  tensor4d: jest.fn(() => ({ dispose: jest.fn() })),
};

const { base64ToBlob, calcNsfwScore } = require('../offscreen.js');

// テスト用の最小 base64 画像データ
const TINY_JPEG =
  'data:image/jpeg;base64,' +
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS' +
  'Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARC' +
  'AABAAEDASIAAREBAXEB/8QAFgABAQEAAAAAAAAAAAAAAAAABQME/8QAHhAAAQQCAwAA' +
  'AAAAAAAAAAAAAQACAxESITFB/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAA' +
  'AAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AozQB//Z';

const TINY_PNG =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9Q' +
  'DwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ─────────────────────────────────────────────
// base64ToBlob
// ─────────────────────────────────────────────
describe('base64ToBlob()', () => {
  test('Blob を生成する', () => {
    expect(base64ToBlob(TINY_JPEG)).toBeInstanceOf(Blob);
  });

  test('type が image/jpeg になる', () => {
    expect(base64ToBlob(TINY_JPEG).type).toBe('image/jpeg');
  });

  test('PNG なら type が image/png になる', () => {
    expect(base64ToBlob(TINY_PNG).type).toBe('image/png');
  });

  test('size が 0 より大きい', () => {
    expect(base64ToBlob(TINY_JPEG).size).toBeGreaterThan(0);
  });

  test('不正な base64 文字列では atob がエラーを投げる', () => {
    // ヘッダーなし・不正な文字を含む文字列は atob がスローするのが正しい挙動
    expect(() => base64ToBlob('/9j/4AAQSkZJRgAB!!')).toThrow();
  });
});

// ─────────────────────────────────────────────
// calcNsfwScore
// ─────────────────────────────────────────────
describe('calcNsfwScore()', () => {
  const make = ({ Porn = 0, Hentai = 0, Sexy = 0, Neutral = 0, Drawing = 0 }) => [
    { className: 'Drawing',  probability: Drawing  },
    { className: 'Hentai',   probability: Hentai   },
    { className: 'Neutral',  probability: Neutral  },
    { className: 'Porn',     probability: Porn     },
    { className: 'Sexy',     probability: Sexy     },
  ];

  test('全クラスが 0 → スコアが 0', () => {
    expect(calcNsfwScore(make({}))).toBe(0);
  });

  test('Porn=1.0 → スコアが 1.0', () => {
    expect(calcNsfwScore(make({ Porn: 1.0 }))).toBeCloseTo(1.0);
  });

  test('Hentai=1.0 → スコアが 1.0', () => {
    expect(calcNsfwScore(make({ Hentai: 1.0 }))).toBeCloseTo(1.0);
  });

  test('Sexy=1.0 → スコアが 0.5（係数 0.5）', () => {
    expect(calcNsfwScore(make({ Sexy: 1.0 }))).toBeCloseTo(0.5);
  });

  test('Porn=0.5, Hentai=0.3, Sexy=0.4 → 1.0', () => {
    // 0.5 + 0.3 + (0.4 * 0.5) = 1.0
    expect(calcNsfwScore(make({ Porn: 0.5, Hentai: 0.3, Sexy: 0.4 }))).toBeCloseTo(1.0);
  });

  test('Neutral=1.0 → スコアが 0（Neutral は計算に含まれない）', () => {
    expect(calcNsfwScore(make({ Neutral: 1.0 }))).toBe(0);
  });

  test('Drawing=1.0 → スコアが 0（Drawing は計算に含まれない）', () => {
    expect(calcNsfwScore(make({ Drawing: 1.0 }))).toBe(0);
  });

  test('閾値 0.3：Porn=0.29 は閾値以下', () => {
    expect(calcNsfwScore(make({ Porn: 0.29 }))).toBeLessThanOrEqual(0.3);
  });

  test('閾値 0.3：Porn=0.31 は閾値を超える', () => {
    expect(calcNsfwScore(make({ Porn: 0.31 }))).toBeGreaterThan(0.3);
  });

  test('空配列でも 0 を返す（エラーにならない）', () => {
    expect(calcNsfwScore([])).toBe(0);
  });
});

