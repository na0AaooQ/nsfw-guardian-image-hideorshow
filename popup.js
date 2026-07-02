const enabledToggle  = document.getElementById('enabledToggle');
const thresholdRange = document.getElementById('thresholdRange');
const thresholdVal   = document.getElementById('thresholdVal');
const levelBadge     = document.getElementById('levelBadge');
const levelDesc      = document.getElementById('levelDesc');
const statusDot      = document.getElementById('statusDot');
const statusText     = document.getElementById('statusText');
const toast          = document.getElementById('toast');
const languageSelect = document.getElementById('languageSelect');

const POPUP_MESSAGES = {
  ja: {
    title: '🛡️ がぞうみまもり | Xセンシティブ画像フィルター',
    filtering: 'フィルタリング',
    displayLanguage: '表示言語',
    languageAuto: '自動',
    languageJa: '日本語',
    languageEn: 'English',
    sensitivity: '感度設定',
    levelStrict: '厳しめ',
    levelBalanced: 'バランス',
    levelLoose: '緩め',
    descStrict: '水着・露出度の高い画像もブロックします',
    descBalanced: '明らかにセンシティブな画像をブロックします',
    descLoose: '非常に露骨な画像のみブロックします',
    active: '動作中',
    paused: '停止中',
    saved: '保存しました ✓'
  },
  en: {
    title: '🛡️ Gazou Mimamori | X Sensitive Image Filter',
    filtering: 'Filtering',
    displayLanguage: 'Display language',
    languageAuto: 'Auto',
    languageJa: 'Japanese',
    languageEn: 'English',
    sensitivity: 'Sensitivity',
    levelStrict: 'Strict',
    levelBalanced: 'Balanced',
    levelLoose: 'Loose',
    descStrict: 'Blocks swimwear and highly revealing images as well',
    descBalanced: 'Blocks clearly sensitive images',
    descLoose: 'Blocks only very explicit images',
    active: 'Active',
    paused: 'Paused',
    saved: 'Saved ✓'
  }
};

let currentLanguage = 'auto';

function normalizeLanguage(language) {
  return ['auto', 'ja', 'en'].includes(language) ? language : 'auto';
}

function getUILanguage() {
  if (typeof chrome === 'undefined' || !chrome.i18n) return '';
  if (typeof chrome.i18n.getUILanguage === 'function') {
    const uiLanguage = chrome.i18n.getUILanguage();
    if (uiLanguage) return uiLanguage;
  }
  if (typeof chrome.i18n.getMessage === 'function') {
    return chrome.i18n.getMessage('@@ui_locale') || '';
  }
  return '';
}

function resolveLanguage(language = currentLanguage) {
  const normalized = normalizeLanguage(language);
  if (normalized === 'ja' || normalized === 'en') return normalized;

  const uiLanguage = getUILanguage().toLowerCase().replace('_', '-');
  return uiLanguage === 'ja' || uiLanguage.startsWith('ja-') ? 'ja' : 'en';
}

function getPopupMessages(language = currentLanguage) {
  return POPUP_MESSAGES[resolveLanguage(language)] || POPUP_MESSAGES.en;
}

function applyI18n(language = currentLanguage) {
  currentLanguage = normalizeLanguage(language);
  const messages = getPopupMessages(currentLanguage);
  const resolvedLanguage = resolveLanguage(currentLanguage);

  if (document.documentElement) {
    document.documentElement.lang = resolvedLanguage;
  }

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (messages[key]) element.textContent = messages[key];
  });

  if (languageSelect) languageSelect.value = currentLanguage;
  if (toast) toast.textContent = messages.saved;
  if (thresholdRange) updateThresholdUI(parseFloat(thresholdRange.value));
  if (enabledToggle) updateStatusUI(enabledToggle.checked);
}

// 閾値に応じたレベル情報
function getLevelInfo(value, language = currentLanguage) {
  const messages = getPopupMessages(language);
  if (value <= 0.45) return {
    label: messages.levelStrict,
    cls: 'strict',
    desc: messages.descStrict
  };
  if (value <= 0.70) return {
    label: messages.levelBalanced,
    cls: 'balance',
    desc: messages.descBalanced
  };
  return {
    label: messages.levelLoose,
    cls: 'loose',
    desc: messages.descLoose
  };
}

// UIを閾値に合わせて更新
function updateThresholdUI(value) {
  const pct = Math.round(value * 100);
  thresholdVal.textContent = `${pct}%`;

  const info = getLevelInfo(value);
  levelBadge.textContent = info.label;
  levelBadge.className = `level-badge ${info.cls}`;
  levelDesc.textContent = info.desc;
}

// ステータス表示を更新
function updateStatusUI(enabled) {
  const messages = getPopupMessages(currentLanguage);
  if (enabled) {
    statusDot.classList.add('active');
    statusText.classList.add('active');
    statusText.textContent = messages.active;
  } else {
    statusDot.classList.remove('active');
    statusText.classList.remove('active');
    statusText.textContent = messages.paused;
  }
}

// 保存完了トーストを表示
let toastTimer = null;
function showToast() {
  toast.textContent = getPopupMessages(currentLanguage).saved;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
}

// 設定を読み込んでUIに反映
chrome.storage.sync.get({ enabled: true, threshold: 0.30, language: 'auto' }, (items) => {
  currentLanguage = normalizeLanguage(items.language);
  enabledToggle.checked = items.enabled;
  thresholdRange.value  = items.threshold;
  if (languageSelect) languageSelect.value = currentLanguage;
  applyI18n(currentLanguage);
  updateThresholdUI(items.threshold);
  updateStatusUI(items.enabled);
});

// スライダー操作
thresholdRange.addEventListener('input', () => {
  const value = parseFloat(thresholdRange.value);
  updateThresholdUI(value);
  saveSettings();
});

// トグル操作
enabledToggle.addEventListener('change', () => {
  updateStatusUI(enabledToggle.checked);
  saveSettings();
});

if (languageSelect) {
  languageSelect.addEventListener('change', () => {
    currentLanguage = normalizeLanguage(languageSelect.value);
    applyI18n(currentLanguage);
    saveSettings();
  });
}

// 設定保存 → タブへ通知
function saveSettings() {
  currentLanguage = normalizeLanguage(languageSelect ? languageSelect.value : currentLanguage);
  const settings = {
    enabled: enabledToggle.checked,
    threshold: parseFloat(thresholdRange.value),
    language: currentLanguage
  };
  chrome.storage.sync.set(settings, () => {
    showToast();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const result = chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', ...settings });
        if (result && typeof result.catch === 'function') {
          result.catch(() => {
            // 対象タブに content script がいない場合は通知失敗を無視する
          });
        }
      }
    });
  });
}

// ─── テスト用エクスポート ───
if (typeof module !== 'undefined') {
  module.exports = {
    getLevelInfo, updateThresholdUI, updateStatusUI, showToast, saveSettings,
    resolveLanguage, getPopupMessages, applyI18n
  };
}
