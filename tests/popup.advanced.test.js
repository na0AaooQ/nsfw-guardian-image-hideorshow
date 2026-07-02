/**
 * tests/popup.advanced.test.js
 * showToast・saveSettings・スライダー/トグルイベントのテスト。
 */

// DOM セットアップ（require より前に実行）
document.body.innerHTML = `
  <h2 data-i18n="title">🛡️ がぞうみまもり | Xセンシティブ画像フィルター</h2>
  <span class="row-label" data-i18n="filtering">フィルタリング</span>
  <input type="checkbox" id="enabledToggle" checked>
  <span class="row-label" data-i18n="displayLanguage">表示言語</span>
  <select id="languageSelect">
    <option value="auto" data-i18n="languageAuto">自動</option>
    <option value="ja" data-i18n="languageJa">日本語</option>
    <option value="en" data-i18n="languageEn">English</option>
  </select>
  <div class="section-title" data-i18n="sensitivity">感度設定</div>
  <input type="range"    id="thresholdRange" min="0.30" max="0.90" step="0.05" value="0.65">
  <span data-i18n="levelStrict">厳しめ</span>
  <span data-i18n="levelBalanced">バランス</span>
  <span data-i18n="levelLoose">緩め</span>
  <span  id="thresholdVal">65%</span>
  <span  class="level-badge" id="levelBadge">バランス</span>
  <div   id="levelDesc">説明</div>
  <div   class="status-dot active" id="statusDot"></div>
  <span  id="statusText" class="active">動作中</span>
  <div   id="toast"></div>
`;

const { showToast, saveSettings, applyI18n } = require('../popup.js');

// ─────────────────────────────────────────────
// showToast
// ─────────────────────────────────────────────
describe('showToast()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    const toast = document.getElementById('toast');
    toast.classList.remove('show');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('呼び出し後にトーストに show クラスが付く', () => {
    showToast();
    expect(document.getElementById('toast').classList.contains('show')).toBe(true);
  });

  test('1500ms 後に show クラスが消える', () => {
    showToast();
    jest.advanceTimersByTime(1500);
    expect(document.getElementById('toast').classList.contains('show')).toBe(false);
  });

  test('1499ms ではまだ show クラスが残っている', () => {
    showToast();
    jest.advanceTimersByTime(1499);
    expect(document.getElementById('toast').classList.contains('show')).toBe(true);
  });

  test('連続して呼び出してもタイマーがリセットされる', () => {
    showToast();
    jest.advanceTimersByTime(1000);
    showToast(); // タイマーリセット
    jest.advanceTimersByTime(1000); // 合計2000ms でもまだ表示中
    expect(document.getElementById('toast').classList.contains('show')).toBe(true);
    jest.advanceTimersByTime(500); // さらに500ms → 合計1500ms
    expect(document.getElementById('toast').classList.contains('show')).toBe(false);
  });
});

// ─────────────────────────────────────────────
// saveSettings
// ─────────────────────────────────────────────
describe('saveSettings()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // chrome.tabs.sendMessage を Promise を返すように設定
    chrome.tabs.sendMessage.mockResolvedValue(undefined);
    document.getElementById('languageSelect').value = 'auto';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('chrome.storage.sync.set が呼ばれる', () => {
    saveSettings();
    expect(chrome.storage.sync.set).toHaveBeenCalled();
  });

  test('storage.set に enabled と threshold が渡される', () => {
    document.getElementById('enabledToggle').checked = true;
    document.getElementById('thresholdRange').value  = '0.65';
    document.getElementById('languageSelect').value   = 'auto';
    saveSettings();
    const [settings] = chrome.storage.sync.set.mock.calls[0];
    expect(settings.enabled).toBe(true);
    expect(settings.threshold).toBeCloseTo(0.65);
  });

  test('storage.set に language が含まれる', () => {
    document.getElementById('languageSelect').value = 'en';
    saveSettings();
    const [settings] = chrome.storage.sync.set.mock.calls[0];
    expect(settings.language).toBe('en');
  });

  test('enabled=false のとき storage.set に false が渡される', () => {
    document.getElementById('enabledToggle').checked = false;
    saveSettings();
    const [settings] = chrome.storage.sync.set.mock.calls[0];
    expect(settings.enabled).toBe(false);
    document.getElementById('enabledToggle').checked = true;
  });

  test('storage.set 完了後に chrome.tabs.query が呼ばれる', () => {
    saveSettings();
    // storage.set のコールバックが同期的に呼ばれるためすぐに確認できる
    expect(chrome.tabs.query).toHaveBeenCalledWith(
      { active: true, currentWindow: true },
      expect.any(Function)
    );
  });

  test('storage.set 完了後に chrome.tabs.sendMessage が呼ばれる', () => {
    saveSettings();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      1, // tabs[0].id = 1（setup.js のモック）
      expect.objectContaining({ type: 'UPDATE_SETTINGS' })
    );
  });

  test('sendMessage に enabled と threshold が含まれる', () => {
    document.getElementById('enabledToggle').checked = true;
    document.getElementById('thresholdRange').value  = '0.50';
    document.getElementById('languageSelect').value   = 'ja';
    saveSettings();
    const [, msg] = chrome.tabs.sendMessage.mock.calls[0];
    expect(msg.type).toBe('UPDATE_SETTINGS');
    expect(msg.enabled).toBe(true);
    expect(msg.threshold).toBeCloseTo(0.50);
    expect(msg.language).toBe('ja');
  });
});

// ─────────────────────────────────────────────
// スライダー input イベント
// ─────────────────────────────────────────────
describe('thresholdRange input イベント', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    chrome.tabs.sendMessage.mockResolvedValue(undefined);
    document.getElementById('languageSelect').value = 'auto';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('スライダーを動かすと thresholdVal の表示が更新される', () => {
    const range = document.getElementById('thresholdRange');
    range.value = '0.80';
    range.dispatchEvent(new Event('input'));
    expect(document.getElementById('thresholdVal').textContent).toBe('80%');
  });

  test('スライダーを動かすと saveSettings（storage.set）が呼ばれる', () => {
    const range = document.getElementById('thresholdRange');
    range.value = '0.45';
    range.dispatchEvent(new Event('input'));
    expect(chrome.storage.sync.set).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// トグル change イベント
// ─────────────────────────────────────────────
describe('enabledToggle change イベント', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    chrome.tabs.sendMessage.mockResolvedValue(undefined);
    document.getElementById('languageSelect').value = 'auto';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('トグルを OFF にするとステータスが「停止中」になる', () => {
    const toggle = document.getElementById('enabledToggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(document.getElementById('statusText').textContent).toBe('停止中');
  });

  test('トグルを ON にするとステータスが「動作中」になる', () => {
    const toggle = document.getElementById('enabledToggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(document.getElementById('statusText').textContent).toBe('動作中');
  });

  test('トグル変更で saveSettings（storage.set）が呼ばれる', () => {
    const toggle = document.getElementById('enabledToggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(chrome.storage.sync.set).toHaveBeenCalled();
    toggle.checked = true;
  });
});

// ─────────────────────────────────────────────
// languageSelect change イベント
// ─────────────────────────────────────────────
describe('languageSelect change イベント', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    chrome.tabs.sendMessage.mockResolvedValue(undefined);
    applyI18n('auto');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('言語を en に変更すると英語表示になり保存される', () => {
    const select = document.getElementById('languageSelect');
    select.value = 'en';
    select.dispatchEvent(new Event('change'));

    expect(document.querySelector('[data-i18n="filtering"]').textContent).toBe('Filtering');
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' }),
      expect.any(Function)
    );
  });

  test('言語変更の UPDATE_SETTINGS に language が含まれる', () => {
    const select = document.getElementById('languageSelect');
    select.value = 'ja';
    select.dispatchEvent(new Event('change'));

    const [, msg] = chrome.tabs.sendMessage.mock.calls[0];
    expect(msg).toEqual(expect.objectContaining({ type: 'UPDATE_SETTINGS', language: 'ja' }));
  });
});
