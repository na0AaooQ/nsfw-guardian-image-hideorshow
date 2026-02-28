const enabledToggle  = document.getElementById('enabledToggle');
const thresholdRange = document.getElementById('thresholdRange');
const thresholdVal   = document.getElementById('thresholdVal');
const statusDiv      = document.getElementById('status');

chrome.storage.sync.get({ enabled: true, threshold: 0.3 }, (items) => {
  enabledToggle.checked    = items.enabled;
  thresholdRange.value     = items.threshold;
  thresholdVal.textContent = Math.round(items.threshold * 100) + '%';
  statusDiv.textContent    = items.enabled ? '✅ 動作中' : '⏸ 停止中';
});

thresholdRange.addEventListener('input', () => {
  thresholdVal.textContent = Math.round(parseFloat(thresholdRange.value) * 100) + '%';
  saveSettings();
});

enabledToggle.addEventListener('change', () => {
  statusDiv.textContent = enabledToggle.checked ? '✅ 動作中' : '⏸ 停止中';
  saveSettings();
});

function saveSettings() {
  const settings = { enabled: enabledToggle.checked, threshold: parseFloat(thresholdRange.value) };
  chrome.storage.sync.set(settings);
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', ...settings });
  });
}
