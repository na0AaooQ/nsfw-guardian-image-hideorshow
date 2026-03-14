const enabledToggle  = document.getElementById('enabledToggle');
const thresholdRange = document.getElementById('thresholdRange');
const thresholdVal   = document.getElementById('thresholdVal');
const levelBadge     = document.getElementById('levelBadge');
const levelDesc      = document.getElementById('levelDesc');
const statusDot      = document.getElementById('statusDot');
const statusText     = document.getElementById('statusText');
const toast          = document.getElementById('toast');

// 閾値に応じたレベル情報
function getLevelInfo(value) {
  if (value <= 0.45) return {
    label: '厳しめ',
    cls: 'strict',
    desc: '水着・露出度の高い画像もブロックします'
  };
  if (value <= 0.70) return {
    label: 'バランス',
    cls: 'balance',
    desc: '明らかにセンシティブな画像をブロックします'
  };
  return {
    label: '緩め',
    cls: 'loose',
    desc: '非常に露骨な画像のみブロックします'
  };
}

// UIを閾値に合わせて更新
function updateThresholdUI(value) {
  const pct = Math.round(value * 100);
  thresholdVal.textContent = pct + '%';

  const info = getLevelInfo(value);
  levelBadge.textContent = info.label;
  levelBadge.className = 'level-badge ' + info.cls;
  levelDesc.textContent = info.desc;
}

// ステータス表示を更新
function updateStatusUI(enabled) {
  if (enabled) {
    statusDot.classList.add('active');
    statusText.classList.add('active');
    statusText.textContent = '動作中';
  } else {
    statusDot.classList.remove('active');
    statusText.classList.remove('active');
    statusText.textContent = '停止中';
  }
}

// 保存完了トーストを表示
let toastTimer = null;
function showToast() {
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
}

// 設定を読み込んでUIに反映
chrome.storage.sync.get({ enabled: true, threshold: 0.30 }, (items) => {
  enabledToggle.checked = items.enabled;
  thresholdRange.value  = items.threshold;
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

// 設定保存 → タブへ通知
function saveSettings() {
  const settings = {
    enabled: enabledToggle.checked,
    threshold: parseFloat(thresholdRange.value)
  };
  chrome.storage.sync.set(settings, () => {
    showToast();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', ...settings }).catch(() => {});
      }
    });
  });
}
