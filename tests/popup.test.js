/**
 * tests/popup.test.js
 * popup.js の設定UI ロジックをテストする。
 *
 * 修正: popup.js は require() 時点で DOM を参照するため、
 *       DOM セットアップを require() より前にトップレベルで実行する。
 */

// ① require より先に DOM を構築する（beforeAll では遅い）
document.body.innerHTML = `
  <input type="checkbox" id="enabledToggle" checked>
  <input type="range"    id="thresholdRange" min="0.30" max="0.90" step="0.05" value="0.30">
  <span  id="thresholdVal">30%</span>
  <span  class="level-badge" id="levelBadge">厳しめ</span>
  <div   id="levelDesc">説明</div>
  <div   class="status-dot active" id="statusDot"></div>
  <span  id="statusText" class="active">動作中</span>
  <div   id="toast"></div>
`;

// ② DOM 構築後に require する
const { getLevelInfo, updateThresholdUI, updateStatusUI } = require('../popup.js');

// ─────────────────────────────────────────────
// getLevelInfo
// ─────────────────────────────────────────────
describe('getLevelInfo()', () => {
  test('0.30 → 厳しめ (strict)', () => {
    const info = getLevelInfo(0.30);
    expect(info.label).toBe('厳しめ');
    expect(info.cls).toBe('strict');
  });
  test('0.45 → 厳しめ (境界値)', () => {
    expect(getLevelInfo(0.45).cls).toBe('strict');
  });
  test('0.50 → バランス (balance)', () => {
    expect(getLevelInfo(0.50).cls).toBe('balance');
  });
  test('0.70 → バランス (境界値)', () => {
    expect(getLevelInfo(0.70).cls).toBe('balance');
  });
  test('0.75 → 緩め (loose)', () => {
    expect(getLevelInfo(0.75).cls).toBe('loose');
  });
  test('0.90 → 緩め (最大値)', () => {
    expect(getLevelInfo(0.90).cls).toBe('loose');
  });
  test('各レベルで desc が空でない文字列を返す', () => {
    [0.30, 0.50, 0.75].forEach(v => {
      expect(getLevelInfo(v).desc).toBeTruthy();
    });
  });
});

// ─────────────────────────────────────────────
// updateThresholdUI
// ─────────────────────────────────────────────
describe('updateThresholdUI()', () => {
  test('0.30 → 表示が 30%', () => {
    updateThresholdUI(0.30);
    expect(document.getElementById('thresholdVal').textContent).toBe('30%');
  });
  test('0.65 → 表示が 65%', () => {
    updateThresholdUI(0.65);
    expect(document.getElementById('thresholdVal').textContent).toBe('65%');
  });
  test('0.90 → 表示が 90%', () => {
    updateThresholdUI(0.90);
    expect(document.getElementById('thresholdVal').textContent).toBe('90%');
  });
  test('バッジのクラスが更新される', () => {
    updateThresholdUI(0.30);
    expect(document.getElementById('levelBadge').className).toContain('strict');
    updateThresholdUI(0.60);
    expect(document.getElementById('levelBadge').className).toContain('balance');
    updateThresholdUI(0.80);
    expect(document.getElementById('levelBadge').className).toContain('loose');
  });
  test('バッジのテキストが更新される', () => {
    updateThresholdUI(0.30);
    expect(document.getElementById('levelBadge').textContent).toBe('厳しめ');
    updateThresholdUI(0.60);
    expect(document.getElementById('levelBadge').textContent).toBe('バランス');
    updateThresholdUI(0.80);
    expect(document.getElementById('levelBadge').textContent).toBe('緩め');
  });
  test('説明文が空でない', () => {
    [0.30, 0.60, 0.80].forEach(v => {
      updateThresholdUI(v);
      expect(document.getElementById('levelDesc').textContent).toBeTruthy();
    });
  });
});

// ─────────────────────────────────────────────
// updateStatusUI
// ─────────────────────────────────────────────
describe('updateStatusUI()', () => {
  test('enabled=true → ドットに active クラス', () => {
    updateStatusUI(true);
    expect(document.getElementById('statusDot').classList.contains('active')).toBe(true);
  });
  test('enabled=true → テキストが「動作中」', () => {
    updateStatusUI(true);
    expect(document.getElementById('statusText').textContent).toBe('動作中');
  });
  test('enabled=false → ドットの active クラスが消える', () => {
    updateStatusUI(false);
    expect(document.getElementById('statusDot').classList.contains('active')).toBe(false);
  });
  test('enabled=false → テキストが「停止中」', () => {
    updateStatusUI(false);
    expect(document.getElementById('statusText').textContent).toBe('停止中');
  });
  test('enabled=true → statusText に active クラス', () => {
    updateStatusUI(true);
    expect(document.getElementById('statusText').classList.contains('active')).toBe(true);
  });
  test('enabled=false → statusText の active クラスが消える', () => {
    updateStatusUI(false);
    expect(document.getElementById('statusText').classList.contains('active')).toBe(false);
  });
});
